-- Collapse the operator-tier `member` role into `client`. After this migration
-- there are exactly two roles: `admin` (everything, incl. invites and org
-- creation) and `client` (operator-level: pairing, cameras, live preview).
-- Building-owner-only-Evidence personas arrive in Phase 4 via site-scoping.

UPDATE users   SET role = 'client' WHERE role = 'member';
UPDATE invites SET role = 'client' WHERE role = 'member';

ALTER TABLE users   DROP CONSTRAINT users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'client'));

ALTER TABLE invites DROP CONSTRAINT invites_role_check;
ALTER TABLE invites
  ADD CONSTRAINT invites_role_check CHECK (role IN ('admin', 'client'));

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'client';
