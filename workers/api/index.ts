/**
 * JSON API for Crop Top Wardrobe, replacing PocketBase.
 *
 *   POST   /api/auth/signup     { email, password, name }  → { token, user }
 *   POST   /api/auth/login      { email, password }        → { token, user }
 *   POST   /api/auth/logout
 *   GET    /api/auth/me                                    → { user }
 *   GET    /api/garments                                   → Garment[]
 *   POST   /api/garments        multipart form             → Garment  (colors, mood, vibe, weather may repeat)
 *   DELETE /api/garments/:id
 *   GET    /api/outfits                                    → Outfit[]
 *   POST   /api/outfits         { title, items }           → Outfit  (items may carry a `place` on the doll)
 *   DELETE /api/outfits/:id
 *   GET    /api/avatar                                     → Avatar | null
 *   PUT    /api/avatar          { bodyType, hairColor, eyeColor, skinColor, figure? } → Avatar
 *   POST   /api/avatar/photo    multipart form with `image` (already cut out) → Avatar
 *   DELETE /api/avatar/photo                              → Avatar (back to the collage figure)
 *   GET    /api/files/:key                                 → image bytes
 *   GET    /api/health
 *
 * Every data route acts only on the signed-in user's own rows, the same rule the
 * PocketBase collections enforced (`@request.auth.id = owner`).
 */
import { hashPassword, newId, newSessionToken, sha256, verifyAgainstDummy, verifyPassword } from './auth.ts';
import { deleteFile, getFile, maxImageBytes, putFile, sniffImageType } from './storage.ts';
import type { ApiEnv, User } from './types.ts';

// ───────────────────────── allowed values (match the UI and the old schema) ─────────────────────────
const CATEGORIES = ['head', 'torso', 'legs', 'feet', 'accessory'];
const COLORS = ['black', 'white', 'grey', 'red', 'pink', 'orange', 'yellow', 'green', 'blue', 'purple', 'brown', 'beige', 'silver', 'gold', 'multi'];
const MOODS = ['confident', 'lazy', 'playful', 'rebellious', 'cozy', 'bold', 'soft', 'mysterious', 'happy', 'moody'];
const VIBES = ['punk', 'preppy', 'streetwear', 'y2k', 'grunge', 'minimal', 'sporty', 'romantic', 'festival', 'office'];
const WEATHER = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'hot', 'cold', 'mild', 'stormy', 'layering'];
const BODY_TYPES = ['female', 'male'];
const HAIR = ['black', 'brown', 'blonde', 'red', 'pink', 'blue', 'purple', 'white', 'grey', 'green'];
const EYES = ['brown', 'blue', 'green', 'hazel', 'grey', 'black', 'amber'];
const SKIN = ['light', 'fair', 'tan', 'olive', 'brown', 'deep'];
const FIGURES = ['collage', 'photo'];

const SESSION_DAYS = 30;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_OUTFIT_ITEMS = 12;
// g/<garment id>/… for clothing, a/<user id>/… for avatar photos
const FILE_KEY = /^[ga]\/[a-z0-9]{15}\/[a-z0-9]{20}\.(jpg|png|gif|webp)$/;

// ───────────────────────── responses ─────────────────────────
const API_HEADERS: Record<string, string> = {
	'Cache-Control': 'no-store',
	'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
	'Referrer-Policy': 'no-referrer',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
};

const json = (value: unknown, status = 200, extra: Record<string, string> = {}) =>
	new Response(JSON.stringify(value), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...API_HEADERS, ...extra },
	});

class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

const fail = (status: number, message: string): never => {
	throw new HttpError(status, message);
};

// ───────────────────────── rate limiting (login / signup) ─────────────────────────
// Per-isolate memory, like the old in-process limiter: it slows down password
// guessing without costing any D1 writes. For a hard global limit, add Cloudflare's
// Rate Limiting rules on /api/auth/* in the dashboard.
const AUTH_LIMIT = 20;
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; reset: number }>();

function checkRateLimit(request: Request): void {
	const ip = request.headers.get('cf-connecting-ip') || 'unknown';
	const now = Date.now();
	const entry = attempts.get(ip);
	if (!entry || entry.reset < now) {
		attempts.set(ip, { count: 1, reset: now + AUTH_WINDOW_MS });
		if (attempts.size > 10_000) attempts.clear();
		return;
	}
	entry.count += 1;
	if (entry.count > AUTH_LIMIT) fail(429, 'Too many attempts. Wait a few minutes and try again.');
}

