-- Garments can carry several moods, vibes and weathers (JSON arrays).
-- The old single columns stay as the "main" (first) pick so nothing breaks.
ALTER TABLE garments ADD COLUMN moods TEXT NOT NULL DEFAULT '[]';
ALTER TABLE garments ADD COLUMN vibes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE garments ADD COLUMN weathers TEXT NOT NULL DEFAULT '[]';

UPDATE garments SET moods = json_array(mood), vibes = json_array(vibe), weathers = json_array(weather);
