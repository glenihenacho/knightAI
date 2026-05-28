import { randomBytes, randomUUID } from "node:crypto";
import type {
  Camera,
  CameraState,
  Command,
  Connector,
  ConnectorStatus,
  Invite,
  Preview,
  PreviewStatus,
  User,
  UserRole,
} from "@surveillance/shared";
import { getPool, withTx } from "./client.js";
import {
  compareTokenHash,
  generateConnectorToken,
  generatePairingCode,
  hashToken,
} from "./tokens.js";

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

export interface IssuedToken {
  token: string;
  expiresAt: string;
}

export interface IssuedMagicLink extends IssuedToken {
  magicLinkId: string;
}

export interface IssuedInvite {
  invite: Invite;
  token: string;
  expiresAt: string;
}

export interface CreateInviteInput {
  email: string;
  organizationId: string;
  role: UserRole;
  createdByUserId: string;
  ttlSeconds: number;
}

export interface SessionPrincipal {
  user: User;
  sessionId: string;
}

export interface Store {
  createOrganization(name: string): Promise<{ id: string; name: string }>;
  getOrganization(id: string): Promise<{ id: string; name: string } | null>;
  listOrganizations(): Promise<{ id: string; name: string }[]>;

  createPairing(organizationId: string, ttlSeconds?: number): Promise<PairingRecord>;
  redeemPairing(code: string, info: RedeemInfo): Promise<RedeemedConnector | null>;

  authConnector(connectorId: string, token: string): Promise<Connector | null>;
  listConnectorsForOrg(organizationId: string): Promise<Connector[]>;
  // Scoped by org so a request from operator A can never resolve a connector
  // owned by org B.
  getConnectorForOrg(id: string, organizationId: string): Promise<Connector | null>;
  setConnectorStatus(connectorId: string, status: ConnectorStatus): Promise<void>;

  createCamera(camera: Camera): Promise<Camera>;
  listCamerasForOrg(organizationId: string): Promise<Camera[]>;
  getCamera(id: string): Promise<Camera | null>;
  // Org-scoped lookup for operator-driven actions on a camera. Returns null
  // if the camera doesn't exist OR belongs to a different org.
  getCameraForOrg(id: string, organizationId: string): Promise<Camera | null>;
  updateCameraValidation(input: {
    id: string;
    state: CameraState;
    lastValidatedAt: string;
    lastSnapshotKey: string | null;
    errorMessage: string | null;
  }): Promise<void>;

  enqueueCommand(connectorId: string, command: Command, cameraId: string | null): Promise<void>;
  takeNextCommand(connectorId: string): Promise<Command | null>;
  recordResult(input: {
    connectorId: string;
    commandId: string;
    result: unknown;
  }): Promise<CommandRowRef | null>;

  // HLS preview sessions.
  createPreview(input: {
    cameraId: string;
    maxDurationSeconds: number;
  }): Promise<Preview>;
  getActivePreviewForCamera(cameraId: string): Promise<Preview | null>;
  getPreviewById(id: string): Promise<Preview | null>;
  // Verifies the preview exists and belongs to a camera owned by this connector.
  // Used by the connector HLS upload route to authorize each PUT.
  getPreviewForConnector(previewId: string, connectorId: string): Promise<Preview | null>;
  setPreviewStatus(id: string, status: PreviewStatus, errorMessage?: string): Promise<void>;
  endPreview(id: string, errorMessage?: string): Promise<void>;
  recordPreviewHeartbeat(id: string): Promise<boolean>;

  // Operator auth (dashboard).
  findUserByEmail(email: string): Promise<User | null>;
  // Bootstraps the first admin during the SEED_ORGANIZATION_NAME path.
  // Idempotent in the caller (server.ts only invokes this when the org is
  // being created fresh, so no race with subsequent boots).
  createSeedAdmin(organizationId: string, email: string): Promise<User>;
  // Issues a single-use magic link valid for ttlSeconds. The raw token is
  // returned for embedding in the email; only its hash is persisted. The
  // magic_link row id is returned so callers can bind an invite to it.
  createMagicLink(email: string, ttlSeconds: number): Promise<IssuedMagicLink>;
  // Atomically consumes a magic link, returning the bound email + row id if
  // the link exists, hasn't expired, and hasn't been used. Marks
  // used_at = now() so a single token can never grant two sessions.
  consumeMagicLink(token: string): Promise<{ email: string; magicLinkId: string } | null>;

