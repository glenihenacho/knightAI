export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Base URL for the chat WebSocket (derived from API_URL). */
export function wsUrl(path: string): string {
  const base = API_URL.replace(/^http/, 'ws');
  return `${base}${path}`;
}
