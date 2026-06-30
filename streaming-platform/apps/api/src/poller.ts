import { isProviderId } from '@streaming/shared';
import { config } from './config.js';
import { db, type ConnectionRow } from './db.js';
import { fetchLiveStatus } from './providers.js';

const selectPollable = db.prepare<[], ConnectionRow>(
  'SELECT * FROM connections WHERE consent = 1',
);

const updateStatus = db.prepare(
  `UPDATE connections
     SET is_live = ?, title = ?, viewer_count = ?, thumbnail_url = ?,
         category = ?, last_checked_at = datetime('now')
   WHERE id = ?`,
);

const touchChecked = db.prepare(
  `UPDATE connections SET last_checked_at = datetime('now') WHERE id = ?`,
);

let timer: NodeJS.Timeout | null = null;
let running = false;

async function pollOnce(): Promise<void> {
  if (running) return; // avoid overlap on slow networks
  running = true;
  try {
    const rows = selectPollable.all();
    for (const row of rows) {
      // In demo mode, leave demo-seeded channels exactly as configured.
      if (config.demoMode && row.demo === 1) continue;
      if (!isProviderId(row.provider)) continue;

      const status = await fetchLiveStatus(row.provider, row.channel_handle);
      if (status === null) {
        // Couldn't determine — don't clobber the existing value.
        touchChecked.run(row.id);
        continue;
      }
      updateStatus.run(
        status.isLive ? 1 : 0,
        status.title,
        status.viewerCount,
        status.thumbnailUrl,
        status.category,
        row.id,
      );
    }
  } finally {
    running = false;
  }
}

export function startPoller(log: (msg: string) => void): void {
  const tick = () => {
    pollOnce().catch((err) => log(`poll error: ${String(err)}`));
  };
  // First run shortly after boot, then on the configured interval.
  setTimeout(tick, 2000);
  timer = setInterval(tick, config.pollIntervalMs);
  log(
    `live poller started (interval ${config.pollIntervalMs}ms, demoMode=${config.demoMode})`,
  );
}

export function stopPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
