-- "Paper you" can be the collage figure or the user's own cut-out photo.
ALTER TABLE avatars ADD COLUMN figure TEXT NOT NULL DEFAULT 'collage' CHECK (figure IN ('collage', 'photo'));
ALTER TABLE avatars ADD COLUMN photo TEXT; -- storage key, served at /api/files/<key>
