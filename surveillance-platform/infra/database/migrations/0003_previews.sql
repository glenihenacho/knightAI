-- HLS preview sessions. One row per start/stop cycle for a camera.
-- The connector transcodes RTSP -> HLS and uploads playlist + segments to S3
-- under hls/<camera_id>/<preview_id>/. The API serves a rewritten manifest
-- with short-lived signed segment URLs.

ALTER TYPE command_kind ADD VALUE IF NOT EXISTS 'start_preview';
ALTER TYPE command_kind ADD VALUE IF NOT EXISTS 'stop_preview';

CREATE TYPE preview_status AS ENUM ('starting', 'active', 'ended', 'failed');

CREATE TABLE previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  status preview_status NOT NULL DEFAULT 'starting',
  -- Connector kills FFmpeg after this many seconds even if no stop arrives,
  -- so a closed dashboard tab can't leave a transcode running indefinitely.
  max_duration_seconds INTEGER NOT NULL DEFAULT 300,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  error_message TEXT
);

-- At most one active session per camera at a time.
CREATE UNIQUE INDEX previews_camera_active_uniq
  ON previews(camera_id)
  WHERE ended_at IS NULL;
