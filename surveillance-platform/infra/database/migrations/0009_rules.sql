-- Phase 1 / M1d: rules — zone + schedule + trigger -> action. Phase 1 stores
-- rules only; Phase 2's Behavior Intelligence evaluates them. Action is
-- always {type: 'raise_event', severity} until Phase 3 adds routing.

CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  trigger JSONB NOT NULL,  -- {type, params}
  action JSONB NOT NULL,   -- {type: 'raise_event', severity}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rules_site_idx ON rules(site_id);
CREATE INDEX rules_zone_idx ON rules(zone_id);
