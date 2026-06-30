import type {
  ChannelProfile,
  Connection,
  LiveStream,
  ProviderId,
  PublicUser,
} from '@streaming/shared';
import { API_URL } from './config';

const TOKEN_KEY = 'knightstream.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.error as string)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  // Auth
  signup: (email: string, password: string, displayName: string) =>
    request<{ token: string; user: PublicUser }>('/api/auth/signup', {
      method: 'POST',
      body: { email, password, displayName },
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  session: () => request<{ user: PublicUser | null }>('/api/auth/session', { auth: true }),

  // Discovery
  liveStreams: () => request<{ streams: LiveStream[] }>('/api/streams/live'),
  stream: (id: number) => request<{ stream: LiveStream }>(`/api/streams/${id}`),
  followingLive: () =>
    request<{ streams: LiveStream[] }>('/api/me/following/live', { auth: true }),

  // Channels + follows
  channel: (handle: string) =>
    request<{ channel: ChannelProfile }>(`/api/channels/${handle}`, { auth: true }),
  follow: (userId: number) =>
    request<void>(`/api/channels/${userId}/follow`, { method: 'POST', auth: true }),
  unfollow: (userId: number) =>
    request<void>(`/api/channels/${userId}/follow`, { method: 'DELETE', auth: true }),

  // Connections
  connections: () =>
    request<{ connections: Connection[] }>('/api/connections', { auth: true }),
  linkConnection: (provider: ProviderId, channelHandle: string) =>
    request<{ connection: Connection }>('/api/connections', {
      method: 'POST',
      auth: true,
      body: { provider, channelHandle, consent: true },
    }),
  unlinkConnection: (id: number) =>
    request<void>(`/api/connections/${id}`, { method: 'DELETE', auth: true }),
  oauthStart: (provider: 'twitch' | 'google') =>
    request<{ authorizeUrl: string }>(`/api/connections/oauth/${provider}/start`, {
      auth: true,
    }),
};
