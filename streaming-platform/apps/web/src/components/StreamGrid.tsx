import type { LiveStream } from '@streaming/shared';
import { StreamCard } from './StreamCard';

export function StreamGrid({
  streams,
  emptyMessage = 'No live channels right now.',
}: {
  streams: LiveStream[];
  emptyMessage?: string;
}) {
  if (streams.length === 0) {
    return <div className="empty">{emptyMessage}</div>;
  }
  return (
    <div className="grid">
      {streams.map((s) => (
        <StreamCard key={s.connectionId} stream={s} />
      ))}
    </div>
  );
}
