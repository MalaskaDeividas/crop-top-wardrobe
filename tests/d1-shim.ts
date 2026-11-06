/**
 * Minimal D1 stand-in over Node's built-in SQLite, so the API can be tested
 * without Cloudflare. Also: an in-memory R2 stand-in.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Bucket, Database, Statement } from '../workers/api/types.ts';

export function createTestDb(migrationsDir: string): Database {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON;'); // D1 enforces foreign keys by default
	for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
		db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
	}

	const statement = (sql: string, params: unknown[] = []): Statement => ({
		bind: (...values) => statement(sql, values),
		first: async <T>() => (db.prepare(sql).get(...(params as never[])) ?? null) as T | null,
		all: async <T>() => ({ results: db.prepare(sql).all(...(params as never[])) as T[] }),
		run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(params as never[])).changes) } }),
	});

	return {
		prepare: (sql) => statement(sql),
		batch: async (statements) => {
			db.exec('BEGIN');
			try {
				const out = [];
				for (const s of statements) out.push(await s.run());
				db.exec('COMMIT');
				return out;
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		},
	};
}

export function createTestBucket(): Bucket & { objects: Map<string, { bytes: Uint8Array; type?: string }> } {
	const objects = new Map<string, { bytes: Uint8Array; type?: string }>();
	return {
		objects,
		put: async (key, value, options) => {
			objects.set(key, { bytes: new Uint8Array(value), type: options?.httpMetadata?.contentType });
		},
		get: async (key) => {
			const o = objects.get(key);
			return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: { contentType: o.type } } : null;
		},
		delete: async (key) => {
			objects.delete(key);
		},
	};
}