// ───────────────────────── request helpers ─────────────────────────
async function readJson(request: Request): Promise<Record<string, unknown>> {
	const length = Number(request.headers.get('content-length'));
	if (Number.isFinite(length) && length > MAX_JSON_BYTES) fail(413, 'Request body too large');
	const text = await request.text();
	if (text.length > MAX_JSON_BYTES) fail(413, 'Request body too large');
	try {
		const value = JSON.parse(text);
		if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
	} catch {
		// fall through
	}
	return fail(400, 'Invalid JSON body');
}

const str = (value: unknown, field: string, { min = 1, max = 120 } = {}): string => {
	const s = typeof value === 'string' ? value.trim() : '';
	if (s.length < min || s.length > max) fail(400, `${field} must be ${min}-${max} characters`);
	return s;
};

const oneOf = (value: unknown, allowed: string[], field: string): string => {
	if (typeof value !== 'string' || !allowed.includes(value)) fail(400, `${field} is not a valid option`);
	return value as string;
};

/** One or more distinct allowed values, e.g. every `mood` field of a form. */
const manyOf = (values: unknown[], allowed: string[], field: string, max = allowed.length): string[] => {
	const picked = [...new Set(values.map(String))];
	if (picked.length < 1 || picked.length > max || picked.some((v) => !allowed.includes(v))) {
		fail(400, `Pick at least one ${field.toLowerCase()} from the list`);
	}
	return picked;
};

const num = (value: unknown, min: number, max: number, field: string): number => {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
		fail(400, `${field} must be a number from ${min} to ${max}`);
	}
	return Math.round((value as number) * 100) / 100;
};

const now = () => new Date().toISOString();

/** Reads and checks the `image` field of a multipart form. */
async function readImage(request: Request, env: ApiEnv): Promise<{ form: FormData; bytes: Uint8Array; kind: { type: string; ext: string } }> {
	const limit = maxImageBytes(env);
	const tooBig = `That photo is too big. Keep it under ${(limit / 1_000_000).toFixed(1)} MB.`;
	const length = Number(request.headers.get('content-length'));
	if (Number.isFinite(length) && length > limit + 64 * 1024) fail(413, tooBig);
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return fail(400, 'Expected a multipart form');
	}
	const file = form.get('image');
	if (!file || typeof file === 'string') return fail(400, 'Choose an image to add');
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (bytes.byteLength === 0) fail(400, 'That image is empty');
	if (bytes.byteLength > limit) fail(413, tooBig);
	const kind = sniffImageType(bytes) ?? fail(400, 'Use a JPG, PNG, WebP or GIF image');
	return { form, bytes, kind };
}

// ───────────────────────── auth ─────────────────────────
async function startSession(env: ApiEnv, user: User) {
	const token = newSessionToken();
	const expires = Date.now() + SESSION_DAYS * 86_400_000;
	await env.DB.batch([
		env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires < ?').bind(user.id, Date.now()),
		env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires, created) VALUES (?, ?, ?, ?)').bind(
			await sha256(token),
			user.id,
			expires,
			now(),
		),
	]);
	return { token, expires, user };
}

function bearer(request: Request): string | null {
	const header = request.headers.get('authorization') || '';
	const match = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(header);
	return match ? match[1] : null;
}

async function currentUser(request: Request, env: ApiEnv): Promise<User | null> {
	const token = bearer(request);
	if (!token) return null;
	return env.DB.prepare(
		`SELECT u.id, u.email, u.name, u.created FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = ? AND s.expires > ?`,
	)
		.bind(await sha256(token), Date.now())
		.first<User>();
}

async function requireUser(request: Request, env: ApiEnv): Promise<User> {
	return (await currentUser(request, env)) ?? fail(401, 'Sign in to continue');
}

async function signup(request: Request, env: ApiEnv) {
	checkRateLimit(request);
	const body = await readJson(request);
	const email = str(body.email, 'Email', { max: 254 }).toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address');
	const password = typeof body.password === 'string' ? body.password : '';
	if (password.length < 8 || password.length > 256) fail(400, 'Password must be at least 8 characters');
	const name = str(body.name ?? '', 'Name', { min: 0, max: 100 });

	const user: User = { id: newId(), email, name, created: now() };
	try {
		await env.DB.prepare('INSERT INTO users (id, email, name, password_hash, created) VALUES (?, ?, ?, ?, ?)')
			.bind(user.id, user.email, user.name, await hashPassword(password), user.created)
			.run();
	} catch (error) {
		if (String(error).includes('UNIQUE')) fail(400, 'An account with that email already exists');
		throw error;
	}
	return json(await startSession(env, user), 201);
}

