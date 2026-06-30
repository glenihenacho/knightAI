import Link from 'next/link';
import { PROVIDERS, type LiveStream } from '@streaming/shared';
import { formatViewers, initials } from '@/lib/format';
import { ProviderBadge } from './ProviderBadge';

export function StreamCard({ stream }: { stream: LiveStream }) {
  const accent = PROVIDERS[stream.provider].accent;
  return (
    <Link href={`/watch/${stream.connectionId}`} className="card">
      <div className="thumb">
        {stream.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={stream.thumbnailUrl} alt={stream.title ?? stream.streamer.displayName} />
        ) : (
          <span className="thumb-fallback" style={{ color: accent }}>
            {PROVIDERS[stream.provider].name}
          </span>
        )}
        {stream.isLive && <span className="live-badge">Live</span>}
        {stream.viewerCount !== null && (
          <span className="viewer-badge">{formatViewers(stream.viewerCount)} viewers</span>
        )}
      </div>
      <div className="card-body">
        <span className="avatar" style={{ background: accent }}>
          {initials(stream.streamer.displayName)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="card-title">{stream.title ?? stream.streamer.displayName}</div>
          <div className="card-sub">{stream.streamer.displayName}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
            <ProviderBadge provider={stream.provider} />
            {stream.category && <span className="tag">{stream.category}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
