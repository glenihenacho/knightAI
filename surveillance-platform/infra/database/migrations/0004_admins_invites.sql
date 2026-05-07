-- Admins + invite-bound magic links.
-- Closes the auto-provisioning gap: public magic-link login no longer creates
-- users, and new members come in via invites issued by an authenticated admin.

ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('admin', 'member'));

CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  -- 1:1 with magic_links so the existing single-use semantics in
  -- consumeMagicLink atomically govern invite consumption.
  magic_link_id UUID NOT NULL UNIQUE REFERENCES magic_links(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invites_email_idx ON invites(email);
CREATE INDEX invites_org_idx ON invites(organization_id);
