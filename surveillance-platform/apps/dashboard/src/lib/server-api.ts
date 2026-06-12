import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError, UnauthorizedError } from "./api.js";

// Forwards the operator's session cookie from the incoming HTTP request into
// the outbound API call. Used by server components.
function cookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export async function requireSession() {
  try {
    return await api.me({ cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}

export async function listConnectorsServer() {
  try {
    return await api.listConnectors({ cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}

export async function listCamerasServer() {
  try {
    return await api.listCameras({ cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}

export async function listInvitesServer() {
  try {
    return await api.listInvites({ cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}

export async function listOrganizationsServer() {
  try {
    return await api.listOrganizations({ cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}

export async function listSitesServer() {
  try {
    return await api.listSites({ cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}

/** Returns null on 404 so pages can render notFound(). */
export async function getSiteServer(id: string) {
  try {
    const { site } = await api.getSite(id, { cookie: cookieHeader() });
    return site;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function listZonesServer(cameraId: string) {
  try {
    return await api.listZones(cameraId, { cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}

export async function listSchedulesServer(siteId: string) {
  try {
    return await api.listSchedules(siteId, { cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}

export async function listRulesServer(siteId: string) {
  try {
    return await api.listRules(siteId, { cookie: cookieHeader() });
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    throw err;
  }
}
