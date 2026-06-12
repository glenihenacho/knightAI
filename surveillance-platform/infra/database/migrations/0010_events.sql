-- Phase 2 / M2a: events — a rule firing, raised by the connector's behavior
-- engine. The connector generates the id (idempotency key) so retried ingests
-- dedupe via ON CONFLICT DO NOTHING. rule/camera/zone FKs are SET NULL —
-- events outlive their sources as an audit trail — and the labels are
-- denormalized at insert so deleted sources still render in the dashboard.

CREATE TABLE events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  connector_id UUID REFERENCES connectors(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES rules(id) ON DELETE SET NULL,
  camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  rule_label TEXT NOT NULL,
  camera_label TEXT NOT NULL,
  zone_label TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX events_org_occurred_idx ON events(organization_id, occurred_at DESC);
CREATE INDEX events_site_occurred_idx ON events(site_id, occurred_at DESC);
