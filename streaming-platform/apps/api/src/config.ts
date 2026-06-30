import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load a local .env file if present (Node 20.12+ / 22 built-in, no dotenv dep).
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function int(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  databasePath: process.env.DATABASE_PATH ?? './data/knightstream.db',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  demoMode: bool(process.env.DEMO_MODE, true),
  pollIntervalMs: int(process.env.POLL_INTERVAL_MS, 60_000),

  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID ?? '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY ?? '',
  },

  oauth: {
    redirectBase:
      process.env.OAUTH_REDIRECT_BASE ??
      'http://localhost:4000/api/connections/oauth',
    twitch: {
      clientId: process.env.TWITCH_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.TWITCH_OAUTH_CLIENT_SECRET ?? '',
    },
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    },
    kick: {
      clientId: process.env.KICK_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.KICK_OAUTH_CLIENT_SECRET ?? '',
    },
  },
} as const;

export type Config = typeof config;
