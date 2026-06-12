-- Phase 1 / M1a: real sites. A site is a physical location within an org.
-- Connectors (not cameras) carry the site FK — a connector is hardware that
-- lives at one place; cameras inherit their site through the connector.

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sites_organization_idx ON sites(organization_id);
CREATE UNIQUE INDEX sites_org_label_uniq ON sites(organization_id, lower(label));

ALTER TABLE connectors ADD COLUMN site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
CREATE INDEX connectors_site_idx ON connectors(site_id);

-- Pairings carry the site the operator generated them for; redeem copies it
-- onto the connector. Nullable: rows created before this migration have none
-- and redeem falls back to the org's oldest site.
ALTER TABLE pairings ADD COLUMN site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

-- Backfill: one "Default site" per existing org, attach all existing
-- connectors to it. (Orgs created after this migration get their default site
-- from the application's createOrganization path.)
INSERT INTO sites (organization_id, label)
  SELECT id, 'Default site' FROM organizations;
UPDATE connectors c
   SET site_id = s.id
  FROM sites s
 WHERE s.organization_id = c.organization_id
   AND s.label = 'Default site';

ALTER TABLE connectors ALTER COLUMN site_id SET NOT NULL;
