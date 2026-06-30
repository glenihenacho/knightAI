import {
  PROVIDERS,
  isProviderId,
  type Connection,
  type LiveStream,
  type ProviderId,
  type PublicUser,
  type ChatMessage,
} from '@streaming/shared';
import type { ChatMessageRow, ConnectionRow, UserRow } from './db.js';

function asProvider(value: string): ProviderId {
  // Stored providers are always validated on write; fall back defensively.
  return isProviderId(value) ? value : 'twitch';
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    handle: row.handle,
    createdAt: row.created_at,
  };
}

export function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    provider: asProvider(row.provider),
    channelHandle: row.channel_handle,
    consent: row.consent === 1,
    consentedAt: row.consented_at,
    verified: row.verified === 1,
    createdAt: row.created_at,
  };
}

export function toLiveStream(conn: ConnectionRow, streamer: UserRow): LiveStream {
  const provider = asProvider(conn.provider);
  return {
    connectionId: conn.id,
    provider,
    channelHandle: conn.channel_handle,
    embeddable: PROVIDERS[provider].embeddable,
    streamer: {
      id: streamer.id,
      handle: streamer.handle,
      displayName: streamer.display_name,
    },
    isLive: conn.is_live === 1,
    title: conn.title,
    viewerCount: conn.viewer_count,
    thumbnailUrl: conn.thumbnail_url,
    category: conn.category,
    lastCheckedAt: conn.last_checked_at,
  };
}

export function toChatMessage(row: ChatMessageRow, user: UserRow): ChatMessage {
  return {
    id: row.id,
    channelUserId: row.channel_user_id,
    user: {
      id: user.id,
      handle: user.handle,
      displayName: user.display_name,
    },
    body: row.body,
    createdAt: row.created_at,
  };
}
