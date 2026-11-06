/**
 * The slice of the D1 and R2 binding APIs this API uses. Cloudflare's real
 * `D1Database` and `R2Bucket` satisfy these; keeping them minimal lets the tests
 * run the same code against Node's built-in SQLite.
 */
export interface Statement {
	bind(...values: unknown[]): Statement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
	run(): Promise<{ meta: { changes?: number } }>;
}

export interface Database {
	prepare(sql: string): Statement;
	batch(statements: Statement[]): Promise<unknown[]>;
}

export interface Bucket {
	put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
	get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
	delete(key: string): Promise<void>;
}

export interface ApiEnv {
	DB: Database;
	/** Optional R2 bucket for photos. Without it photos are stored in D1. */
	IMAGES?: Bucket;
}

export type User = { id: string; email: string; name: string; created: string };
