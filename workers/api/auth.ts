/**
 * Email + password auth using only Web Crypto (no dependencies).
 *
 * Passwords: PBKDF2-HMAC-SHA256 with a random 16-byte salt. 100,000 iterations is
 * the maximum the Workers runtime allows. The iteration count is stored in the
 * hash, so it can be raised later without breaking existing accounts.
 *
 * Sessions: a random 32-byte bearer token. Only its SHA-256 hash is stored.
 */
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const encoder = new TextEncoder();

const toB64 = (bytes: Uint8Array): string => {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
};

const fromB64 = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

const toB64Url = (bytes: Uint8Array): string => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_BITS);
	return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
	return diff === 0;
}

/** Returns `pbkdf2$<iterations>$<salt b64>$<hash b64>`. */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await pbkdf2(password, salt, ITERATIONS);
	return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, iterations, salt, hash] = stored.split('$');
	if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
	const actual = await pbkdf2(password, fromB64(salt), Number(iterations));
	return constantTimeEqual(actual, fromB64(hash));
}

/**
 * Burns the same CPU as a real check, so "no such email" and "wrong password"
 * take equally long and can't be told apart by timing.
 */
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
	dummyHash ??= hashPassword('not-a-real-password');
	await verifyPassword(password, await dummyHash);
	return false;
}

export function newSessionToken(): string {
	return toB64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return toB64Url(new Uint8Array(digest));
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** PocketBase-style 15-character id (or any length), unbiased. */
export function newId(length = 15): string {
	let out = '';
	while (out.length < length) {
		for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
			if (byte < 252 && out.length < length) out += ID_ALPHABET[byte % 36];
		}
	}
	return out;
}
