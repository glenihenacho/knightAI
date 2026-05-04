import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, UnauthorizedError } from "./api.js";

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
