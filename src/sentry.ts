/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// DSN is a public identifier (like the Firebase config below it in
// firebase.ts) — safe to commit, it only tells the browser where to send
// error reports, it grants no access to anything.
// Get yours: sentry.io → your project → Settings → Client Keys (DSN).
const SENTRY_DSN = 'https://7556f29ead4c77cf2e78660505abdd38@o4511679491997696.ingest.de.sentry.io/4511679504121936';

// Dynamic import keeps @sentry/react out of the main JS chunk that every
// guest downloads on first paint — it loads in parallel, slightly after,
// without blocking the landing page from becoming visible/interactive.
export function initSentry() {
  import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: SENTRY_DSN,
      sendDefaultPii: false,
    });
  });
}
