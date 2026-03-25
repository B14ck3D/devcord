-- Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nick_color TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nick_glow TEXT;

-- Down
-- ALTER TABLE users DROP COLUMN avatar_url;
-- ALTER TABLE users DROP COLUMN nick_color;
-- ALTER TABLE users DROP COLUMN nick_glow;
