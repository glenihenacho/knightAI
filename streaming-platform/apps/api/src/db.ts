import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

const dbPath = resolve(process.cwd(), config.databasePath);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    handle        TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    bio           TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS connections (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL,
    channel_handle      TEXT NOT NULL,
    consent             INTEGER NOT NULL DEFAULT 0,
    consented_at        TEXT,
    verified            INTEGER NOT NULL DEFAULT 0,
    oauth_access_token  TEXT,
    oauth_refresh_token TEXT,
    is_live             INTEGER NOT NULL DEFAULT 0,
    title               TEXT,
    viewer_count        INTEGER,
    thumbnail_url       TEXT,
    category            TEXT,
    last_checked_at     TEXT,
    demo                INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, provider, channel_handle)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, channel_user_id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
  CREATE INDEX IF NOT EXISTS idx_connections_live ON connections(is_live);
  CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel_user_id, id);
`);

// --- Row shapes (snake_case, as stored) ------------------------------------

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  handle: string;
  display_name: string;
  bio: string | null;
  created_at: string;
}

export interface ConnectionRow {
  id: number;
  user_id: number;
  provider: string;
  channel_handle: string;
  consent: number;
  consented_at: string | null;
  verified: number;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  is_live: number;
  title: string | null;
  viewer_count: number | null;
  thumbnail_url: string | null;
  category: string | null;
  last_checked_at: string | null;
  demo: number;
  created_at: string;
}

export interface ChatMessageRow {
  id: number;
  channel_user_id: number;
  user_id: number;
  body: string;
  created_at: string;
}