async function login(request: Request, env: ApiEnv) {
	checkRateLimit(request);
	const body = await readJson(request);
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	const password = typeof body.password === 'string' ? body.password : '';
	const row = await env.DB.prepare('SELECT id, email, name, created, password_hash FROM users WHERE email = ?')
		.bind(email)
		.first<User & { password_hash: string }>();
	const ok = row ? await verifyPassword(password, row.password_hash) : await verifyAgainstDummy(password);
	if (!row || !ok) fail(400, 'That email and password do not match');
	const { password_hash: _, ...user } = row!;
	return json(await startSession(env, user));
}

async function logout(request: Request, env: ApiEnv) {
	const token = bearer(request);
	if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
	return json({ ok: true });
}

// ───────────────────────── garments ─────────────────────────
type GarmentRow = {
	id: string;
	name: string;
	category: string;
	colors: string;
	moods: string;
	vibes: string;
	weathers: string;
	image: string;
	created: string;
};

const garmentOut = (g: GarmentRow) => ({
	id: g.id,
	name: g.name,
	category: g.category,
	colors: JSON.parse(g.colors) as string[],
	moods: JSON.parse(g.moods) as string[],
	vibes: JSON.parse(g.vibes) as string[],
	weathers: JSON.parse(g.weathers) as string[],
	image: g.image,
	imageUrl: `/api/files/${g.image}`,
	created: g.created,
});

async function listGarments(user: User, env: ApiEnv) {
	const { results } = await env.DB.prepare(
		'SELECT id, name, category, colors, moods, vibes, weathers, image, created FROM garments WHERE owner = ? ORDER BY created DESC, rowid DESC',
	)
		.bind(user.id)
		.all<GarmentRow>();
	return json(results.map(garmentOut));
}

