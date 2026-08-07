-- Up Migration
--
-- Public username handle (issue #14). date_of_birth and gender already exist
-- from the baseline migration but were never wired up — no schema change
-- needed for them, only the backfill/format concerns below.
--
-- username's format (lowercase letters, digits, underscores, 3-20 chars,
-- starting with a letter) is enforced at the application layer, not a DB
-- CHECK, to keep the regex in one place. This migration only needs every
-- existing row to end up with a syntactically valid, unique value before the
-- NOT NULL/UNIQUE constraints land.

ALTER TABLE users ADD COLUMN username VARCHAR(20);

-- Slugify each existing user's name into a username, falling back to a
-- "user" prefix when the name has no usable characters, and resolving
-- collisions with a random numeric suffix (not a sequential counter, so a
-- username never leaks signup order).
DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  candidate TEXT;
  suffix TEXT;
BEGIN
  FOR r IN SELECT id, name FROM users ORDER BY created_at LOOP
    base_slug := lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '', 'g'));
    IF base_slug = '' OR base_slug !~ '^[a-z]' THEN
      base_slug := 'user' || base_slug;
    END IF;
    base_slug := substring(base_slug from 1 for 20);

    candidate := base_slug;
    WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate) LOOP
      suffix := lpad(floor(random() * 100000)::text, 5, '0');
      candidate := substring(base_slug from 1 for 20 - length(suffix)) || suffix;
    END LOOP;

    UPDATE users SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);

-- Down Migration

ALTER TABLE users DROP CONSTRAINT users_username_unique;
ALTER TABLE users DROP COLUMN username;
