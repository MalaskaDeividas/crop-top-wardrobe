-- Crop Top Wardrobe schema for Cloudflare D1 (SQLite).
-- Mirrors the PocketBase collections: users, garments, outfits, avatars.
-- D1 enforces foreign keys, so deleting a user removes everything they own.

CREATE TABLE users (
	id            TEXT PRIMARY KEY,
	email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
	name          TEXT NOT NULL DEFAULT '',
	password_hash TEXT NOT NULL,
	created       TEXT NOT NULL
);

-- Only a SHA-256 hash of each session token is stored, so a database leak
-- does not hand out working logins.
CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires    INTEGER NOT NULL,
	created    TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE garments (
	id       TEXT PRIMARY KEY,
	owner    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name     TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
	category TEXT NOT NULL CHECK (category IN ('head', 'torso', 'legs', 'feet', 'accessory')),
	colors   TEXT NOT NULL,          -- JSON array of colors
	mood     TEXT NOT NULL,
	vibe     TEXT NOT NULL,
	weather  TEXT NOT NULL,
	image    TEXT NOT NULL,          -- storage key, served at /api/files/<key>
	created  TEXT NOT NULL
);
CREATE INDEX idx_garments_owner_created ON garments(owner, created DESC);

CREATE TABLE outfits (
	id      TEXT PRIMARY KEY,
	owner   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title   TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
	items   TEXT NOT NULL,           -- JSON array of { id, name, category, image }
	created TEXT NOT NULL
);
CREATE INDEX idx_outfits_owner_created ON outfits(owner, created DESC);

-- One paper avatar per user.
CREATE TABLE avatars (
	id         TEXT PRIMARY KEY,
	owner      TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	body_type  TEXT NOT NULL CHECK (body_type IN ('female', 'male')),
	hair_color TEXT NOT NULL,
	eye_color  TEXT NOT NULL,
	skin_color TEXT NOT NULL,
	created    TEXT NOT NULL,
	updated    TEXT NOT NULL
);

-- Clothing photos when no R2 bucket is bound (the free, no-card default).
-- D1 caps a row at 2 MB, so the browser shrinks photos before upload.
CREATE TABLE files (
	key          TEXT PRIMARY KEY,
	owner        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	content_type TEXT NOT NULL,
	size         INTEGER NOT NULL,
	data         BLOB NOT NULL,
	created      TEXT NOT NULL
);
