import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  Camera,
  CameraState,
  Command,
  Connector,
  ConnectorStatus,
} from "@surveillance/shared";
import { getPool, withTx } from "./client.js";

export interface PairingRecord {
  id: string;
  organizationId: string;
  code: string;
  expiresAt: string;
  redeemedConnectorId: string | null;
}

export interface RedeemInfo {
  hostname: string;
  platform: "macos" | "windows" | "linux";
  version: string;
}

export interface RedeemedConnector {
  connector: Connector;
  token: string;
}

export interface CommandRowRef {
  connectorId: string;
  cameraId: string | null;
  kind: Command["kind"];
}

export interface Store {
  createOrganization(name: string): Promise<{ id: string; name: string }>;
  getOrganization(id: string): Promise<{ id: string; name: string } | null>;
  listOrganizations(): Promise<{ id: string; name: string }[]>;

  createPairing(organizationId: string, ttlSeconds?: number): Promise<PairingRecord>;
  redeemPairing(code: string, info: RedeemInfo): Promise<RedeemedConnector | null>;

  authConnector(connectorId: string, token: string): Promise<Connector | null>;
  listConnectors(): Promise<Connector[]>;
  getConnector(id: string): Promise<Connector | null>;
  setConnectorStatus(connectorId: string, status: ConnectorStatus): Promise<void>;

  createCamera(camera: Camera): Promise<Camera>;
  listCameras(): Promise<Camera[]>;
  getCamera(id: string): Promise<Camera | null>;
  updateCameraValidation(input: {
    id: string;
    state: CameraState;
    lastValidatedAt: string;
    lastSnapshotKey: string | null;
    errorMessage: string | null;
  }): Promise<void>;

