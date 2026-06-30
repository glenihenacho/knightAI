'use client';

import { useEffect, useState } from 'react';
import type { LiveStream } from '@streaming/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { StreamGrid } from '@/components/StreamGrid';

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [live, setLive] = useState<LiveStream[]>([]);
  const [following, setFollowing] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .liveStreams()
      .then((res) => setLive(res.streams))
      .catch(() => setLive([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setFollowing([]);
      return;
    }
    api
      .followingLive()
      .then((res) => setFollowing(res.streams))
      .catch(() => setFollowing([]));
  }, [user]);

  return (
    <div>
      <section
        style={{
          padding: '8px 0 4px',
        }}
      >
        <h1 style={{ fontSize: 26, margin: '0 0 4px' }}>Live now on KnightStream</h1>
        <p className="muted" style={{ margin: 0 }}>
          One place for live streams across Twitch, Kick, YouTube, Instagram &amp; TikTok —
          every channel linked with the streamer&apos;s consent.
        </p>
      </section>

      {!authLoading && user && following.length > 0 && (
        <>
          <h2 className="section-title">Channels you follow</h2>
          <StreamGrid streams={following} />
        </>
      )}

      <h2 className="section-title">Live channels</h2>
      {loading ? (
        <div className="empty">Loading live channels…</div>
      ) : (
        <StreamGrid
          streams={live}
          emptyMessage="No one is live yet. Be the first — head to “Go Live”."
        />
      )}
    </div>
  );
}