async function createGarment(request: Request, user: User, env: ApiEnv) {
	const { form, bytes, kind } = await readImage(request, env);

	const category = oneOf(form.get('category'), CATEGORIES, 'Category');
	const name = str(form.get('name') || category, 'Name');
	const colors = manyOf(form.getAll('colors'), COLORS, 'Color');
	const moods = manyOf(form.getAll('mood'), MOODS, 'Mood');
	const vibes = manyOf(form.getAll('vibe'), VIBES, 'Vibe');
	const weathers = manyOf(form.getAll('weather'), WEATHER, 'Weather');

	const id = newId();
	const key = `g/${id}/${newId(20)}.${kind.ext}`;
	await putFile(env, key, user.id, bytes, kind.type);

	const row: GarmentRow = {
		id,
		name,
		category,
		colors: JSON.stringify(colors),
		moods: JSON.stringify(moods),
		vibes: JSON.stringify(vibes),
		weathers: JSON.stringify(weathers),
		image: key,
		created: now(),
	};
	try {
		await env.DB.prepare(
			`INSERT INTO garments (id, owner, name, category, colors, mood, vibe, weather, moods, vibes, weathers, image, created)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			// mood/vibe/weather keep the first pick, for anything still reading the old columns
			.bind(row.id, user.id, row.name, row.category, row.colors, moods[0], vibes[0], weathers[0], row.moods, row.vibes, row.weathers, row.image, row.created)
			.run();
	} catch (error) {
		await deleteFile(env, key).catch(() => {});
		throw error;
	}
	return json(garmentOut(row), 201);
}

async function deleteGarment(id: string, user: User, env: ApiEnv) {
	const row = await env.DB.prepare('SELECT image FROM garments WHERE id = ? AND owner = ?').bind(id, user.id).first<{ image: string }>();
	if (!row) fail(404, 'Not found');
	await env.DB.prepare('DELETE FROM garments WHERE id = ? AND owner = ?').bind(id, user.id).run();
	await deleteFile(env, row!.image);
	return json({ ok: true });
}

// ───────────────────────── outfits ─────────────────────────
type OutfitRow = { id: string; title: string; items: string; created: string };
const outfitOut = (o: OutfitRow) => ({ id: o.id, title: o.title, items: JSON.parse(o.items), created: o.created });

async function listOutfits(user: User, env: ApiEnv) {
	const { results } = await env.DB.prepare('SELECT id, title, items, created FROM outfits WHERE owner = ? ORDER BY created DESC, rowid DESC')
		.bind(user.id)
		.all<OutfitRow>();
	return json(results.map(outfitOut));
}

async function createOutfit(request: Request, user: User, env: ApiEnv) {
	const body = await readJson(request);
	const title = str(body.title, 'Title');
	if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_OUTFIT_ITEMS) {
		fail(400, `An outfit needs 1-${MAX_OUTFIT_ITEMS} pieces`);
	}
	const items = (body.items as unknown[]).map((raw) => {
		const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
		const image = typeof item.image === 'string' ? item.image : '';
		if (image && !FILE_KEY.test(image.replace(/^\/api\/files\//, ''))) fail(400, 'Invalid outfit item image');
		// Where the piece sits on the doll, in % of the stage (optional for older clients).
		const p = item.place && typeof item.place === 'object' ? (item.place as Record<string, unknown>) : null;
		const place = p
			? {
					x: num(p.x, -50, 150, 'place.x'),
					y: num(p.y, -50, 150, 'place.y'),
					w: num(p.w, 2, 200, 'place.w'),
					r: num(p.r, -360, 360, 'place.r'),
					z: Math.round(num(p.z, 0, 100, 'place.z')),
				}
			: undefined;
		return {
			id: str(item.id, 'Item id', { max: 32 }),
			name: str(item.name, 'Item name'),
			category: oneOf(item.category, CATEGORIES, 'Item category'),
			image,
			...(place ? { place } : {}),
		};
	});
	const row: OutfitRow = { id: newId(), title, items: JSON.stringify(items), created: now() };
	await env.DB.prepare('INSERT INTO outfits (id, owner, title, items, created) VALUES (?, ?, ?, ?, ?)')
		.bind(row.id, user.id, row.title, row.items, row.created)
		.run();
	return json(outfitOut(row), 201);
}

async function deleteOutfit(id: string, user: User, env: ApiEnv) {
	const { meta } = await env.DB.prepare('DELETE FROM outfits WHERE id = ? AND owner = ?').bind(id, user.id).run();
	if (!meta.changes) fail(404, 'Not found');
	return json({ ok: true });
}

// ───────────────────────── avatar ─────────────────────────
type AvatarRow = {
	id: string;
	body_type: string;
	hair_color: string;
	eye_color: string;
	skin_color: string;
	figure: string;
	photo: string | null;
	updated: string;
};
const avatarOut = (a: AvatarRow) => ({
	id: a.id,
	bodyType: a.body_type,
	hairColor: a.hair_color,
	eyeColor: a.eye_color,
	skinColor: a.skin_color,
	figure: a.figure,
	photoUrl: a.photo ? `/api/files/${a.photo}` : null,
	updated: a.updated,
});
const AVATAR_SELECT = 'SELECT id, body_type, hair_color, eye_color, skin_color, figure, photo, updated FROM avatars WHERE owner = ?';
const AVATAR_DEFAULTS = ['female', 'brown', 'brown', 'fair'];

const loadAvatar = (user: User, env: ApiEnv) => env.DB.prepare(AVATAR_SELECT).bind(user.id).first<AvatarRow>();

async function getAvatar(user: User, env: ApiEnv) {
	const row = await loadAvatar(user, env);
	return json(row ? avatarOut(row) : null);
}

async function saveAvatar(request: Request, user: User, env: ApiEnv) {
	const body = await readJson(request);
	const values = [
		oneOf(body.bodyType, BODY_TYPES, 'Body type'),
		oneOf(body.hairColor, HAIR, 'Hair color'),
		oneOf(body.eyeColor, EYES, 'Eye color'),
		oneOf(body.skinColor, SKIN, 'Skin color'),
	];
	const figure = body.figure === undefined ? 'collage' : oneOf(body.figure, FIGURES, 'Figure');
	if (figure === 'photo' && !(await loadAvatar(user, env))?.photo) fail(400, 'Upload a photo of yourself first');
	const stamp = now();
	await env.DB.prepare(
		`INSERT INTO avatars (id, owner, body_type, hair_color, eye_color, skin_color, figure, created, updated)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(owner) DO UPDATE SET body_type = excluded.body_type, hair_color = excluded.hair_color,
		   eye_color = excluded.eye_color, skin_color = excluded.skin_color, figure = excluded.figure,
		   updated = excluded.updated`,
	)
		.bind(newId(), user.id, ...values, figure, stamp, stamp)
		.run();
	return json(avatarOut((await loadAvatar(user, env))!));
}

async function uploadAvatarPhoto(request: Request, user: User, env: ApiEnv) {
	const { bytes, kind } = await readImage(request, env);
	const previous = (await loadAvatar(user, env))?.photo;
	const key = `a/${user.id}/${newId(20)}.${kind.ext}`;
	await putFile(env, key, user.id, bytes, kind.type);
	const stamp = now();
	try {
		await env.DB.prepare(
			`INSERT INTO avatars (id, owner, body_type, hair_color, eye_color, skin_color, figure, photo, created, updated)
			 VALUES (?, ?, ?, ?, ?, ?, 'photo', ?, ?, ?)
			 ON CONFLICT(owner) DO UPDATE SET figure = 'photo', photo = excluded.photo, updated = excluded.updated`,
		)
			.bind(newId(), user.id, ...AVATAR_DEFAULTS, key, stamp, stamp)
			.run();
	} catch (error) {
		await deleteFile(env, key).catch(() => {});
		throw error;
	}
	if (previous) await deleteFile(env, previous).catch(() => {});
	return json(avatarOut((await loadAvatar(user, env))!), 201);
}

async function deleteAvatarPhoto(user: User, env: ApiEnv) {
	const row = await loadAvatar(user, env);
	if (!row?.photo) return json(row ? avatarOut(row) : null);
	await env.DB.prepare("UPDATE avatars SET photo = NULL, figure = 'collage', updated = ? WHERE owner = ?").bind(now(), user.id).run();
	await deleteFile(env, row.photo);
	return json(avatarOut((await loadAvatar(user, env))!));
}

// ───────────────────────── files ─────────────────────────
// Photos are served by their unguessable key (like PocketBase's unprotected file
// fields), so plain <img src> works without sending the login token.
async function serveFile(key: string, env: ApiEnv) {
	if (!FILE_KEY.test(key)) fail(404, 'Not found');
	const file = (await getFile(env, key)) ?? fail(404, 'Not found');
	return new Response(file.body as BodyInit, {
		headers: {
			'Content-Type': file.contentType,
			'Cache-Control': 'private, max-age=31536000, immutable',
			'Content-Security-Policy': "default-src 'none'",
			'X-Content-Type-Options': 'nosniff',
		},
	});
}

// ───────────────────────── router ─────────────────────────
export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
	const { pathname } = new URL(request.url);
	const path = pathname.replace(/\/+$/, '');
	const method = request.method.toUpperCase();
	const route = `${method} ${path}`;

	try {
		if (route === 'GET /api/health') return json({ ok: true });
		if (route === 'POST /api/auth/signup') return await signup(request, env);
		if (route === 'POST /api/auth/login') return await login(request, env);
		if (route === 'POST /api/auth/logout') return await logout(request, env);
		if (method === 'GET' && path.startsWith('/api/files/')) return await serveFile(decodeURIComponent(path.slice('/api/files/'.length)), env);

		if (route === 'GET /api/auth/me') return json({ user: await requireUser(request, env) });

		if (route === 'GET /api/garments') return await listGarments(await requireUser(request, env), env);
		if (route === 'POST /api/garments') return await createGarment(request, await requireUser(request, env), env);
		let m = /^\/api\/garments\/([a-z0-9]{15})$/.exec(path);
		if (m && method === 'DELETE') return await deleteGarment(m[1], await requireUser(request, env), env);

		if (route === 'GET /api/outfits') return await listOutfits(await requireUser(request, env), env);
		if (route === 'POST /api/outfits') return await createOutfit(request, await requireUser(request, env), env);
		m = /^\/api\/outfits\/([a-z0-9]{15})$/.exec(path);
		if (m && method === 'DELETE') return await deleteOutfit(m[1], await requireUser(request, env), env);

		if (route === 'GET /api/avatar') return await getAvatar(await requireUser(request, env), env);
		if (route === 'PUT /api/avatar') return await saveAvatar(request, await requireUser(request, env), env);
		if (route === 'POST /api/avatar/photo') return await uploadAvatarPhoto(request, await requireUser(request, env), env);
		if (route === 'DELETE /api/avatar/photo') return await deleteAvatarPhoto(await requireUser(request, env), env);

		return json({ error: 'Route not found' }, 404);
	} catch (error) {
		if (error instanceof HttpError) return json({ error: error.message }, error.status);
		console.error('[api]', route, error);
		return json({ error: 'Something went wrong' }, 500);
	}
}
