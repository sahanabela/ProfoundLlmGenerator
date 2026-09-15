// Standalone entry point for the monitoring scheduler.
//
// Run alongside the web app (in a separate terminal) with `npm run scheduler`.
// This is intentionally a separate process rather than something started
// in-process by the Next.js server, since the latter's lifecycle is a poor
// fit for a long-running background timer (dev-mode hot reloads, serverless
// deploys, etc). See lib/monitoring/scheduler.ts for the swappable interface.

import { LocalPollingScheduler } from '@/lib/monitoring/scheduler';

const POLL_INTERVAL_MS = Number(process.env.SCHEDULER_POLL_INTERVAL_MS ?? 5 * 60 * 1000);

console.log(`[scheduler] starting — polling for due websites every ${POLL_INTERVAL_MS / 1000}s`);

const scheduler = new LocalPollingScheduler(POLL_INTERVAL_MS);
scheduler.start();

process.on('SIGINT', () => {
  console.log('\n[scheduler] stopping');
  scheduler.stop();
  process.exit(0);
});
