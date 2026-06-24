import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  Action,
  AnalysisConfig,
  Camera,
  CameraState,
  Command,
  Connector,
  ConnectorStatus,
  Event,
  Invite,
  PolygonPoint,
  Preview,
  PreviewStatus,
  PreviewStartedBy,
  Rule,
  Schedule,
  ScheduleWindow,
  Severity,
  Site,
  Trigger,
  User,
  UserRole,
  Zone,
} from "@surveillance/shared";
import { getPool, withTx } from "./client.js";

export interface PairingRecord {
  id: string;
  organizationId: string;
  siteId: string;
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
  siteName: string;
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

export interface CreateSiteInput {
  label: string;
  timezone?: string;
}

export interface UpdateSiteInput {
  label?: string;
  timezone?: string;
}

export type DeleteSiteResult = "deleted" | "not_found" | "has_connectors";

export interface CreateZoneInput {
  label: string;
  polygon: PolygonPoint[];
}

export interface UpdateZoneInput {
  label?: string;
  polygon?: PolygonPoint[];
}

export interface CreateScheduleInput {
  label: string;
  windows: ScheduleWindow[];
}

export interface UpdateScheduleInput {
  label?: string;
  windows?: ScheduleWindow[];
}

export interface CreateRuleInput {
  label: string;
  zoneId: string;
  scheduleId: string | null;
  trigger: Trigger;
  action: Action;
  enabled?: boolean;
}

export interface UpdateRuleInput {
  label?: string;
  zoneId?: string;
  scheduleId?: string | null;
  trigger?: Trigger;
  action?: Action;
  enabled?: boolean;
}

export interface IngestEventInput {
  id: string;
  ruleId: string;
  occurredAt: string;
  snapshotKey: string | null;
  metadata: Record<string, unknown>;
}

export interface ListEventsFilter {
  siteId?: string;
  cameraId?: string;
  severity?: Severity;
  /** Exclusive occurred_at cursor for paging backwards in time. */
  before?: string;
  limit: number;
}

export interface DetectionTarget {
  cameraId: string;
  rtspUrl: string;
  connectorId: string;
}

export interface DetectionPreview extends Preview {
  connectorId: string;
}

export interface Store {
  createOrganization(name: string): Promise<{ id: string; name: string }>;
  getOrganization(id: string): Promise<{ id: string; name: string } | null>;
  listOrganizations(): Promise<{ id: string; name: string }[]>;

  // Sites — every org always has at least one (createOrganization seeds a
  // "Default site"; deleteSite refuses while connectors are attached).
  listSitesForOrg(organizationId: string): Promise<Site[]>;
  createSite(organizationId: string, input: CreateSiteInput): Promise<Site>;
  getSiteForOrg(siteId: string, organizationId: string): Promise<Site | null>;
  // Oldest site in the org — the default target for pairings that don't name one.
  getDefaultSiteForOrg(organizationId: string): Promise<Site | null>;
  updateSite(siteId: string, organizationId: string, input: UpdateSiteInput): Promise<Site | null>;
  deleteSite(siteId: string, organizationId: string): Promise<DeleteSiteResult>;

  // Zones — org scoping flows through camera -> connector -> organization.
  // Callers must org-check the camera before list/create.
  listZonesForCamera(cameraId: string): Promise<Zone[]>;
  createZone(cameraId: string, input: CreateZoneInput): Promise<Zone>;
  getZoneForOrg(zoneId: string, organizationId: string): Promise<Zone | null>;
  // Site the zone's camera belongs to (via its connector), org-checked.
  // Used by rule creation to reject zones from a different site.
  getZoneSiteId(zoneId: string, organizationId: string): Promise<string | null>;
  updateZone(zoneId: string, organizationId: string, input: UpdateZoneInput): Promise<Zone | null>;
  deleteZone(zoneId: string, organizationId: string): Promise<boolean>;

  // Schedules — site-scoped; callers org-check the site before list/create.
  listSchedulesForSite(siteId: string): Promise<Schedule[]>;
  createSchedule(siteId: string, input: CreateScheduleInput): Promise<Schedule>;
  getScheduleForOrg(scheduleId: string, organizationId: string): Promise<Schedule | null>;
  updateSchedule(
    scheduleId: string,
    organizationId: string,
    input: UpdateScheduleInput,
  ): Promise<Schedule | null>;
  deleteSchedule(scheduleId: string, organizationId: string): Promise<boolean>;

