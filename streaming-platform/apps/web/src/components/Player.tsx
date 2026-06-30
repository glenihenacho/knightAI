'use client';

import { useEffect, useState } from 'react';
import {
  PROVIDERS,
  buildChannelUrl,
  buildPlayerEmbedUrl,
  type ProviderId,
} from '@streaming/shared';

export function Player({
  provider,
  channelHandle,
}: {
  provider: ProviderId;
  channelHandle: string;
}) {
  // Twitch/Kick embeds need the host as `parent`; only known after mount.
  const [parent, setParent] = useState<string | null>(null);
  useEffect(() => {
    setParent(window.location.hostname);
  }, []);

  const def = PROVIDERS[provider];

  if (!def.embeddable) {
    const url = buildChannelUrl(provider, channelHandle);
    return (
      <div className="player-wrap">
        <div className="player-fallback">
          <div style={{ fontSize: 44, fontWeight: 900, color: def.accent }}>{def.name}</div>
          <p className="muted" style={{ maxWidth: 420 }}>
            {def.name} Live can&apos;t be embedded here. Watch it directly on {def.name} —
            this channel was linked with the streamer&apos;s consent.
          </p>
          <a
            className="btn btn-primary"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Watch on {def.name} ↗
          </a>
        </div>
      </div>
    );
  }

  if (!parent) {
    return <div className="player-wrap" />;
  }

  const src = buildPlayerEmbedUrl(provider, channelHandle, parent);
  if (!src) return <div className="player-wrap" />;

  return (
    <div className="player-wrap">
      <iframe
        src={src}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        title={`${def.name} player`}
      />
    </div>
  );
}
