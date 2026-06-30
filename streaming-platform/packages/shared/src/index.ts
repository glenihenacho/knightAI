/**
 * @streaming/shared
 *
 * Framework-agnostic types and the streaming-provider registry shared by the
 * API and the web app. Everything here is pure (no Node or browser globals) so
 * it can be imported from both a Fastify server and a React client.
 */

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export const PROVIDER_IDS = [
  'twitch',
  'kick',
  'youtube',
  'instagram',
  'tiktok',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderDef {
  id: ProviderId;
  /** Human-readable name shown in the UI. */
  name: string;
  /** Brand accent colour used for badges. */
  accent: string;
  /** Whether the live stream can be embedded in an <iframe> player. */
  embeddable: boolean;
  /**
   * Whether live status can be polled without API credentials. Used to decide
   * whether the poller can determine "is live" for free or needs an API key.
   */
  keylessLiveStatus: boolean;
  /** How the streamer identifies their channel (used for form hints). */
  handleHint: string;
  /** OAuth provider name, if this platform supports verified linking. */
  oauth?: 'twitch' | 'google' | 'kick';
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  twitch: {
    id: 'twitch',
    name: 'Twitch',
    accent: '#9146ff',
    embeddable: true,
    keylessLiveStatus: false,
    handleHint: 'your Twitch username, e.g. "shroud"',
    oauth: 'twitch',
  },
  kick: {
    id: 'kick',
    name: 'Kick',
    accent: '#53fc18',
    embeddable: true,
    keylessLiveStatus: true,
    handleHint: 'your Kick slug, e.g. "xqc"',
    oauth: 'kick',
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    accent: '#ff0000',
    embeddable: true,
    keylessLiveStatus: false,
    handleHint: 'your YouTube channel ID, e.g. "UCxxxx..."',
    oauth: 'google',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    accent: '#e1306c',
    // Instagram Live has no public iframe player — we link out instead.
    embeddable: false,
    keylessLiveStatus: false,
    handleHint: 'your Instagram handle, e.g. "natgeo"',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    accent: '#25f4ee',
    // TikTok Live has no stable public iframe player — we link out instead.
    embeddable: false,
    keylessLiveStatus: false,
    handleHint: 'your TikTok handle (without @), e.g. "tiktok"',
  },
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export function getProvider(id: ProviderId): ProviderDef {
  return PROVIDERS[id];
}

/**
 * Build the iframe player URL for a live stream.
 *
 * Twitch and Kick embeds require a `parent` query param matching the domain
 * the iframe is served from, so the caller must pass the current hostname
 * (e.g. `window.location.hostname`).
 *
 * Returns `null` when the provider cannot be embedded.
 */
export function buildPlayerEmbedUrl(
  provider: ProviderId,
  handle: string,
  parent: string,
): string | null {
  const h = encodeURIComponent(handle.trim());
  const p = encodeURIComponent(parent);
  switch (provider) {
    case 'twitch':
      return `https://player.twitch.tv/?channel=${h}&parent=${p}&muted=false`;
    case 'kick':
      return `https://player.kick.com/${h}`;
    case 'youtube':
      // Live embed by channel id resolves to the channel's current live stream.
      return `https://www.youtube.com/embed/live_stream?channel=${h}&autoplay=1`;
    case 'instagram':
    case 'tiktok':
      return null;
  }
}

/** Build the embeddable chat URL, when the provider offers one. */
export function buildChatEmbedUrl(
  provider: ProviderId,
  handle: string,
  parent: string,
): string | null {
  const h = encodeURIComponent(handle.trim());
  const p = encodeURIComponent(parent);
  switch (provider) {
    case 'twitch':
      return `https://www.twitch.tv/embed/${h}/chat?parent=${p}&darkpopout`;
    default:
      return null;
  }
}

/** Public channel URL on the source platform (for "watch on …" links). */
export function buildChannelUrl(provider: ProviderId, handle: string): string {
  const h = handle.trim().replace(/^@/, '');
  switch (provider) {
    case 'twitch':
      return `https://www.twitch.tv/${h}`;
    case 'kick':
      return `https://kick.com/${h}`;
    case 'youtube':
      return `https://www.youtube.com/channel/${h}/live`;
    case 'instagram':
      return `https://www.instagram.com/${h}/live`;
    case 'tiktok':
      return `https://www.tiktok.com/@${h}/live`;
  }
}

// ---------------------------------------------------------------------------
// Domain models (as returned by the API)
// ---------------------------------------------------------------------------

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  handle: string;
  createdAt: string;
}

export interface Connection {
  id: number;
  provider: ProviderId;
  channelHandle: string;
  consent: boolean;
  consentedAt: string | null;
  verified: boolean;
  createdAt: string;
}

/** A live (or recently-checked) stream surfaced on discovery pages. */
export interface LiveStream {
  connectionId: number;
  provider: ProviderId;
  channelHandle: string;
  embeddable: boolean;
  /** The streamer (KnightStream user) who owns this connection. */
  streamer: {
    id: number;
    handle: string;
    displayName: string;
  };
  isLive: boolean;
  title: string | null;
  viewerCount: number | null;
  thumbnailUrl: string | null;
  category: string | null;
  lastCheckedAt: string | null;
}

export interface ChannelProfile {
  user: {
    id: number;
    handle: string;
    displayName: string;
    bio: string | null;
  };
  followerCount: number;
  isFollowing: boolean;
  connections: LiveStream[];
}

export interface ChatMessage {
  id: number;
  channelUserId: number;
  user: {
    id: number;
    handle: string;
    displayName: string;
  };
  body: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// WebSocket chat protocol
// ---------------------------------------------------------------------------

/** Messages sent from client → server over the chat socket. */
export type ChatClientMessage = { type: 'send'; body: string };

/** Messages sent from server → client over the chat socket. */
export type ChatServerMessage =
  | { type: 'history'; messages: ChatMessage[] }
  | { type: 'message'; message: ChatMessage }
  | { type: 'presence'; viewers: number }
  | { type: 'error'; error: string };

export const CHAT_MAX_LENGTH = 500;