  enqueueCommand(connectorId: string, command: Command, cameraId: string | null): Promise<void>;
  takeNextCommand(connectorId: string): Promise<Command | null>;
  recordResult(commandId: string, result: unknown): Promise<CommandRowRef | null>;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePairingCode(): string {
  const pick = () => ALPHABET[randomBytes(1)[0]! % ALPHABET.length];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}`;
}

function generateConnectorToken(): string {
  return randomBytes(48).toString("hex");
}

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

function compareTokenHash(plain: string, hash: string): boolean {
  const a = Buffer.from(hashToken(plain), "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface ConnectorRow {
  id: string;
  organization_id: string;
  label: string;
  hostname: string | null;
  platform: "macos" | "windows" | "linux" | null;
  version: string | null;
  status: ConnectorStatus;
  last_seen_at: Date | null;
  created_at: Date;
}

function rowToConnector(row: ConnectorRow): Connector {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    hostname: row.hostname,
    platform: row.platform,
    version: row.version,
    status: row.status,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

interface CameraRow {
  id: string;
  connector_id: string;
  label: string;
  rtsp_url: string;
  state: CameraState;
  last_validated_at: Date | null;
  last_snapshot_key: string | null;
  error_message: string | null;
}

function rowToCamera(row: CameraRow): Camera {
  return {
    id: row.id,
    connectorId: row.connector_id,
    label: row.label,
    rtspUrl: row.rtsp_url,
    state: row.state,
    lastValidatedAt: row.last_validated_at?.toISOString() ?? null,
    lastSnapshotKey: row.last_snapshot_key,
    errorMessage: row.error_message,
  };
}

interface CommandRow {
  id: string;
  connector_id: string;
  camera_id: string | null;
  kind: Command["kind"];
  payload: Command["payload"];
  issued_at: Date;
}

function rowToCommand(row: CommandRow): Command {
  return {
    id: row.id,
    kind: row.kind,
    issuedAt: row.issued_at.toISOString(),
    payload: row.payload,
  } as Command;
}

export function createStore(databaseUrl: string): Store {
  const pool = getPool(databaseUrl);

  return {
    async createOrganization(name) {
      const id = randomUUID();
      await pool.query("INSERT INTO organizations (id, name) VALUES ($1, $2)", [id, name]);
      return { id, name };
    },

    async getOrganization(id) {
      const { rows } = await pool.query<{ id: string; name: string }>(
        "SELECT id, name FROM organizations WHERE id = $1",
        [id],
      );
      return rows[0] ?? null;
    },

    async listOrganizations() {
      const { rows } = await pool.query<{ id: string; name: string }>(
        "SELECT id, name FROM organizations ORDER BY created_at",
      );
      return rows;
    },

    async createPairing(organizationId, ttlSeconds = 600) {
      const id = randomUUID();
      const code = generatePairingCode();
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await pool.query(
        `INSERT INTO pairings (id, organization_id, code, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [id, organizationId, code, expiresAt],
      );
      return {
        id,
        organizationId,
        code,
        expiresAt: expiresAt.toISOString(),
        redeemedConnectorId: null,
      };
    },

    async redeemPairing(code, info) {
      return withTx(pool, async (client) => {
        const { rows } = await client.query<{ id: string; organization_id: string }>(
          `SELECT id, organization_id FROM pairings
            WHERE code = $1
              AND redeemed_connector_id IS NULL
              AND expires_at > now()
            FOR UPDATE`,
          [code],
        );
        const pairing = rows[0];
        if (!pairing) return null;

        const connectorId = randomUUID();
        const token = generateConnectorToken();
        const tokenHash = hashToken(token);
        const label = `${info.hostname} (${info.platform})`;

        const inserted = await client.query<ConnectorRow>(
          `INSERT INTO connectors
             (id, organization_id, label, hostname, platform, version, status, token_hash, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'online', $7, now())
           RETURNING id, organization_id, label, hostname, platform, version, status, last_seen_at, created_at`,
          [connectorId, pairing.organization_id, label, info.hostname, info.platform, info.version, tokenHash],
        );

        await client.query(
          "UPDATE pairings SET redeemed_connector_id = $1 WHERE id = $2",
          [connectorId, pairing.id],
        );

        return { connector: rowToConnector(inserted.rows[0]!), token };
      });
    },

    async authConnector(connectorId, token) {
      const { rows } = await pool.query<ConnectorRow & { token_hash: string }>(
        `SELECT id, organization_id, label, hostname, platform, version, status, last_seen_at, created_at, token_hash
           FROM connectors WHERE id = $1`,
        [connectorId],
      );
      const row = rows[0];
      if (!row) return null;
      if (row.status === "revoked") return null;
      if (!compareTokenHash(token, row.token_hash)) return null;
      await pool.query("UPDATE connectors SET last_seen_at = now() WHERE id = $1", [connectorId]);
      return rowToConnector(row);
    },

    async listConnectors() {
      const { rows } = await pool.query<ConnectorRow>(
        `SELECT id, organization_id, label, hostname, platform, version, status, last_seen_at, created_at
           FROM connectors ORDER BY created_at DESC`,
      );
      return rows.map(rowToConnector);
    },

    async getConnector(id) {
      const { rows } = await pool.query<ConnectorRow>(
        `SELECT id, organization_id, label, hostname, platform, version, status, last_seen_at, created_at
           FROM connectors WHERE id = $1`,
        [id],
      );
      return rows[0] ? rowToConnector(rows[0]) : null;
    },

    async setConnectorStatus(connectorId, status) {
      await pool.query("UPDATE connectors SET status = $1 WHERE id = $2", [status, connectorId]);
    },

    async createCamera(camera) {
      const { rows } = await pool.query<CameraRow>(
        `INSERT INTO cameras (id, connector_id, label, rtsp_url, state, last_validated_at, last_snapshot_key, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, connector_id, label, rtsp_url, state, last_validated_at, last_snapshot_key, error_message`,
        [
          camera.id,
          camera.connectorId,
          camera.label,
          camera.rtspUrl,
          camera.state,
          camera.lastValidatedAt,
          camera.lastSnapshotKey,
          camera.errorMessage,
        ],
      );
      return rowToCamera(rows[0]!);
    },

    async listCameras() {
      const { rows } = await pool.query<CameraRow>(
        `SELECT id, connector_id, label, rtsp_url, state, last_validated_at, last_snapshot_key, error_message
           FROM cameras ORDER BY created_at DESC`,
      );
      return rows.map(rowToCamera);
    },

    async getCamera(id) {
      const { rows } = await pool.query<CameraRow>(
        `SELECT id, connector_id, label, rtsp_url, state, last_validated_at, last_snapshot_key, error_message
           FROM cameras WHERE id = $1`,
        [id],
      );
      return rows[0] ? rowToCamera(rows[0]) : null;
    },

    async updateCameraValidation(input) {
      await pool.query(
        `UPDATE cameras
            SET state = $2,
                last_validated_at = $3,
                last_snapshot_key = COALESCE($4, last_snapshot_key),
                error_message = $5
          WHERE id = $1`,
        [input.id, input.state, input.lastValidatedAt, input.lastSnapshotKey, input.errorMessage],
      );
    },

    async enqueueCommand(connectorId, command, cameraId) {
      await pool.query(
        `INSERT INTO commands (id, connector_id, camera_id, kind, payload, status, issued_at)
         VALUES ($1, $2, $3, $4, $5, 'queued', $6)`,
        [command.id, connectorId, cameraId, command.kind, command.payload, command.issuedAt],
      );
    },

    async takeNextCommand(connectorId) {
      return withTx(pool, async (client) => {
        const { rows } = await client.query<CommandRow>(
          `SELECT id, connector_id, camera_id, kind, payload, issued_at
             FROM commands
            WHERE connector_id = $1 AND status = 'queued'
            ORDER BY issued_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1`,
          [connectorId],
        );
        const row = rows[0];
        if (!row) return null;
        await client.query("UPDATE commands SET status = 'in_flight' WHERE id = $1", [row.id]);
        return rowToCommand(row);
      });
    },

    async recordResult(commandId, result) {
      return withTx(pool, async (client) => {
        const { rows } = await client.query<{
          connector_id: string;
          camera_id: string | null;
          kind: Command["kind"];
        }>(
          "SELECT connector_id, camera_id, kind FROM commands WHERE id = $1 FOR UPDATE",
          [commandId],
        );
        const row = rows[0];
        if (!row) return null;
        await client.query(
          `UPDATE commands SET status = 'done', result = $1, finished_at = now() WHERE id = $2`,
          [result, commandId],
        );
        return {
          connectorId: row.connector_id,
          cameraId: row.camera_id,
          kind: row.kind,
        };
      });
    },
  };
}
