-- Phase 1 / M1c: schedules — reusable per-site time windows. Windows are
-- same-day (a span across midnight is stored as two windows) and evaluated in
-- the site's timezone by Phase 2/3 consumers.

CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  windows JSONB NOT NULL,  -- [{dayOfWeek: 0-6, startMinute: 0-1439, endMinute: 0-1439}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX schedules_site_idx ON schedules(site_id);
CREATE UNIQUE INDEX schedules_site_label_uniq ON schedules(site_id, lower(label));
