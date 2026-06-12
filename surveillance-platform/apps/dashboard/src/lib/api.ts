import type {
  Camera,
  Connector,
  CreateCameraRequest,
  CreateInviteRequest,
  CreatePairingResponse,
  CreateRuleRequest,
  CreateScheduleRequest,
  CreateSiteRequest,
  CreateZoneRequest,
  Invite,
  MeResponse,
  PreviewSessionResponse,
  Rule,
  Schedule,
  Site,
  UpdateRuleRequest,
  UpdateScheduleRequest,
  UpdateSiteRequest,
  UpdateZoneRequest,
  Zone,
} from "@surveillance/shared";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface FetchOptions {
  /**
   * Optional explicit cookie header. Used by server components — they receive
   * the operator's request cookie via next/headers `cookies()` and forward it
   * to the API. Browser-side calls leave this undefined and rely on the
   * `credentials: 'include'` cookie jar.
   */
  cookie?: string;
}

async function call<T>(path: string, init: RequestInit, opts: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`api ${status}: ${body}`);
    this.name = "ApiError";
    this.status = status;
  }
}

export const api = {
  me: (opts: FetchOptions = {}) => call<MeResponse>("/v1/auth/me", { method: "GET" }, opts),
  listOrganizations: (opts: FetchOptions = {}) =>
    call<{ organizations: { id: string; name: string }[] }>(
      "/v1/organizations",
      { method: "GET" },
      opts,
    ),
  requestMagicLink: (email: string) =>
    call<void>(
      "/v1/auth/magic-link",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      },
    ),
  logout: () => call<void>("/v1/auth/logout", { method: "POST" }),

  createPairing: (siteId?: string) =>
    call<CreatePairingResponse>("/v1/pairings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(siteId ? { siteId } : {}),
    }),

  listSites: (opts: FetchOptions = {}) =>
    call<{ sites: Site[] }>("/v1/sites", { method: "GET" }, opts),

  getSite: (id: string, opts: FetchOptions = {}) =>
    call<{ site: Site }>(`/v1/sites/${encodeURIComponent(id)}`, { method: "GET" }, opts),

  createSite: (req: CreateSiteRequest) =>
    call<{ site: Site }>("/v1/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  updateSite: (id: string, req: UpdateSiteRequest) =>
    call<{ site: Site }>(`/v1/sites/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  deleteSite: (id: string) =>
    call<void>(`/v1/sites/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listZones: (cameraId: string, opts: FetchOptions = {}) =>
    call<{ zones: Zone[] }>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/zones`,
      { method: "GET" },
      opts,
    ),

  createZone: (cameraId: string, req: CreateZoneRequest) =>
    call<{ zone: Zone }>(`/v1/cameras/${encodeURIComponent(cameraId)}/zones`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  updateZone: (id: string, req: UpdateZoneRequest) =>
    call<{ zone: Zone }>(`/v1/zones/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  deleteZone: (id: string) =>
    call<void>(`/v1/zones/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listSchedules: (siteId: string, opts: FetchOptions = {}) =>
    call<{ schedules: Schedule[] }>(
      `/v1/sites/${encodeURIComponent(siteId)}/schedules`,
      { method: "GET" },
      opts,
    ),

  createSchedule: (siteId: string, req: CreateScheduleRequest) =>
    call<{ schedule: Schedule }>(`/v1/sites/${encodeURIComponent(siteId)}/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  updateSchedule: (id: string, req: UpdateScheduleRequest) =>
    call<{ schedule: Schedule }>(`/v1/schedules/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  deleteSchedule: (id: string) =>
    call<void>(`/v1/schedules/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listRules: (siteId: string, opts: FetchOptions = {}) =>
    call<{ rules: Rule[] }>(
      `/v1/sites/${encodeURIComponent(siteId)}/rules`,
      { method: "GET" },
      opts,
    ),

  createRule: (siteId: string, req: CreateRuleRequest) =>
    call<{ rule: Rule }>(`/v1/sites/${encodeURIComponent(siteId)}/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  updateRule: (id: string, req: UpdateRuleRequest) =>
    call<{ rule: Rule }>(`/v1/rules/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  deleteRule: (id: string) =>
    call<void>(`/v1/rules/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listConnectors: (opts: FetchOptions = {}) =>
    call<{ connectors: Connector[] }>("/v1/connectors", { method: "GET" }, opts),

  listCameras: (opts: FetchOptions = {}) =>
    call<{ cameras: Camera[] }>("/v1/cameras", { method: "GET" }, opts),

  createCamera: (req: CreateCameraRequest) =>
    call<{ camera: Camera; queuedCommandId: string }>("/v1/cameras", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  startPreview: (cameraId: string) =>
    call<PreviewSessionResponse>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/preview`,
      { method: "POST" },
    ),

  stopPreview: (cameraId: string) =>
    call<void>(
      `/v1/cameras/${encodeURIComponent(cameraId)}/preview`,
      { method: "DELETE" },
    ),

  heartbeatPreview: (previewId: string) =>
    call<void>(
      `/v1/previews/${encodeURIComponent(previewId)}/heartbeat`,
      { method: "POST" },
    ),

  createInvite: (req: CreateInviteRequest) =>
    call<Invite>("/v1/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),

  listInvites: (opts: FetchOptions = {}) =>
    call<{ invites: Invite[] }>("/v1/invites", { method: "GET" }, opts),
};

export const SNAPSHOT_URL = (key: string) => `${BASE}/v1/snapshots/${encodeURIComponent(key)}`;
