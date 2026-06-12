-- Phase 1 / M1b: zones — polygon regions drawn on a camera frame. Coordinates
-- are normalized [0,1] so they survive resolution changes.

CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  polygon JSONB NOT NULL,  -- array of {x, y} in [0, 1]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX zones_camera_idx ON zones(camera_id);
