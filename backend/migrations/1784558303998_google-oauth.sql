-- Up Migration
--
-- Google sign-in (issue #12): a user can now authenticate via Google alone,
-- with no password at all, so password_hash must stop being NOT NULL. google_id
-- is Google's stable "sub" claim, not the email — an email can be reassigned by
-- a Workspace admin, sub cannot. The CHECK keeps every row authenticable by at
-- least one method; nothing may clear both columns on the same row.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD CONSTRAINT users_auth_method_check
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);

-- Down Migration

ALTER TABLE users DROP CONSTRAINT users_auth_method_check;
ALTER TABLE users DROP COLUMN google_id;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;