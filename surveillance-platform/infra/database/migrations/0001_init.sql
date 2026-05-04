-- Initial schema for the surveillance platform.
-- Run via your migration tool of choice (e.g., node-pg-migrate, drizzle, sqlx).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_connector_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pairings_org_idx ON pairings(organization_id);

CREATE TYPE connector_status AS ENUM ('pending', 'online', 'offline', 'revoked');
CREATE TYPE connector_platform AS ENUM ('macos', 'windows', 'linux');

CREATE TABLE connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  hostname TEXT,
  platform connector_platform,
  version TEXT,
  status connector_status NOT NULL DEFAULT 'pending',
  token_hash TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX connectors_org_idx ON connectors(organization_id);

CREATE TYPE camera_state AS ENUM ('draft', 'validating', 'online', 'offline', 'error');

CREATE TABLE cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  rtsp_url TEXT NOT NULL,
  state camera_state NOT NULL DEFAULT 'draft',
  last_validated_at TIMESTAMPTZ,
  last_snapshot_key TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cameras_connector_idx ON cameras(connector_id);

CREATE TYPE command_status AS ENUM ('queued', 'in_flight', 'done', 'failed');
CREATE TYPE command_kind AS ENUM ('validate_rtsp', 'capture_snapshot', 'ping');

CREATE TABLE commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  kind command_kind NOT NULL,
  payload JSONB NOT NULL,
  status command_status NOT NULL DEFAULT 'queued',
  result JSONB,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX commands_connector_status_idx ON commands(connector_id, status);
