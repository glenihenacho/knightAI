'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function FollowButton({
  channelUserId,
  initialFollowing,
}: {
  channelUserId: number;
  initialFollowing: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  // Hide on your own channel.
  if (user && user.id === channelUserId) return null;

  async function toggle() {
    if (!user) {
      router.push('/login');
      return;
    }
    setBusy(true);
    try {
      if (following) {
        await api.unfollow(channelUserId);
        setFollowing(false);
      } else {
        await api.follow(channelUserId);
        setFollowing(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={following ? 'btn' : 'btn btn-primary'}
      onClick={toggle}
      disabled={busy}
    >
      {following ? '✓ Following' : '♥ Follow'}
    </button>
  );
}
