'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ChannelProfile } from '@streaming/shared';
import { api } from '@/lib/api';
import { initials } from '@/lib/format';
import { StreamGrid } from '@/components/StreamGrid';
import { FollowButton } from '@/components/FollowButton';

export default function ChannelPage() {
  const params = useParams<{ handle: string }>();
  const [profile, setProfile] = useState<ChannelProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .channel(params.handle)
      .then((res) => setProfile(res.channel))
      .catch(() => setError('Channel not found.'));
  }, [params.handle]);

  if (error) return <div className="empty">{error}</div>;
  if (!profile) return <div className="empty">Loading channel…</div>;

  const liveCount = profile.connections.filter((c) => c.isLive).length;

  return (
    <div>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8 }}>
        <span
          className="avatar"
          style={{ background: 'var(--accent)', width: 72, height: 72, fontSize: 26 }}
        >
          {initials(profile.user.displayName)}
        </span>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: '0 0 2px', fontSize: 24 }}>{profile.user.displayName}</h1>
          <div className="muted">@{profile.user.handle}</div>
          {profile.user.bio && <p style={{ margin: '8px 0 0' }}>{profile.user.bio}</p>}
          <div className="muted" style={{ marginTop: 6 }}>
            {profile.followerCount} follower{profile.followerCount === 1 ? '' : 's'} ·{' '}
            {liveCount > 0 ? `${liveCount} live now` : 'offline'}
          </div>
        </div>
        <FollowButton channelUserId={profile.user.id} initialFollowing={profile.isFollowing} />
      </header>

      <h2 className="section-title">Channels &amp; platforms</h2>
      <StreamGrid
        streams={profile.connections}
        emptyMessage="This streamer hasn't linked any platforms yet."
      />
    </div>
  );
}
