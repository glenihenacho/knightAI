-- F4: ONVIF LAN camera discovery. The connector runs a WS-Discovery multicast
-- probe and returns the responding devices; the dashboard turns the result into
-- a pre-filled "add camera" form. This rides the existing command queue (the
-- result lands in commands.result), so the only schema change is a new command
-- kind. ADD VALUE IF NOT EXISTS keeps the migration idempotent and additive,
-- exactly as 0011 did for the detection kinds.

ALTER TYPE command_kind ADD VALUE IF NOT EXISTS 'discover_onvif';
