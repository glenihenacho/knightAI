-- Phase 2 pivot: detection moves from the connector to a server-side worker
-- (apps/worker). The connector keeps one job — RTSP -> HLS -> S3 — and the
-- worker consumes segments, runs YOLOX, tracks, evaluates rules, and inserts
-- events directly.
--
-- 0010 shipped the events table for connector-raised events and has live rows;
-- this migration only ADDs to it, never rewrites.

ALTER TYPE command_kind ADD VALUE IF NOT EXISTS 'start_detection';
ALTER TYPE command_kind ADD VALUE IF NOT EXISTS 'stop_detection';

-- Who owns the preview lifecycle: 'operator' previews live and die with the
-- dashboard heartbeat; 'detection' previews are created, heartbeated, and
-- rotated by the API's detection supervisor.
ALTER TABLE previews
  ADD COLUMN started_by TEXT NOT NULL DEFAULT 'operator'
    CHECK (started_by IN ('operator', 'detection'));

-- Worker-raised events carry provenance back to the footage: which preview
-- session and which HLS segment the trigger frame came from (M2d clip
-- playback reads these). dedup_key makes segment reprocessing (NOTIFY
-- redelivery, worker restart) a quiet no-op via the partial unique index;
-- connector-era rows keep NULL and are untouched.
ALTER TABLE events
  ADD COLUMN preview_id UUID REFERENCES previews(id) ON DELETE SET NULL,
  ADD COLUMN segment_key TEXT,
  ADD COLUMN dedup_key TEXT;

CREATE UNIQUE INDEX events_dedup_idx ON events(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX events_camera_occurred_idx ON events(camera_id, occurred_at DESC);
