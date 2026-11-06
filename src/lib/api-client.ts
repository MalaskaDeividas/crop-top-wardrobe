/**
 * Browser client for the Cloudflare Worker API (replaces the PocketBase SDK).
 *
 * The session token lives in localStorage, like PocketBase's authStore, and is
 * sent as a Bearer header. Auth stays out of server rendering on purpose:
 * server-rendered HTML must never depend on who is asking.
 */

export type User = { id: string; email: string; name: string; created: string };

export type Garment = {
	id: string;
	name: string;
	category: string;
	colors: string[];
	moods: string[];
	vibes: string[];
	weathers: string[];
	image: string;
	imageUrl: string;
	created: string;
};

/** Where a piece sits on the paper doll: centre x/y and width in % of the stage, rotation in degrees. */
export type Placement = { x: number; y: number; w: number; r: number; z: number };
export type OutfitItem = { id: string; name: string; category: string; image: string; place?: Placement };
export type Outfit = { id: string; title: string; items: OutfitItem[]; created: string };

export type AvatarFigure = 'collage' | 'photo';
export type Avatar = {
	id: string;
	bodyType: 'female' | 'male';
	hairColor: string;
	eyeColor: string;
	skinColor: string;
	figure: AvatarFigure;
	photoUrl: string | null;
};
export type AvatarInput = Pick<Avatar, 'bodyType' | 'hairColor' | 'eyeColor' | 'skinColor'> & { figure?: AvatarFigure };

type Session = { token: string; user: User; expires: number };

// ───────────────────────── session store ─────────────────────────
const STORAGE_KEY = 'ctw.session';
type Listener = (user: User | null) => void;
const listeners = new Set<Listener>();
let cached: Session | null | undefined;

function load(): Session | null {
	if (typeof window === 'undefined') return null;
	if (cached !== undefined) return cached;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? (JSON.parse(raw) as Session) : null;
		cached = parsed && parsed.token && parsed.user && parsed.expires > Date.now() ? parsed : null;
	} catch {
		cached = null;
	}
	return cached;
}

function emit() {
	const user = load()?.user ?? null;
	listeners.forEach((fn) => fn(user));
}

export const authStore = {
	get token(): string | null {
		return load()?.token ?? null;
	},
	get record(): User | null {
		return load()?.user ?? null;
	},
	get isValid(): boolean {
		return load() !== null;
	},
	save(session: Session) {
		cached = session;
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
		} catch {
			// private mode / blocked storage: the session lasts for this tab only
		}
		emit();
	},
	clear() {
		cached = null;
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
		emit();
	},
	onChange(fn: Listener): () => void {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},
};

// Keep tabs in sync: logging out in one tab logs out the others.
if (typeof window !== 'undefined') {
	window.addEventListener('storage', (event) => {
		if (event.key === STORAGE_KEY) {
			cached = undefined;
			emit();
		}
	});
}

// ───────────────────────── requests ─────────────────────────
export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	const token = authStore.token;
	if (token) headers.set('Authorization', `Bearer ${token}`);
	if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

	const res = await fetch(path, { ...init, headers });
	const data = await res.json().catch(() => null);

	if (res.status === 401 && token) authStore.clear(); // session expired or revoked
	if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
	return data as T;
}

const post = <T>(path: string, body?: unknown) =>
	request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

// ───────────────────────── same-page change events ─────────────────────────
// PocketBase pushed realtime events so pieces added at the upload desk appeared in
// the outfit builder instantly. Both live on the same page, so a local event bus
// gives the same effect without a realtime server.
export type GarmentEvent = { action: 'create'; record: Garment } | { action: 'delete'; record: { id: string } };
const garmentEvents = new EventTarget();

export function onGarmentsChange(fn: (event: GarmentEvent) => void): () => void {
	const handler = (e: Event) => fn((e as CustomEvent<GarmentEvent>).detail);
	garmentEvents.addEventListener('change', handler);
	return () => garmentEvents.removeEventListener('change', handler);
}

const emitGarment = (detail: GarmentEvent) => garmentEvents.dispatchEvent(new CustomEvent('change', { detail }));

// ───────────────────────── API ─────────────────────────
export const api = {
	auth: {
		async login(email: string, password: string) {
			const session = await post<Session>('/api/auth/login', { email, password });
			authStore.save(session);
			return session.user;
		},
		async signup(email: string, password: string, name = '') {
			const session = await post<Session>('/api/auth/signup', { email, password, name });
			authStore.save(session);
			return session.user;
		},
		async logout() {
			const token = authStore.token;
			authStore.clear();
			if (token) {
				await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
			}
		},
		/** Confirms the stored session with the server; clears it if it was revoked. */
		me: () => request<{ user: User }>('/api/auth/me'),
	},
	garments: {
		list: () => request<Garment[]>('/api/garments'),
		async create(form: FormData) {
			const garment = await post<Garment>('/api/garments', form);
			emitGarment({ action: 'create', record: garment });
			return garment;
		},
		async remove(id: string) {
			await request(`/api/garments/${id}`, { method: 'DELETE' });
			emitGarment({ action: 'delete', record: { id } });
		},
	},
	outfits: {
		list: () => request<Outfit[]>('/api/outfits'),
		create: (outfit: { title: string; items: OutfitItem[] }) => post<Outfit>('/api/outfits', outfit),
		remove: (id: string) => request(`/api/outfits/${id}`, { method: 'DELETE' }),
	},
	avatar: {
		get: () => request<Avatar | null>('/api/avatar'),
		save: (avatar: AvatarInput) => request<Avatar>('/api/avatar', { method: 'PUT', body: JSON.stringify(avatar) }),
		/** Uploads a (cut-out) photo of the user and switches the doll to it. */
		uploadPhoto(image: Blob, filename = 'me.png') {
			const form = new FormData();
			form.append('image', image, filename);
			return post<Avatar>('/api/avatar/photo', form);
		},
		removePhoto: () => request<Avatar | null>('/api/avatar/photo', { method: 'DELETE' }),
	},
};

export default api;