  // Rules — site-scoped; referential validation (zone/schedule belong to the
  // rule's site) happens in the route layer.
  listRulesForSite(siteId: string): Promise<Rule[]>;
  createRule(siteId: string, input: CreateRuleInput): Promise<Rule>;
  getRuleForOrg(ruleId: string, organizationId: string): Promise<Rule | null>;
  updateRule(ruleId: string, organizationId: string, input: UpdateRuleInput): Promise<Rule | null>;
  deleteRule(ruleId: string, organizationId: string): Promise<boolean>;

  // Events — Phase 2. Ingest resolves each event's rule -> zone -> camera
  // chain, verifies the camera belongs to the posting connector, denormalizes
  // labels, and dedupes on the connector-generated id. Events whose rule is
  // unknown, foreign, or already recorded are silently skipped (the connector
  // retries batches at-least-once; a partial accept must not error the rest).
  ingestConnectorEvents(
    connectorId: string,
    organizationId: string,
    events: IngestEventInput[],
  ): Promise<{ accepted: number }>;
  listEventsForOrg(organizationId: string, filter: ListEventsFilter): Promise<Event[]>;
  getEventForOrg(eventId: string, organizationId: string): Promise<Event | null>;
  // Clip playback lookup. Public-by-event-id routes (playlist / segments /
  // detections) use this — no org check, the random uuid is the credential,
  // same posture as preview manifests. Null when the event predates
  // server-side detection (no segment_key).
  getEventClipRef(
    eventId: string,
  ): Promise<{ segmentKey: string; zonePolygon: PolygonPoint[] | null } | null>;
  // Everything the connector's behavior engine needs, scoped to the cameras
  // it owns: enabled rules + their zones, site schedules, site timezone.
  getAnalysisConfigForConnector(connectorId: string): Promise<AnalysisConfig>;

  createPairing(organizationId: string, siteId: string, ttlSeconds?: number): Promise<PairingRecord>;
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
    startedBy?: PreviewStartedBy;
  }): Promise<Preview>;
  getActivePreviewForCamera(cameraId: string): Promise<Preview | null>;
  getPreviewById(id: string): Promise<Preview | null>;
  // Verifies the preview exists and belongs to a camera owned by this connector.
  // Used by the connector HLS upload route to authorize each PUT.
  getPreviewForConnector(previewId: string, connectorId: string): Promise<Preview | null>;
  setPreviewStatus(id: string, status: PreviewStatus, errorMessage?: string): Promise<void>;
  endPreview(id: string, errorMessage?: string): Promise<void>;
  recordPreviewHeartbeat(id: string): Promise<boolean>;

  // Server-side detection (Phase 2 pivot).
  // pg_notify wrapper — segment_ready wake-ups for the worker and
  // config_changed cache invalidation both go through here.
  notify(channel: string, payload: string): Promise<void>;
  // Cameras that should have a detection pipeline running: online camera on
  // an online connector with at least one enabled rule over one of its zones.
  listDetectionTargets(): Promise<DetectionTarget[]>;
  // For detection previews, last_heartbeat_at means "last segment upload" —
  // the HLS PUT handler bumps it, and the supervisor reads staleness as a
  // dead pipeline.
  listActiveDetectionPreviews(): Promise<DetectionPreview[]>;

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
  site_id: string;
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
    siteId: row.site_id,
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
  started_by: PreviewStartedBy;
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
    startedBy: row.started_by,
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

interface SiteRow {
  id: string;
  organization_id: string;
  label: string;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

function rowToSite(row: SiteRow): Site {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

interface ZoneRow {
  id: string;
  camera_id: string;
  label: string;
  polygon: PolygonPoint[];
}

function rowToZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    cameraId: row.camera_id,
    label: row.label,
    polygon: row.polygon,
  };
}

interface ScheduleRow {
  id: string;
  site_id: string;
  label: string;
  windows: ScheduleWindow[];
}

function rowToSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    siteId: row.site_id,
    label: row.label,
    windows: row.windows,
  };
}

interface RuleRow {
  id: string;
  site_id: string;
  label: string;
  enabled: boolean;
  zone_id: string;
  schedule_id: string | null;
  trigger: Trigger;
  action: Action;
}

function rowToRule(row: RuleRow): Rule {
  return {
    id: row.id,
    siteId: row.site_id,
    label: row.label,
    enabled: row.enabled,
    zoneId: row.zone_id,
    scheduleId: row.schedule_id,
    trigger: row.trigger,
    action: row.action,
  };
}

interface EventRow {
  id: string;
  site_id: string;
  rule_id: string | null;
  rule_label: string;
  camera_id: string | null;
  camera_label: string;
  zone_id: string | null;
  zone_label: string;
  trigger_type: string;
  severity: Severity;
  occurred_at: Date;
  snapshot_key: string | null;
  metadata: Record<string, unknown>;
  preview_id: string | null;
  segment_key: string | null;
}

function rowToEvent(row: EventRow): Event {
  return {
    id: row.id,
    siteId: row.site_id,
    ruleId: row.rule_id,
    ruleLabel: row.rule_label,
    cameraId: row.camera_id,
    cameraLabel: row.camera_label,
    zoneId: row.zone_id,
    zoneLabel: row.zone_label,
    triggerType: row.trigger_type,
    severity: row.severity,
    occurredAt: row.occurred_at.toISOString(),
    snapshotKey: row.snapshot_key,
    metadata: row.metadata,
    segmentKey: row.segment_key,
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
      // Every org gets a default site at birth — the migration backfill only
      // covers orgs that existed when 0006 ran, and pairing/redeem assume an
      // org always has at least one site.
      await withTx(pool, async (client) => {
        await client.query("INSERT INTO organizations (id, name) VALUES ($1, $2)", [id, name]);
        await client.query(
          "INSERT INTO sites (organization_id, label) VALUES ($1, 'Default site')",
          [id],
        );
      });
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

    async listSitesForOrg(organizationId) {
      const { rows } = await pool.query<SiteRow>(
        `SELECT id, organization_id, label, timezone, created_at, updated_at
           FROM sites
          WHERE organization_id = $1
          ORDER BY created_at ASC`,
        [organizationId],
      );
      return rows.map(rowToSite);
    },

    async createSite(organizationId, input) {
      const { rows } = await pool.query<SiteRow>(
        `INSERT INTO sites (organization_id, label, timezone)
         VALUES ($1, $2, COALESCE($3, 'UTC'))
         RETURNING id, organization_id, label, timezone, created_at, updated_at`,
        [organizationId, input.label, input.timezone ?? null],
      );
      return rowToSite(rows[0]!);
    },

    async getSiteForOrg(siteId, organizationId) {
      const { rows } = await pool.query<SiteRow>(
        `SELECT id, organization_id, label, timezone, created_at, updated_at
           FROM sites
          WHERE id = $1 AND organization_id = $2`,
        [siteId, organizationId],
      );
      return rows[0] ? rowToSite(rows[0]) : null;
    },

    async getDefaultSiteForOrg(organizationId) {
      const { rows } = await pool.query<SiteRow>(
        `SELECT id, organization_id, label, timezone, created_at, updated_at
           FROM sites
          WHERE organization_id = $1
          ORDER BY created_at ASC
          LIMIT 1`,
        [organizationId],
      );
      return rows[0] ? rowToSite(rows[0]) : null;
    },

    async updateSite(siteId, organizationId, input) {
      const { rows } = await pool.query<SiteRow>(
        `UPDATE sites
            SET label = COALESCE($3, label),
                timezone = COALESCE($4, timezone),
                updated_at = now()
          WHERE id = $1 AND organization_id = $2
          RETURNING id, organization_id, label, timezone, created_at, updated_at`,
        [siteId, organizationId, input.label ?? null, input.timezone ?? null],
      );
      return rows[0] ? rowToSite(rows[0]) : null;
    },

    async deleteSite(siteId, organizationId) {
      return withTx(pool, async (client) => {
        const site = await client.query(
          "SELECT id FROM sites WHERE id = $1 AND organization_id = $2 FOR UPDATE",
          [siteId, organizationId],
        );
        if (!site.rows[0]) return "not_found" as const;
        const attached = await client.query(
          "SELECT 1 FROM connectors WHERE site_id = $1 LIMIT 1",
          [siteId],
        );
        if (attached.rows[0]) return "has_connectors" as const;
        await client.query("DELETE FROM sites WHERE id = $1", [siteId]);
        return "deleted" as const;
      });
    },

    async listZonesForCamera(cameraId) {
      const { rows } = await pool.query<ZoneRow>(
        `SELECT id, camera_id, label, polygon
           FROM zones
          WHERE camera_id = $1
          ORDER BY created_at ASC`,
        [cameraId],
      );
      return rows.map(rowToZone);
    },

    async createZone(cameraId, input) {
      // node-pg renders JS arrays as Postgres array literals, not JSON —
      // stringify explicitly for jsonb columns.
      const { rows } = await pool.query<ZoneRow>(
        `INSERT INTO zones (camera_id, label, polygon)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id, camera_id, label, polygon`,
        [cameraId, input.label, JSON.stringify(input.polygon)],
      );
      return rowToZone(rows[0]!);
    },

    async getZoneForOrg(zoneId, organizationId) {
      const { rows } = await pool.query<ZoneRow>(
        `SELECT z.id, z.camera_id, z.label, z.polygon
           FROM zones z
           JOIN cameras c ON c.id = z.camera_id
           JOIN connectors n ON n.id = c.connector_id
          WHERE z.id = $1 AND n.organization_id = $2`,
        [zoneId, organizationId],
      );
      return rows[0] ? rowToZone(rows[0]) : null;
    },

    async getZoneSiteId(zoneId, organizationId) {
      const { rows } = await pool.query<{ site_id: string }>(
        `SELECT n.site_id
           FROM zones z
           JOIN cameras c ON c.id = z.camera_id
           JOIN connectors n ON n.id = c.connector_id
          WHERE z.id = $1 AND n.organization_id = $2`,
        [zoneId, organizationId],
      );
      return rows[0]?.site_id ?? null;
    },

    async updateZone(zoneId, organizationId, input) {
      const { rows } = await pool.query<ZoneRow>(
        `UPDATE zones z
            SET label = COALESCE($3, z.label),
                polygon = COALESCE($4::jsonb, z.polygon),
                updated_at = now()
           FROM cameras c
           JOIN connectors n ON n.id = c.connector_id
          WHERE z.id = $1
            AND c.id = z.camera_id
            AND n.organization_id = $2
          RETURNING z.id, z.camera_id, z.label, z.polygon`,
        [
          zoneId,
          organizationId,
          input.label ?? null,
          input.polygon ? JSON.stringify(input.polygon) : null,
        ],
      );
      return rows[0] ? rowToZone(rows[0]) : null;
    },

    async deleteZone(zoneId, organizationId) {
      const { rowCount } = await pool.query(
        `DELETE FROM zones z
          USING cameras c, connectors n
          WHERE z.id = $1
            AND c.id = z.camera_id
            AND n.id = c.connector_id
            AND n.organization_id = $2`,
        [zoneId, organizationId],
      );
      return (rowCount ?? 0) > 0;
    },

    async listSchedulesForSite(siteId) {
      const { rows } = await pool.query<ScheduleRow>(
        `SELECT id, site_id, label, windows
           FROM schedules
          WHERE site_id = $1
          ORDER BY created_at ASC`,
        [siteId],
      );
      return rows.map(rowToSchedule);
    },

    async createSchedule(siteId, input) {
      const { rows } = await pool.query<ScheduleRow>(
        `INSERT INTO schedules (site_id, label, windows)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id, site_id, label, windows`,
        [siteId, input.label, JSON.stringify(input.windows)],
      );
      return rowToSchedule(rows[0]!);
    },

    async getScheduleForOrg(scheduleId, organizationId) {
      const { rows } = await pool.query<ScheduleRow>(
        `SELECT sc.id, sc.site_id, sc.label, sc.windows
           FROM schedules sc
           JOIN sites s ON s.id = sc.site_id
          WHERE sc.id = $1 AND s.organization_id = $2`,
        [scheduleId, organizationId],
      );
      return rows[0] ? rowToSchedule(rows[0]) : null;
    },

    async updateSchedule(scheduleId, organizationId, input) {
      const { rows } = await pool.query<ScheduleRow>(
        `UPDATE schedules sc
            SET label = COALESCE($3, sc.label),
                windows = COALESCE($4::jsonb, sc.windows),
                updated_at = now()
           FROM sites s
          WHERE sc.id = $1
            AND s.id = sc.site_id
            AND s.organization_id = $2
          RETURNING sc.id, sc.site_id, sc.label, sc.windows`,
        [
          scheduleId,
          organizationId,
          input.label ?? null,
          input.windows ? JSON.stringify(input.windows) : null,
        ],
      );
      return rows[0] ? rowToSchedule(rows[0]) : null;
    },

    async deleteSchedule(scheduleId, organizationId) {
      const { rowCount } = await pool.query(
        `DELETE FROM schedules sc
          USING sites s
          WHERE sc.id = $1
            AND s.id = sc.site_id
            AND s.organization_id = $2`,
        [scheduleId, organizationId],
      );
      return (rowCount ?? 0) > 0;
    },

    async listRulesForSite(siteId) {
      const { rows } = await pool.query<RuleRow>(
        `SELECT id, site_id, label, enabled, zone_id, schedule_id, trigger, action
           FROM rules
          WHERE site_id = $1
          ORDER BY created_at ASC`,
        [siteId],
      );
      return rows.map(rowToRule);
    },

    async createRule(siteId, input) {
      const { rows } = await pool.query<RuleRow>(
        `INSERT INTO rules (site_id, label, enabled, zone_id, schedule_id, trigger, action)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
         RETURNING id, site_id, label, enabled, zone_id, schedule_id, trigger, action`,
        [
          siteId,
          input.label,
          input.enabled ?? true,
          input.zoneId,
          input.scheduleId,
          JSON.stringify(input.trigger),
          JSON.stringify(input.action),
        ],
      );
      return rowToRule(rows[0]!);
    },

    async getRuleForOrg(ruleId, organizationId) {
      const { rows } = await pool.query<RuleRow>(
        `SELECT r.id, r.site_id, r.label, r.enabled, r.zone_id, r.schedule_id, r.trigger, r.action
           FROM rules r
           JOIN sites s ON s.id = r.site_id
          WHERE r.id = $1 AND s.organization_id = $2`,
        [ruleId, organizationId],
      );
      return rows[0] ? rowToRule(rows[0]) : null;
    },

    async updateRule(ruleId, organizationId, input) {
      // Read-merge-write: scheduleId is nullable, so COALESCE can't tell
      // "leave unchanged" (undefined) apart from "clear" (null).
      return withTx(pool, async (client) => {
        const { rows } = await client.query<RuleRow>(
          `SELECT r.id, r.site_id, r.label, r.enabled, r.zone_id, r.schedule_id, r.trigger, r.action
             FROM rules r
             JOIN sites s ON s.id = r.site_id
            WHERE r.id = $1 AND s.organization_id = $2
            FOR UPDATE OF r`,
          [ruleId, organizationId],
        );
        const current = rows[0];
        if (!current) return null;
        const next = {
          label: input.label ?? current.label,
          enabled: input.enabled ?? current.enabled,
          zoneId: input.zoneId ?? current.zone_id,
          scheduleId: input.scheduleId === undefined ? current.schedule_id : input.scheduleId,
          trigger: input.trigger ?? current.trigger,
          action: input.action ?? current.action,
        };
        const updated = await client.query<RuleRow>(
          `UPDATE rules
              SET label = $2, enabled = $3, zone_id = $4, schedule_id = $5,
                  trigger = $6::jsonb, action = $7::jsonb, updated_at = now()
            WHERE id = $1
            RETURNING id, site_id, label, enabled, zone_id, schedule_id, trigger, action`,
          [
            ruleId,
            next.label,
            next.enabled,
            next.zoneId,
            next.scheduleId,
            JSON.stringify(next.trigger),
            JSON.stringify(next.action),
          ],
        );
        return rowToRule(updated.rows[0]!);
      });
    },

    async deleteRule(ruleId, organizationId) {
      const { rowCount } = await pool.query(
        `DELETE FROM rules r
          USING sites s
          WHERE r.id = $1
            AND s.id = r.site_id
            AND s.organization_id = $2`,
        [ruleId, organizationId],
      );
      return (rowCount ?? 0) > 0;
    },

    async ingestConnectorEvents(connectorId, organizationId, events) {
      // INSERT ... SELECT resolves and authorizes in one statement: the event
      // lands only if the rule's zone's camera belongs to this connector and
      // the rule's site belongs to this org. ON CONFLICT dedupes retries.
      return withTx(pool, async (client) => {
        let accepted = 0;
        for (const ev of events) {
          const { rowCount } = await client.query(
            `INSERT INTO events
               (id, organization_id, site_id, connector_id, rule_id, camera_id, zone_id,
                rule_label, camera_label, zone_label, trigger_type, severity,
                occurred_at, snapshot_key, metadata)
             SELECT $1, $2, r.site_id, $3, r.id, cam.id, z.id,
                    r.label, cam.label, z.label, r.trigger->>'type', r.action->>'severity',
                    $4, $5, $6
               FROM rules r
               JOIN zones z ON z.id = r.zone_id
               JOIN cameras cam ON cam.id = z.camera_id
               JOIN sites s ON s.id = r.site_id
              WHERE r.id = $7
                AND cam.connector_id = $3
                AND s.organization_id = $2
             ON CONFLICT (id) DO NOTHING`,
            [
              ev.id,
              organizationId,
              connectorId,
              ev.occurredAt,
              ev.snapshotKey,
              JSON.stringify(ev.metadata),
              ev.ruleId,
            ],
          );
          accepted += rowCount ?? 0;
        }
        return { accepted };
      });
    },

    async listEventsForOrg(organizationId, filter) {
      const conds = ["organization_id = $1"];
      const params: unknown[] = [organizationId];
      if (filter.siteId) {
        params.push(filter.siteId);
        conds.push(`site_id = $${params.length}`);
      }
      if (filter.cameraId) {
        params.push(filter.cameraId);
        conds.push(`camera_id = $${params.length}`);
      }
      if (filter.severity) {
        params.push(filter.severity);
        conds.push(`severity = $${params.length}`);
      }
      if (filter.before) {
        params.push(filter.before);
        conds.push(`occurred_at < $${params.length}`);
      }
      params.push(filter.limit);
      const { rows } = await pool.query<EventRow>(
        `SELECT id, site_id, rule_id, rule_label, camera_id, camera_label,
                zone_id, zone_label, trigger_type, severity, occurred_at,
                snapshot_key, metadata, preview_id, segment_key
           FROM events
          WHERE ${conds.join(" AND ")}
          ORDER BY occurred_at DESC
          LIMIT $${params.length}`,
        params,
      );
      return rows.map(rowToEvent);
    },

    async getEventForOrg(eventId, organizationId) {
      const { rows } = await pool.query<EventRow>(
        `SELECT id, site_id, rule_id, rule_label, camera_id, camera_label,
                zone_id, zone_label, trigger_type, severity, occurred_at,
                snapshot_key, metadata, preview_id, segment_key
           FROM events
          WHERE id = $1 AND organization_id = $2`,
        [eventId, organizationId],
      );
      return rows[0] ? rowToEvent(rows[0]) : null;
    },

    async getEventClipRef(eventId) {
      const { rows } = await pool.query<{
        segment_key: string | null;
        zone_id: string | null;
      }>(`SELECT segment_key, zone_id FROM events WHERE id = $1`, [eventId]);
      const row = rows[0];
      if (!row?.segment_key) return null;
      let polygon: PolygonPoint[] | null = null;
      if (row.zone_id) {
        const zone = await pool.query<{ polygon: PolygonPoint[] }>(
          `SELECT polygon FROM zones WHERE id = $1`,
          [row.zone_id],
        );
        polygon = zone.rows[0]?.polygon ?? null;
      }
      return { segmentKey: row.segment_key, zonePolygon: polygon };
    },

    async getAnalysisConfigForConnector(connectorId) {
      const tzRes = await pool.query<{ timezone: string }>(
        `SELECT s.timezone
           FROM connectors c
           JOIN sites s ON s.id = c.site_id
          WHERE c.id = $1`,
        [connectorId],
      );
      const camRes = await pool.query<{ id: string; label: string; rtsp_url: string }>(
        `SELECT id, label, rtsp_url
           FROM cameras
          WHERE connector_id = $1
          ORDER BY created_at`,
        [connectorId],
      );
      const zoneRes = await pool.query<{
        id: string;
        camera_id: string;
        label: string;
        polygon: PolygonPoint[];
      }>(
        `SELECT z.id, z.camera_id, z.label, z.polygon
           FROM zones z
           JOIN cameras cam ON cam.id = z.camera_id
          WHERE cam.connector_id = $1`,
        [connectorId],
      );
      const schedRes = await pool.query<{ id: string; windows: ScheduleWindow[] }>(
        `SELECT s.id, s.windows
           FROM schedules s
          WHERE s.site_id = (SELECT site_id FROM connectors WHERE id = $1)`,
        [connectorId],
      );
      const ruleRes = await pool.query<{
        id: string;
        label: string;
        camera_id: string;
        zone_id: string;
        schedule_id: string | null;
        trigger: Trigger;
        action: Action;
      }>(
        `SELECT r.id, r.label, z.camera_id, r.zone_id, r.schedule_id, r.trigger, r.action
           FROM rules r
           JOIN zones z ON z.id = r.zone_id
           JOIN cameras cam ON cam.id = z.camera_id
          WHERE cam.connector_id = $1
            AND r.enabled`,
        [connectorId],
      );
      return {
        timezone: tzRes.rows[0]?.timezone ?? "UTC",
        cameras: camRes.rows.map((c) => ({
          id: c.id,
          label: c.label,
          rtspUrl: c.rtsp_url,
          zones: zoneRes.rows
            .filter((z) => z.camera_id === c.id)
            .map((z) => ({ id: z.id, label: z.label, polygon: z.polygon })),
        })),
        schedules: schedRes.rows.map((s) => ({ id: s.id, windows: s.windows })),
        rules: ruleRes.rows.map((r) => ({
          id: r.id,
          label: r.label,
          cameraId: r.camera_id,
          zoneId: r.zone_id,
          scheduleId: r.schedule_id,
          trigger: r.trigger,
          severity: r.action.severity,
        })),
      };
    },

    async createPairing(organizationId, siteId, ttlSeconds = 600) {
      const id = randomUUID();
      const code = generatePairingCode();
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await pool.query(
        `INSERT INTO pairings (id, organization_id, site_id, code, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, organizationId, siteId, code, expiresAt],
      );
      return {
        id,
        organizationId,
        siteId,
        code,
        expiresAt: expiresAt.toISOString(),
        redeemedConnectorId: null,
      };
    },

    async redeemPairing(code, info) {
      return withTx(pool, async (client) => {
        const { rows } = await client.query<{
          id: string;
          organization_id: string;
          site_id: string | null;
        }>(
          `SELECT id, organization_id, site_id FROM pairings
            WHERE code = $1
              AND redeemed_connector_id IS NULL
              AND expires_at > now()
            FOR UPDATE`,
          [code],
        );
        const pairing = rows[0];
        if (!pairing) return null;

        // Pairings created before 0006 (or whose site was deleted) carry no
        // site — fall back to the org's oldest site. connectors.site_id is
        // NOT NULL and every org always has at least one site.
        let siteId = pairing.site_id;
        if (!siteId) {
          const fallback = await client.query<{ id: string }>(
            `SELECT id FROM sites WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
            [pairing.organization_id],
          );
          siteId = fallback.rows[0]!.id;
        }

        // Resolved site's label — returned so the connector can show which
        // site it's bound to. siteId is guaranteed set above.
        const siteRow = await client.query<{ label: string }>(
          `SELECT label FROM sites WHERE id = $1`,
          [siteId],
        );
        const siteName = siteRow.rows[0]?.label ?? "";

        const connectorId = randomUUID();
        const token = generateConnectorToken();
        const tokenHash = hashToken(token);
        const label = `${info.hostname} (${info.platform})`;

        const inserted = await client.query<ConnectorRow>(
          `INSERT INTO connectors
             (id, organization_id, site_id, label, hostname, platform, version, status, token_hash, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'online', $8, now())
           RETURNING id, organization_id, site_id, label, hostname, platform, version, status, last_seen_at, created_at`,
          [connectorId, pairing.organization_id, siteId, label, info.hostname, info.platform, info.version, tokenHash],
        );

        await client.query(
          "UPDATE pairings SET redeemed_connector_id = $1 WHERE id = $2",
          [connectorId, pairing.id],
        );

        return { connector: rowToConnector(inserted.rows[0]!), token, siteName };
      });
    },

    async authConnector(connectorId, token) {
      const { rows } = await pool.query<ConnectorRow & { token_hash: string }>(
        `SELECT id, organization_id, site_id, label, hostname, platform, version, status, last_seen_at, created_at, token_hash
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

    async listConnectorsForOrg(organizationId) {
      const { rows } = await pool.query<ConnectorRow>(
        `SELECT id, organization_id, site_id, label, hostname, platform, version, status, last_seen_at, created_at
           FROM connectors
          WHERE organization_id = $1
          ORDER BY created_at DESC`,
        [organizationId],
      );
      return rows.map(rowToConnector);
    },

    async getConnectorForOrg(id, organizationId) {
      const { rows } = await pool.query<ConnectorRow>(
        `SELECT id, organization_id, site_id, label, hostname, platform, version, status, last_seen_at, created_at
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

    async createPreview({ cameraId, maxDurationSeconds, startedBy = "operator" }) {
      const { rows } = await pool.query<PreviewRow>(
        `INSERT INTO previews (camera_id, max_duration_seconds, started_by)
         VALUES ($1, $2, $3)
         RETURNING id, camera_id, status, started_by, max_duration_seconds,
                   started_at, last_heartbeat_at, ended_at, error_message`,
        [cameraId, maxDurationSeconds, startedBy],
      );
      return rowToPreview(rows[0]!);
    },

    async getActivePreviewForCamera(cameraId) {
      const { rows } = await pool.query<PreviewRow>(
        `SELECT id, camera_id, status, started_by, max_duration_seconds,
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
        `SELECT id, camera_id, status, started_by, max_duration_seconds,
                started_at, last_heartbeat_at, ended_at, error_message
           FROM previews WHERE id = $1`,
        [id],
      );
      return rows[0] ? rowToPreview(rows[0]) : null;
    },

    async getPreviewForConnector(previewId, connectorId) {
      const { rows } = await pool.query<PreviewRow>(
        `SELECT p.id, p.camera_id, p.status, p.started_by, p.max_duration_seconds,
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

    async notify(channel, payload) {
      await pool.query(`SELECT pg_notify($1, $2)`, [channel, payload]);
    },

    async listDetectionTargets() {
      const { rows } = await pool.query<{
        id: string;
        rtsp_url: string;
        connector_id: string;
      }>(
        `SELECT DISTINCT cam.id, cam.rtsp_url, cam.connector_id
           FROM cameras cam
           JOIN connectors c ON c.id = cam.connector_id
           JOIN zones z ON z.camera_id = cam.id
           JOIN rules r ON r.zone_id = z.id
          WHERE r.enabled
            AND cam.state = 'online'
            AND c.status = 'online'`,
      );
      return rows.map((r) => ({
        cameraId: r.id,
        rtspUrl: r.rtsp_url,
        connectorId: r.connector_id,
      }));
    },

    async listActiveDetectionPreviews() {
      const { rows } = await pool.query<PreviewRow & { connector_id: string }>(
        `SELECT p.id, p.camera_id, p.status, p.started_by, p.max_duration_seconds,
                p.started_at, p.last_heartbeat_at, p.ended_at, p.error_message,
                c.connector_id
           FROM previews p
           JOIN cameras c ON c.id = p.camera_id
          WHERE p.started_by = 'detection' AND p.ended_at IS NULL`,
      );
      return rows.map((r) => ({ ...rowToPreview(r), connectorId: r.connector_id }));
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
// hash without going through the store (e.g. tests).
export { hashToken, compareTokenHash };
