-- Two system roles that exist by default (Phase 1 spec).
--
-- Fully idempotent as of Phase 10, not merely idempotent-per-run. It used to
-- rely on callers truncating first — true of test/helpers.ts resetDb, and true
-- of docker's init sequence, which only ever ran against an empty database.
-- That init sequence is gone: `npm run seed:reference` now runs this after
-- every `migrate:up`, including on a database that already has these rows.

INSERT INTO roles (name, is_system) VALUES ('Super Admin', true), ('Business Owner', true)
ON CONFLICT (name) DO NOTHING;

-- Super Admin: every permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- Business Owner: starter set scoped to the modules they interact with;
-- row-level "only my own Business" scoping is enforced per-endpoint (Phase 3+),
-- not by RBAC permissions, which are module-level only.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Business Owner'
  AND (
    (p.module = 'Listings' AND p.action IN ('view', 'create', 'edit'))
    OR (p.module = 'Enquiries' AND p.action IN ('view', 'edit'))
  )
ON CONFLICT DO NOTHING;
