/**
 * End-to-end tests for workers/api against a real SQLite database.
 * Run: npm run test:api
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleApi } from '../workers/api/index.ts';
import type { ApiEnv } from '../workers/api/types.ts';
import { createTestBucket, createTestDb } from './d1-shim.ts';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));

// 1x1 transparent PNG
const PNG = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
	(c) => c.charCodeAt(0),
);

let ipCounter = 0;

function client(env: ApiEnv) {
	const ip = `10.0.0.${++ipCounter}`;
	let token = '';
	const call = async (method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) => {
		const headers: Record<string, string> = { 'cf-connecting-ip': ip, ...extraHeaders };
		if (token) headers.authorization = `Bearer ${token}`;
		let payload: BodyInit | undefined;
		if (body instanceof FormData) payload = body;
		else if (body !== undefined) {
			payload = JSON.stringify(body);
			headers['content-type'] = 'application/json';
		}
		const res = await handleApi(new Request(`https://wardrobe.test${path}`, { method, headers, body: payload }), env);
		const type = res.headers.get('content-type') || '';
		const data = type.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer());
		return { status: res.status, data: data as any, headers: res.headers };
	};
	return {
		call,
		setToken: (t: string) => (token = t),
		async signup(email: string, password = 'correct horse', name = 'Tester') {
			const r = await call('POST', '/api/auth/signup', { email, password, name });
			assert.equal(r.status, 201, JSON.stringify(r.data));
			token = r.data.token;
			return r.data;
		},
	};
}

function garmentForm(overrides: Record<string, string | string[] | Blob> = {}) {
	const fields: Record<string, string | string[] | Blob> = {
		name: 'Denim jacket',
		category: 'torso',
		colors: ['blue', 'black'],
		mood: 'bold',
		vibe: 'grunge',
		weather: 'cold',
		image: new Blob([PNG], { type: 'image/png' }),
		...overrides,
	};
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
		else if (v instanceof Blob) fd.append(k, v, 'photo.png');
		else fd.append(k, v);
	}
	return fd;
}

const freshEnv = (withR2 = false): ApiEnv => ({ DB: createTestDb(MIGRATIONS), ...(withR2 ? { IMAGES: createTestBucket() } : {}) });

describe('auth', () => {
	it('signs up, logs in, checks session, logs out', async () => {
		const env = freshEnv();
		const a = client(env);
		const s = await a.signup('Maja@Example.com');
		assert.equal(s.user.email, 'maja@example.com');
		assert.equal(s.user.name, 'Tester');
		assert.ok(!('password_hash' in s.user));

		assert.equal((await a.call('GET', '/api/auth/me')).data.user.id, s.user.id);

		const dup = await client(env).call('POST', '/api/auth/signup', { email: 'maja@EXAMPLE.com', password: 'whatever123', name: 'x' });
		assert.equal(dup.status, 400);

		const b = client(env);
		assert.equal((await b.call('POST', '/api/auth/login', { email: 'maja@example.com', password: 'wrong pass' })).status, 400);
		assert.equal((await b.call('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'wrong pass' })).status, 400);
		const ok = await b.call('POST', '/api/auth/login', { email: ' MAJA@example.com ', password: 'correct horse' });
		assert.equal(ok.status, 200);
		b.setToken(ok.data.token);
		assert.equal((await b.call('GET', '/api/auth/me')).status, 200);

		await b.call('POST', '/api/auth/logout');
		assert.equal((await b.call('GET', '/api/auth/me')).status, 401);
		assert.equal((await a.call('GET', '/api/auth/me')).status, 200, 'other sessions survive');
	});

	it('rejects weak input and unauthenticated access', async () => {
		const env = freshEnv();
		const c = client(env);
		assert.equal((await c.call('POST', '/api/auth/signup', { email: 'a@b.co', password: 'short', name: 'x' })).status, 400);
		assert.equal((await c.call('POST', '/api/auth/signup', { email: 'not-an-email', password: 'long enough', name: 'x' })).status, 400);
		assert.equal((await c.call('POST', '/api/auth/signup', 'nope')).status, 400);
		assert.equal((await c.call('GET', '/api/garments')).status, 401);
		c.setToken('A'.repeat(43));
		assert.equal((await c.call('GET', '/api/garments')).status, 401);
	});

	it('rate-limits repeated login attempts per IP', async () => {
		const c = client(freshEnv());
		let last = 0;
		for (let i = 0; i < 21; i++) last = (await c.call('POST', '/api/auth/login', { email: 'x@y.zz', password: 'nopenope' })).status;
		assert.equal(last, 429);
	});
});

for (const withR2 of [false, true]) {
	describe(`garments + files (${withR2 ? 'R2' : 'D1'} storage)`, () => {
		it('uploads, lists, serves, isolates owners, deletes', async () => {
			const env = freshEnv(withR2);
			const a = client(env);
			await a.signup(`a${withR2}@example.com`);

			const created = await a.call('POST', '/api/garments', garmentForm());
			assert.equal(created.status, 201, JSON.stringify(created.data));
			const g = created.data;
			assert.deepEqual(g.colors, ['blue', 'black']);
			assert.match(g.imageUrl, /^\/api\/files\/g\/[a-z0-9]{15}\/[a-z0-9]{20}\.png$/);

			const file = await a.call('GET', g.imageUrl);
			assert.equal(file.status, 200);
			assert.equal(file.headers.get('content-type'), 'image/png');
			assert.deepEqual(file.data, PNG);

			const list = await a.call('GET', '/api/garments');
			assert.equal(list.data.length, 1);

			const b = client(env);
			await b.signup(`b${withR2}@example.com`);
			assert.equal((await b.call('GET', '/api/garments')).data.length, 0);
			assert.equal((await b.call('DELETE', `/api/garments/${g.id}`)).status, 404);

			assert.equal((await a.call('DELETE', `/api/garments/${g.id}`)).status, 200);
			assert.equal((await a.call('GET', g.imageUrl)).status, 404, 'photo removed with garment');
			assert.equal((await a.call('GET', '/api/garments')).data.length, 0);
		});

		it('validates fields and file contents', async () => {
			const env = freshEnv(withR2);
			const a = client(env);
			await a.signup(`v${withR2}@example.com`);
			const bad = async (o: Record<string, string | string[] | Blob>) => (await a.call('POST', '/api/garments', garmentForm(o))).status;
			assert.equal(await bad({ category: 'hat' }), 400);
			assert.equal(await bad({ colors: [] }), 400);
			assert.equal(await bad({ mood: [] }), 400);
			assert.equal(await bad({ weather: ['sunny', 'tornado'] }), 400);
			assert.equal(await bad({ colors: ['chartreuse'] }), 400);
			assert.equal(await bad({ mood: 'angry' }), 400);
			assert.equal(await bad({ image: new Blob(['<svg onload=alert(1)>'], { type: 'image/png' }) }), 400);
			assert.equal(await bad({ name: 'x'.repeat(121) }), 400);
			// blank name falls back to the category, like the original form
			const r = await a.call('POST', '/api/garments', garmentForm({ name: '' }));
			assert.equal(r.data.name, 'torso');
		});

		it(`enforces the ${withR2 ? '10 MB' : '1.9 MB'} photo limit`, async () => {
			const env = freshEnv(withR2);
			const a = client(env);
			await a.signup(`big${withR2}@example.com`);
			const big = new Uint8Array((withR2 ? 10 * 1024 * 1024 : 1_900_000) + 1);
			big.set(PNG);
			const r = await a.call('POST', '/api/garments', garmentForm({ image: new Blob([big], { type: 'image/png' }) }));
			assert.equal(r.status, 413);
			assert.match(r.data.error, /too big/);
		});
	});
}

describe('outfits', () => {
	it('creates, lists, isolates and deletes', async () => {
		const env = freshEnv();
		const a = client(env);
		await a.signup('o@example.com');
		const g = (await a.call('POST', '/api/garments', garmentForm())).data;
		const items = [{ id: g.id, name: g.name, category: g.category, image: g.imageUrl }];

		const o = await a.call('POST', '/api/outfits', { title: 'bold fit', items });
		assert.equal(o.status, 201, JSON.stringify(o.data));
		assert.deepEqual(o.data.items, items);

		assert.equal((await a.call('POST', '/api/outfits', { title: 'x', items: [] })).status, 400);
		assert.equal((await a.call('POST', '/api/outfits', { title: 'x', items: [{ ...items[0], image: 'https://evil.test/x.png' }] })).status, 400);
		assert.equal((await a.call('POST', '/api/outfits', { title: 'x', items: Array(13).fill(items[0]) })).status, 400);

		const b = client(env);
		await b.signup('o2@example.com');
		assert.equal((await b.call('GET', '/api/outfits')).data.length, 0);
		assert.equal((await b.call('DELETE', `/api/outfits/${o.data.id}`)).status, 404);

		assert.equal((await a.call('GET', '/api/outfits')).data.length, 1);
		assert.equal((await a.call('DELETE', `/api/outfits/${o.data.id}`)).status, 200);
		assert.equal((await a.call('GET', '/api/outfits')).data.length, 0);
	});
});

describe('avatar', () => {
	it('is null until saved, then upserts one per user', async () => {
		const a = client(freshEnv());
		await a.signup('av@example.com');
		assert.equal((await a.call('GET', '/api/avatar')).data, null);
		const first = await a.call('PUT', '/api/avatar', { bodyType: 'female', hairColor: 'pink', eyeColor: 'green', skinColor: 'tan' });
		assert.equal(first.status, 200, JSON.stringify(first.data));
		const second = await a.call('PUT', '/api/avatar', { bodyType: 'male', hairColor: 'blonde', eyeColor: 'amber', skinColor: 'deep' });
		assert.equal(second.data.id, first.data.id, 'same row updated');
		assert.equal((await a.call('GET', '/api/avatar')).data.hairColor, 'blonde');
		assert.equal((await a.call('PUT', '/api/avatar', { bodyType: 'robot', hairColor: 'pink', eyeColor: 'green', skinColor: 'tan' })).status, 400);
	});
});

describe('routing', () => {
	it('answers unknown routes and bad file keys with JSON 404', async () => {
		const c = client(freshEnv());
		const r = await c.call('GET', '/api/nope');
		assert.equal(r.status, 404);
		assert.equal(r.data.error, 'Route not found');
		assert.equal((await c.call('GET', '/api/files/../../etc/passwd')).status, 404);
		assert.equal((await c.call('GET', '/api/health')).data.ok, true);
	});
});

describe('outfit placement', () => {
	it('stores where each piece sits on the doll and rejects bad numbers', async () => {
		const a = client(freshEnv());
		await a.signup('place@example.com');
		const g = (await a.call('POST', '/api/garments', garmentForm())).data;
		const base = { id: g.id, name: g.name, category: g.category, image: g.imageUrl };
		const place = { x: 48.123, y: 40, w: 52, r: -12.5, z: 3 };
		const o = await a.call('POST', '/api/outfits', { title: 'placed', items: [{ ...base, place }] });
		assert.equal(o.status, 201, JSON.stringify(o.data));
		assert.deepEqual(o.data.items[0].place, { x: 48.12, y: 40, w: 52, r: -12.5, z: 3 });
		for (const bad of [{ ...place, x: 'left' }, { ...place, w: 0 }, { ...place, r: 9999 }, { ...place, z: -1 }]) {
			assert.equal((await a.call('POST', '/api/outfits', { title: 'bad', items: [{ ...base, place: bad }] })).status, 400);
		}
		// items without a place still work (older saved looks)
		assert.equal((await a.call('POST', '/api/outfits', { title: 'plain', items: [base] })).status, 201);
	});
});

describe('avatar photo', () => {
	for (const withR2 of [false, true]) {
		it(`uploads, replaces and removes the photo (${withR2 ? 'R2' : 'D1'})`, async () => {
			const env = freshEnv(withR2);
			const a = client(env);
			await a.signup(`me${withR2}@example.com`);

			// can't choose the photo figure before uploading one
			const early = await a.call('PUT', '/api/avatar', { bodyType: 'female', hairColor: 'pink', eyeColor: 'green', skinColor: 'tan', figure: 'photo' });
			assert.equal(early.status, 400);

			const fd = new FormData();
			fd.append('image', new Blob([PNG], { type: 'image/png' }), 'me.png');
			const up = await a.call('POST', '/api/avatar/photo', fd);
			assert.equal(up.status, 201, JSON.stringify(up.data));
			assert.equal(up.data.figure, 'photo');
			assert.match(up.data.photoUrl, /^\/api\/files\/a\/[a-z0-9]{15}\/[a-z0-9]{20}\.png$/);
			assert.equal(up.data.bodyType, 'female', 'defaults filled in');
			assert.deepEqual((await a.call('GET', up.data.photoUrl)).data, PNG);

			// switching options keeps the photo; switching back to collage is allowed
			const collage = await a.call('PUT', '/api/avatar', { bodyType: 'male', hairColor: 'pink', eyeColor: 'green', skinColor: 'tan', figure: 'collage' });
			assert.equal(collage.data.figure, 'collage');
			assert.equal(collage.data.photoUrl, up.data.photoUrl);
			assert.equal((await a.call('PUT', '/api/avatar', { bodyType: 'male', hairColor: 'pink', eyeColor: 'green', skinColor: 'tan', figure: 'photo' })).data.figure, 'photo');

			// a new upload replaces and deletes the old file
			const fd2 = new FormData();
			fd2.append('image', new Blob([PNG], { type: 'image/png' }), 'me2.png');
			const up2 = await a.call('POST', '/api/avatar/photo', fd2);
			assert.notEqual(up2.data.photoUrl, up.data.photoUrl);
			assert.equal((await a.call('GET', up.data.photoUrl)).status, 404);

			const removed = await a.call('DELETE', '/api/avatar/photo');
			assert.equal(removed.data.figure, 'collage');
			assert.equal(removed.data.photoUrl, null);
			assert.equal((await a.call('GET', up2.data.photoUrl)).status, 404);

			const bad = new FormData();
			bad.append('image', new Blob(['not an image']), 'x.png');
			assert.equal((await a.call('POST', '/api/avatar/photo', bad)).status, 400);
		});
	}
});

describe('multiple tags per garment', () => {
	it('stores several colors, moods, vibes and weathers, and old single-tag rows still read', async () => {
		const env = freshEnv();
		const a = client(env);
		await a.signup('tags@example.com');
		const r = await a.call(
			'POST',
			'/api/garments',
			garmentForm({ colors: ['red', 'blue', 'pink', 'gold', 'red'], mood: ['bold', 'cozy'], vibe: ['grunge', 'y2k', 'punk'], weather: ['cold', 'rainy'] }),
		);
		assert.equal(r.status, 201, JSON.stringify(r.data));
		assert.deepEqual(r.data.colors, ['red', 'blue', 'pink', 'gold'], 'duplicates dropped, no 3-colour cap');
		assert.deepEqual(r.data.moods, ['bold', 'cozy']);
		assert.deepEqual(r.data.vibes, ['grunge', 'y2k', 'punk']);
		assert.deepEqual(r.data.weathers, ['cold', 'rainy']);
		assert.deepEqual((await a.call('GET', '/api/garments')).data[0].moods, ['bold', 'cozy']);

		// A garment saved before migration 0003 (single columns only) is backfilled.
		const owner = (await a.call('GET', '/api/auth/me')).data.user.id;
		await env.DB.prepare(
			"INSERT INTO garments (id, owner, name, category, colors, mood, vibe, weather, image, created) VALUES ('oldoldoldoldold', ?, 'Old tee', 'torso', '[\"black\"]', 'soft', 'minimal', 'mild', 'g/oldoldoldoldold/aaaaaaaaaaaaaaaaaaaa.png', '2020-01-01')",
		).bind(owner).run();
		await env.DB.prepare('UPDATE garments SET moods = json_array(mood), vibes = json_array(vibe), weathers = json_array(weather) WHERE id = ?').bind('oldoldoldoldold').run();
		const old = (await a.call('GET', '/api/garments')).data.find((g: { id: string }) => g.id === 'oldoldoldoldold');
		assert.deepEqual([old.moods, old.vibes, old.weathers], [['soft'], ['minimal'], ['mild']]);
	});
});

describe('switching R2 on later', () => {
	it('keeps serving photos stored in D1, saves new ones to R2, and deletes from both', async () => {
		const DB = createTestDb(MIGRATIONS);
		const before = client({ DB }); // D1-only, like a fresh install
		await before.signup('switch@example.com');
		const old = (await before.call('POST', '/api/garments', garmentForm())).data;

		const bucket = createTestBucket();
		const after = client({ DB, IMAGES: bucket }); // same database, R2 now bound
		const token = (await after.call('POST', '/api/auth/login', { email: 'switch@example.com', password: 'correct horse' })).data.token;
		after.setToken(token);

		const oldFile = await after.call('GET', old.imageUrl);
		assert.equal(oldFile.status, 200, 'photo uploaded before R2 still loads');
		assert.deepEqual(oldFile.data, PNG);

		const fresh = (await after.call('POST', '/api/garments', garmentForm())).data;
		assert.ok(bucket.objects.has(fresh.image), 'new photo goes to R2');
		assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM files').first<{ n: number }>())!.n, 1, 'and not into D1');

		assert.equal((await after.call('DELETE', `/api/garments/${old.id}`)).status, 200);
		assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM files').first<{ n: number }>())!.n, 0, 'old D1 photo deleted');
		assert.equal((await after.call('DELETE', `/api/garments/${fresh.id}`)).status, 200);
		assert.equal(bucket.objects.size, 0, 'R2 photo deleted');
	});
});
