/**
 * Seeds demo data so the platform shows live content without real provider
 * credentials. Demo connections are flagged `demo = 1`; in DEMO_MODE the
 * poller leaves them exactly as configured here.
 *
 * Run with: pnpm --filter @streaming/api seed
 */
import type { ProviderId } from '@streaming/shared';
import { db, type UserRow } from './db.js';
import { hashPassword } from './auth.js';

const DEMO_PASSWORD = 'demo12345';

interface DemoStreamer {
  email: string;
  handle: string;
  displayName: string;
  bio: string;
  provider: ProviderId;
  channelHandle: string;
  title: string;
  viewerCount: number;
  category: string;
}

// Real, public channels so the embedded players resolve to actual streams.
const STREAMERS: DemoStreamer[] = [
  {
    email: 'lofi@knightstream.tv',
    handle: 'lofigirl',
    displayName: 'Lofi Girl',
    bio: 'beats to relax/study to — 24/7 live',
    provider: 'youtube',
    channelHandle: 'UCSJ4gkVC6NrvII8umztf0Ow',
    title: 'lofi hip hop radio 📚 - beats to relax/study to',
    viewerCount: 41200,
    category: 'Music',
  },
  {
    email: 'kick@knightstream.tv',
    handle: 'kickcreator',
    displayName: 'Kick Creator',
    bio: 'variety streamer on Kick',
    provider: 'kick',
    channelHandle: 'xqc',
    title: 'JUICED — variety & just chatting',
    viewerCount: 18750,
    category: 'Just Chatting',
  },
  {
    email: 'twitch@knightstream.tv',
    handle: 'twitchcreator',
    displayName: 'Twitch Creator',
    bio: 'pro gameplay & community nights',
    provider: 'twitch',
    channelHandle: 'ninja',
    title: 'Ranked grind — drops enabled',
    viewerCount: 22300,
    category: 'Fortnite',
  },
  {
    email: 'natgeo@knightstream.tv',
    handle: 'natgeo',
    displayName: 'Nat Geo',
    bio: 'exploring the planet, live',
    provider: 'instagram',
    channelHandle: 'natgeo',
    title: 'Live from the field 🌍',
    viewerCount: 9800,
    category: 'IRL',
  },
  {
    email: 'tiktoklive@knightstream.tv',
    handle: 'tiktokcreator',
    displayName: 'TikTok Creator',
    bio: 'going live on TikTok',
    provider: 'tiktok',
    channelHandle: 'tiktok',
    title: 'Q&A + behind the scenes',
    viewerCount: 15400,
    category: 'IRL',
  },
];

const upsertUser = db.prepare(
  `INSERT INTO users (email, password_hash, handle, display_name, bio)
   VALUES (@email, @passwordHash, @handle, @displayName, @bio)
   ON CONFLICT (email) DO UPDATE SET
     handle = excluded.handle,
     display_name = excluded.display_name,
     bio = excluded.bio`,
);
const getUserByEmail = db.prepare<[string], UserRow>(
  'SELECT * FROM users WHERE email = ?',
);
const upsertConnection = db.prepare(
  `INSERT INTO connections
     (user_id, provider, channel_handle, consent, consented_at, verified,
      is_live, title, viewer_count, category, demo, last_checked_at)
   VALUES
     (@userId, @provider, @channelHandle, 1, datetime('now'), 1,
      1, @title, @viewerCount, @category, 1, datetime('now'))
   ON CONFLICT (user_id, provider, channel_handle) DO UPDATE SET
     consent = 1, is_live = 1, title = excluded.title,
     viewer_count = excluded.viewer_count, category = excluded.category,
     demo = 1, last_checked_at = datetime('now')`,
);

async function main(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // A regular viewer account for trying out follow + chat.
  upsertUser.run({
    email: 'demo@knightstream.tv',
    passwordHash,
    handle: 'demo',
    displayName: 'Demo Viewer',
    bio: 'just here to watch',
  });

  for (const s of STREAMERS) {
    upsertUser.run({
      email: s.email,
      passwordHash,
      handle: s.handle,
      displayName: s.displayName,
      bio: s.bio,
    });
    const user = getUserByEmail.get(s.email);
    if (!user) throw new Error(`Failed to upsert user ${s.email}`);
    upsertConnection.run({
      userId: user.id,
      provider: s.provider,
      channelHandle: s.channelHandle,
      title: s.title,
      viewerCount: s.viewerCount,
      category: s.category,
    });
  }

  const total = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM connections').get();
  console.log(`Seeded ${STREAMERS.length} demo streamers (${total?.n ?? 0} connections total).`);
  console.log(`Demo login: demo@knightstream.tv / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
