/**
 * Clothing-photo storage: new photos go to R2 when an `IMAGES` bucket is bound,
 * otherwise to D1.
 *
 * D1 works with no payment method on the Cloudflare account, but caps rows at 2 MB
 * and the database at 500 MB. Switching R2 on later is safe: photos already in D1
 * keep being served from there (reads try R2 first, then D1), and deleting a
 * piece cleans up whichever store holds its photo.
 */
import type { ApiEnv } from './types.ts';

export const D1_MAX_BYTES = 1_900_000;
export const R2_MAX_BYTES = 10 * 1024 * 1024;

export const maxImageBytes = (env: ApiEnv): number => (env.IMAGES ? R2_MAX_BYTES : D1_MAX_BYTES);

export type StoredFile = { body: ReadableStream | Uint8Array; contentType: string };

export async function putFile(env: ApiEnv, key: string, owner: string, bytes: Uint8Array, contentType: string): Promise<void> {
	if (env.IMAGES) {
		await env.IMAGES.put(key, bytes, { httpMetadata: { contentType } });
		return;
	}
	await env.DB.prepare('INSERT INTO files (key, owner, content_type, size, data, created) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(key, owner, contentType, bytes.byteLength, bytes, new Date().toISOString())
		.run();
}

/** D1 returns BLOB columns as an ArrayBuffer or a plain number array depending on version. */
function blobToBytes(value: unknown): Uint8Array {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	if (Array.isArray(value)) return Uint8Array.from(value as number[]);
	throw new Error('Unexpected BLOB type from database');
}

export async function getFile(env: ApiEnv, key: string): Promise<StoredFile | null> {
	if (env.IMAGES) {
		const object = await env.IMAGES.get(key);
		if (object) return { body: object.body, contentType: object.httpMetadata?.contentType || 'application/octet-stream' };
		// not in R2: it may be a photo uploaded before R2 was switched on
	}
	const row = await env.DB.prepare('SELECT content_type, data FROM files WHERE key = ?').bind(key).first<{ content_type: string; data: unknown }>();
	if (!row) return null;
	return { body: blobToBytes(row.data), contentType: row.content_type };
}

export async function deleteFile(env: ApiEnv, key: string): Promise<void> {
	if (env.IMAGES) await env.IMAGES.delete(key);
	await env.DB.prepare('DELETE FROM files WHERE key = ?').bind(key).run();
}

/** Identify the image by its first bytes rather than trusting the browser's label. */
export function sniffImageType(bytes: Uint8Array): { type: string; ext: string } | null {
	const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
	if (startsWith(0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg' };
	if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: 'image/png', ext: 'png' };
	if (startsWith(0x47, 0x49, 0x46, 0x38)) return { type: 'image/gif', ext: 'gif' };
	if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
		return { type: 'image/webp', ext: 'webp' };
	}
	return null;
}
