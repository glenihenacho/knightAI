'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PROVIDERS, buildChannelUrl, type LiveStream } from '@streaming/shared';
import { api } from '@/lib/api';
import { formatViewers, initials } from '@/lib/format';
import { Player } from '@/components/Player';
import { Chat } from '@/components/Chat';
import { ProviderBadge } from '@/components/ProviderBadge';
import { FollowButton } from '@/components/FollowButton';

export default function WatchPage() {
  const params = useParams<{ id: string }>();
  const id = Number.parseInt(params.id, 10);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError('Invalid stream.');
      return;
    }
    api
      .stream(id)
      .then((res) => setStream(res.stream))
      .catch(() => setError('Stream not found.'));
  }, [id]);

  if (error) return <div className="empty">{error}</div>;
  if (!stream) return <div className="empty">Loading stream…</div>;

  const accent = PROVIDERS[stream.provider].accent;

  return (
    <div className="watch-layout">
      <div>
        <Player provider={stream.provider} channelHandle={stream.channelHandle} />
        <div className="watch-meta">
          <Link href={`/channel/${stream.streamer.handle}`}>
            <span className="avatar" style={{ background: accent, width: 44, height: 44 }}>
              {initials(stream.streamer.displayName)}
            </span>
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="watch-title">{stream.title ?? stream.streamer.displayName}</div>
            <Link href={`/channel/${stream.streamer.handle}`} style={{ fontWeight: 700 }}>
              {stream.streamer.displayName}
            </Link>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <ProviderBadge provider={stream.provider} />
              {stream.category && <span className="tag">{stream.category}</span>}
              {stream.isLive ? (
                <span className="tag" style={{ color: '#fff' }}>
                  <span className="dot dot-live" /> {formatViewers(stream.viewerCount)} watching
                </span>
              ) : (
                <span className="tag">Offline</span>
              )}
            </div>
          </div>
          <FollowButton channelUserId={stream.streamer.id} initialFollowing={false} />
          <a
            className="btn"
            href={buildChannelUrl(stream.provider, stream.channelHandle)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on {PROVIDERS[stream.provider].name} ↗
          </a>
        </div>
      </div>
      <Chat channelUserId={stream.streamer.id} />
    </div>
  );
}