  // Invites — admin-issued, bound 1:1 to a magic_links row.
  createInvite(input: CreateInviteInput): Promise<IssuedInvite>;
  findInviteByMagicLinkId(magicLinkId: string): Promise<Invite | null>;
  // Atomically inserts a user under the invite's org/role and marks the
  // invite consumed. Throws if a user with that email already exists.
  provisionUserFromInvite(invite: Invite): Promise<User>;
  listInvitesForOrg(organizationId: string): Promise<Invite[]>;
  // Issues a session cookie token valid for ttlSeconds; raw token returned for
  // the Set-Cookie header.
  createSession(userId: string, ttlSeconds: number): Promise<IssuedToken>;
  // Resolves the user for a presented session cookie. Touches last_seen_at on
  // the session row so dashboards can show "active". Returns null on missing,
  // expired, or unknown tokens.
  findSessionByToken(token: string): Promise<SessionPrincipal | null>;
  deleteSessionByToken(token: string): Promise<void>;
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

interface PreviewRow {
  id: string;
  camera_id: string;
  status: PreviewStatus;
  max_duration_seconds: number;
  started_at: Date;
  last_heartbeat_at: Date;
  ended_at: Date | null;
  error_message: string | null;
}

function rowToPreview(row: PreviewRow): Preview {
  return {
    id: row.id,
    cameraId: row.camera_id,
    status: row.status,
    maxDurationSeconds: row.max_duration_seconds,
    startedAt: row.started_at.toISOString(),
    lastHeartbeatAt: row.last_heartbeat_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
    errorMessage: row.error_message,
  };
}

interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  created_at: Date;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

interface InviteRow {
  id: string;
  email: string;
  organization_id: string;
  role: UserRole;
  magic_link_id: string;
  created_by_user_id: string;
  consumed_at: Date | null;
  created_at: Date;
}

function rowToInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    email: row.email,
    organizationId: row.organization_id,
    role: row.role,
    createdByUserId: row.created_by_user_id,
    consumedAt: row.consumed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
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
      // Connectors poll this path every few seconds, so refresh last_seen_at at
      // most once per throttle window. last_seen_at is purely a "last contact"
      // indicator (nothing keys offline detection off its exact value), and the
      // conditional WHERE turns most polls into a no-op update — no row matched,
      // no row version churn, no WAL — instead of a write on every request.
      await pool.query(
        `UPDATE connectors
            SET last_seen_at = now()
          WHERE id = $1
            AND (last_seen_at IS NULL OR last_seen_at < now() - interval '15 seconds')`,
        [connectorId],
      );
      return rowToConnector(row);
    },

    async listConnectorsForOrg(organizationId) {
      const { rows } = await pool.query<ConnectorRow>(
        `SELECT id, organization_id, label, hostname, platform, version, status, last_seen_at, created_at
           FROM connectors
          WHERE organization_id = $1
          ORDER BY created_at DESC`,
        [organizationId],
      );
      return rows.map(rowToConnector);
    },

    async getConnectorForOrg(id, organizationId) {
      const { rows } = await pool.query<ConnectorRow>(
        `SELECT id, organization_id, label, hostname, platform, version, status, last_seen_at, created_at
           FROM connectors
          WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
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

    async listCamerasForOrg(organizationId) {
      const { rows } = await pool.query<CameraRow>(
        `SELECT c.id, c.connector_id, c.label, c.rtsp_url, c.state,
                c.last_validated_at, c.last_snapshot_key, c.error_message
           FROM cameras c
           JOIN connectors n ON n.id = c.connector_id
          WHERE n.organization_id = $1
          ORDER BY c.created_at DESC`,
        [organizationId],
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

    async getCameraForOrg(id, organizationId) {
      const { rows } = await pool.query<CameraRow>(
        `SELECT c.id, c.connector_id, c.label, c.rtsp_url, c.state,
                c.last_validated_at, c.last_snapshot_key, c.error_message
           FROM cameras c
           JOIN connectors n ON n.id = c.connector_id
          WHERE c.id = $1 AND n.organization_id = $2`,
        [id, organizationId],
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

    async recordResult({ connectorId, commandId, result }) {
      return withTx(pool, async (client) => {
        const { rows } = await client.query<{
          connector_id: string;
          camera_id: string | null;
          kind: Command["kind"];
        }>(
          `SELECT connector_id, camera_id, kind
             FROM commands
            WHERE id = $1 AND connector_id = $2
            FOR UPDATE`,
          [commandId, connectorId],
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

    async createPreview({ cameraId, maxDurationSeconds }) {
      const { rows } = await pool.query<PreviewRow>(
        `INSERT INTO previews (camera_id, max_duration_seconds)
         VALUES ($1, $2)
         RETURNING id, camera_id, status, max_duration_seconds,
                   started_at, last_heartbeat_at, ended_at, error_message`,
        [cameraId, maxDurationSeconds],
      );
      return rowToPreview(rows[0]!);
    },

    async getActivePreviewForCamera(cameraId) {
      const { rows } = await pool.query<PreviewRow>(
        `SELECT id, camera_id, status, max_duration_seconds,
                started_at, last_heartbeat_at, ended_at, error_message
           FROM previews
          WHERE camera_id = $1 AND ended_at IS NULL
          LIMIT 1`,
        [cameraId],
      );
      return rows[0] ? rowToPreview(rows[0]) : null;
    },

    async getPreviewById(id) {
      const { rows } = await pool.query<PreviewRow>(
        `SELECT id, camera_id, status, max_duration_seconds,
                started_at, last_heartbeat_at, ended_at, error_message
           FROM previews WHERE id = $1`,
        [id],
      );
      return rows[0] ? rowToPreview(rows[0]) : null;
    },

    async getPreviewForConnector(previewId, connectorId) {
      const { rows } = await pool.query<PreviewRow>(
        `SELECT p.id, p.camera_id, p.status, p.max_duration_seconds,
                p.started_at, p.last_heartbeat_at, p.ended_at, p.error_message
           FROM previews p
           JOIN cameras c ON c.id = p.camera_id
          WHERE p.id = $1 AND c.connector_id = $2`,
        [previewId, connectorId],
      );
      return rows[0] ? rowToPreview(rows[0]) : null;
    },

    async setPreviewStatus(id, status, errorMessage) {
      await pool.query(
        `UPDATE previews
            SET status = $2,
                error_message = COALESCE($3, error_message)
          WHERE id = $1`,
        [id, status, errorMessage ?? null],
      );
    },

    async endPreview(id, errorMessage) {
      await pool.query(
        `UPDATE previews
            SET status = $2,
                ended_at = now(),
                error_message = COALESCE($3, error_message)
          WHERE id = $1 AND ended_at IS NULL`,
        [id, errorMessage ? "failed" : "ended", errorMessage ?? null],
      );
    },

    async recordPreviewHeartbeat(id) {
      const { rowCount } = await pool.query(
        `UPDATE previews
            SET last_heartbeat_at = now()
          WHERE id = $1 AND ended_at IS NULL`,
        [id],
      );
      return (rowCount ?? 0) > 0;
    },

    async findUserByEmail(email) {
      const { rows } = await pool.query<UserRow>(
        `SELECT id, organization_id, email, display_name, role, created_at
           FROM users WHERE email = $1`,
        [normalizeEmail(email)],
      );
      return rows[0] ? rowToUser(rows[0]) : null;
    },

    async createSeedAdmin(organizationId, email) {
      const { rows } = await pool.query<UserRow>(
        `INSERT INTO users (organization_id, email, role)
         VALUES ($1, $2, 'admin')
         RETURNING id, organization_id, email, display_name, role, created_at`,
        [organizationId, normalizeEmail(email)],
      );
      return rowToUser(rows[0]!);
    },

    async createMagicLink(email, ttlSeconds) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO magic_links (email, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [normalizeEmail(email), tokenHash, expiresAt],
      );
      return { magicLinkId: rows[0]!.id, token, expiresAt: expiresAt.toISOString() };
    },

    async consumeMagicLink(token) {
      const tokenHash = hashToken(token);
      const { rows } = await pool.query<{ id: string; email: string }>(
        `UPDATE magic_links
            SET used_at = now()
          WHERE token_hash = $1
            AND used_at IS NULL
            AND expires_at > now()
          RETURNING id, email`,
        [tokenHash],
      );
      return rows[0] ? { magicLinkId: rows[0].id, email: rows[0].email } : null;
    },

    async createInvite({ email, organizationId, role, createdByUserId, ttlSeconds }) {
      const normalized = normalizeEmail(email);
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      return withTx(pool, async (client) => {
        const linkRows = await client.query<{ id: string }>(
          `INSERT INTO magic_links (email, token_hash, expires_at)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [normalized, tokenHash, expiresAt],
        );
        const magicLinkId = linkRows.rows[0]!.id;
        const inviteRows = await client.query<InviteRow>(
          `INSERT INTO invites
             (email, organization_id, role, magic_link_id, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, organization_id, role, magic_link_id,
                     created_by_user_id, consumed_at, created_at`,
          [normalized, organizationId, role, magicLinkId, createdByUserId],
        );
        return {
          invite: rowToInvite(inviteRows.rows[0]!),
          token,
          expiresAt: expiresAt.toISOString(),
        };
      });
    },

    async findInviteByMagicLinkId(magicLinkId) {
      const { rows } = await pool.query<InviteRow>(
        `SELECT id, email, organization_id, role, magic_link_id,
                created_by_user_id, consumed_at, created_at
           FROM invites WHERE magic_link_id = $1`,
        [magicLinkId],
      );
      return rows[0] ? rowToInvite(rows[0]) : null;
    },

    async provisionUserFromInvite(invite) {
      return withTx(pool, async (client) => {
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM users WHERE email = $1",
          [invite.email],
        );
        if (existing.rows[0]) {
          throw new Error(`user already exists for email ${invite.email}`);
        }
        const userRows = await client.query<UserRow>(
          `INSERT INTO users (organization_id, email, role)
           VALUES ($1, $2, $3)
           RETURNING id, organization_id, email, display_name, role, created_at`,
          [invite.organizationId, invite.email, invite.role],
        );
        await client.query(
          "UPDATE invites SET consumed_at = now() WHERE id = $1",
          [invite.id],
        );
        return rowToUser(userRows.rows[0]!);
      });
    },

    async listInvitesForOrg(organizationId) {
      const { rows } = await pool.query<InviteRow>(
        `SELECT id, email, organization_id, role, magic_link_id,
                created_by_user_id, consumed_at, created_at
           FROM invites
          WHERE organization_id = $1
          ORDER BY created_at DESC`,
        [organizationId],
      );
      return rows.map(rowToInvite);
    },

    async createSession(userId, ttlSeconds) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await pool.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt],
      );
      return { token, expiresAt: expiresAt.toISOString() };
    },

    async findSessionByToken(token) {
      const tokenHash = hashToken(token);
      const { rows } = await pool.query<{
        session_id: string;
        user_id: string;
        organization_id: string;
        email: string;
        display_name: string | null;
        role: UserRole;
        user_created_at: Date;
      }>(
        `UPDATE sessions s
            SET last_seen_at = now()
           FROM users u
          WHERE s.user_id = u.id
            AND s.token_hash = $1
            AND s.expires_at > now()
          RETURNING s.id AS session_id,
                    u.id AS user_id,
                    u.organization_id,
                    u.email,
                    u.display_name,
                    u.role,
                    u.created_at AS user_created_at`,
        [tokenHash],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        sessionId: row.session_id,
        user: rowToUser({
          id: row.user_id,
          organization_id: row.organization_id,
          email: row.email,
          display_name: row.display_name,
          role: row.role,
          created_at: row.user_created_at,
        }),
      };
    },

    async deleteSessionByToken(token) {
      const tokenHash = hashToken(token);
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    },
  };
}

// Re-exported for callers that need to compare a presented token to a stored
// hash without going through the store (e.g. tests). The implementations live
// in ./tokens.ts so they can be tested without the Postgres pool.
export { hashToken, compareTokenHash } from "./tokens.js";
