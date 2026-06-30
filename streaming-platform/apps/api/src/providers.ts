import type { ProviderId } from '@streaming/shared';
import { config } from './config.js';

/**
 * Result of polling a provider for live status.
 * `null` means "could not determine" (e.g. no credentials / no public API) —
 * the caller should leave the previous status untouched rather than assume
 * the channel is offline.
 */
export interface LiveStatus {
  isLive: boolean;
  title: string | null;
  viewerCount: number | null;
  thumbnailUrl: string | null;
  category: string | null;
}

const TIMEOUT_MS = 8000;

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// --- Kick (keyless public endpoint) ----------------------------------------

async function fetchKick(handle: string): Promise<LiveStatus | null> {
  try {
    const data = (await getJson(
      `https://kick.com/api/v2/channels/${encodeURIComponent(handle)}`,
    )) as {
      livestream: {
        is_live?: boolean;
        session_title?: string;
        viewer_count?: number;
        thumbnail?: { url?: string };
        categories?: Array<{ name?: string }>;
      } | null;
    };
    const ls = data.livestream;
    if (!ls || !ls.is_live) {
      return { isLive: false, title: null, viewerCount: null, thumbnailUrl: null, category: null };
    }
    return {
      isLive: true,
      title: ls.session_title ?? null,
      viewerCount: ls.viewer_count ?? null,
      thumbnailUrl: ls.thumbnail?.url ?? null,
      category: ls.categories?.[0]?.name ?? null,
    };
  } catch {
    return null;
  }
}

// --- Twitch (Helix; needs client id + secret) ------------------------------

let twitchToken: { value: string; expiresAt: number } | null = null;

async function getTwitchToken(): Promise<string | null> {
  const { clientId, clientSecret } = config.twitch;
  if (!clientId || !clientSecret) return null;
  if (twitchToken && twitchToken.expiresAt > Date.now() + 60_000) {
    return twitchToken.value;
  }
  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });
    const data = (await getJson(
      `https://id.twitch.tv/oauth2/token?${params.toString()}`,
      { method: 'POST' },
    )) as { access_token: string; expires_in: number };
    twitchToken = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return twitchToken.value;
  } catch {
    return null;
  }
}

async function fetchTwitch(handle: string): Promise<LiveStatus | null> {
  const token = await getTwitchToken();
  if (!token) return null;
  try {
    const data = (await getJson(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(handle)}`,
      {
        headers: {
          'Client-Id': config.twitch.clientId,
          Authorization: `Bearer ${token}`,
        },
      },
    )) as {
      data: Array<{
        title?: string;
        viewer_count?: number;
        thumbnail_url?: string;
        game_name?: string;
      }>;
    };
    const stream = data.data[0];
    if (!stream) {
      return { isLive: false, title: null, viewerCount: null, thumbnailUrl: null, category: null };
    }
    const thumb = stream.thumbnail_url
      ?.replace('{width}', '440')
      .replace('{height}', '248');
    return {
      isLive: true,
      title: stream.title ?? null,
      viewerCount: stream.viewer_count ?? null,
      thumbnailUrl: thumb ?? null,
      category: stream.game_name ?? null,
    };
  } catch {
    return null;
  }
}

// --- YouTube (Data API v3; needs API key) ----------------------------------

async function fetchYouTube(channelId: string): Promise<LiveStatus | null> {
  const key = config.youtube.apiKey;
  if (!key) return null;
  try {
    const search = (await getJson(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(
        channelId,
      )}&eventType=live&type=video&key=${key}`,
    )) as {
      items: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; thumbnails?: { medium?: { url?: string } } };
      }>;
    };
    const item = search.items[0];
    if (!item || !item.id?.videoId) {
      return { isLive: false, title: null, viewerCount: null, thumbnailUrl: null, category: null };
    }
    let viewerCount: number | null = null;
    try {
      const details = (await getJson(
        `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${item.id.videoId}&key=${key}`,
      )) as {
        items: Array<{
          liveStreamingDetails?: { concurrentViewers?: string };
        }>;
      };
      const cv = details.items[0]?.liveStreamingDetails?.concurrentViewers;
      viewerCount = cv ? Number.parseInt(cv, 10) : null;
    } catch {
      /* viewers are best-effort */
    }
    return {
      isLive: true,
      title: item.snippet?.title ?? null,
      viewerCount,
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
      category: null,
    };
  } catch {
    return null;
  }
}

/**
 * Poll a provider for the live status of a channel.
 * Returns `null` when status cannot be determined for this provider/config.
 */
export function fetchLiveStatus(
  provider: ProviderId,
  handle: string,
): Promise<LiveStatus | null> {
  switch (provider) {
    case 'kick':
      return fetchKick(handle);
    case 'twitch':
      return fetchTwitch(handle);
    case 'youtube':
      return fetchYouTube(handle);
    case 'instagram':
    case 'tiktok':
      // No public live-status API; status is managed manually / via demo mode.
      return Promise.resolve(null);
  }
}
