import jwt from 'jsonwebtoken';
import type { ProviderId } from '@streaming/shared';
import { config } from './config.js';

/**
 * OAuth is the "verified" linking path: the streamer proves ownership of the
 * external account. It is fully optional — providers without configured
 * credentials fall back to manual consented linking. Only Twitch and
 * Google/YouTube implement the standard code flow here; Kick/Instagram/TikTok
 * use manual linking.
 */

export type OAuthProvider = 'twitch' | 'google';

interface OAuthEndpoints {
  provider: ProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  /** Resolve the external channel handle from an access token. */
  resolveHandle: (accessToken: string) => Promise<string>;
}

function endpoints(provider: OAuthProvider): OAuthEndpoints | null {
  if (provider === 'twitch') {
    const { clientId, clientSecret } = config.oauth.twitch;
    if (!clientId || !clientSecret) return null;
    return {
      provider: 'twitch',
      authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
      tokenUrl: 'https://id.twitch.tv/oauth2/token',
      scope: 'user:read:email',
      clientId,
      clientSecret,
      resolveHandle: async (token) => {
        const res = await fetch('https://api.twitch.tv/helix/users', {
          headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        });
        const data = (await res.json()) as { data?: Array<{ login?: string }> };
        const login = data.data?.[0]?.login;
        if (!login) throw new Error('Could not resolve Twitch login');
        return login;
      },
    };
  }
  // google → youtube
  const { clientId, clientSecret } = config.oauth.google;
  if (!clientId || !clientSecret) return null;
  return {
    provider: 'youtube',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    clientId,
    clientSecret,
    resolveHandle: async (token) => {
      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        },
      );
      const data = (await res.json()) as { items?: Array<{ id?: string }> };
      const id = data.items?.[0]?.id;
      if (!id) throw new Error('Could not resolve YouTube channel id');
      return id;
    },
  };
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'twitch' || value === 'google';
}

export function getOAuthEndpoints(provider: OAuthProvider): OAuthEndpoints | null {
  return endpoints(provider);
}

function redirectUri(provider: OAuthProvider): string {
  return `${config.oauth.redirectBase}/${provider}/callback`;
}

/** Sign a short-lived state token binding the flow to a user. */
export function signState(userId: number, provider: OAuthProvider): string {
  return jwt.sign({ sub: String(userId), provider }, config.jwtSecret, {
    expiresIn: '10m',
  });
}

export function verifyState(
  state: string,
): { userId: number; provider: OAuthProvider } | null {
  try {
    const payload = jwt.verify(state, config.jwtSecret);
    if (
      typeof payload === 'object' &&
      payload.sub &&
      isOAuthProvider(String((payload as { provider?: string }).provider))
    ) {
      return {
        userId: Number.parseInt(String(payload.sub), 10),
        provider: (payload as { provider: OAuthProvider }).provider,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(
  provider: OAuthProvider,
  ep: OAuthEndpoints,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: ep.clientId,
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    scope: ep.scope,
    state,
  });
  return `${ep.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCode(
  provider: OAuthProvider,
  ep: OAuthEndpoints,
  code: string,
): Promise<{ accessToken: string; refreshToken: string | null; handle: string }> {
  const body = new URLSearchParams({
    client_id: ep.clientId,
    client_secret: ep.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(provider),
  });
  const res = await fetch(ep.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status}`);
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
  };
  const handle = await ep.resolveHandle(tokens.access_token);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    handle,
  };
}
