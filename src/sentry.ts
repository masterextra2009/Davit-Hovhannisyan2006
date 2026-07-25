/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Sentry from '@sentry/react';

// DSN is a public identifier (like the Firebase config below it in
// firebase.ts) — safe to commit, it only tells the browser where to send
// error reports, it grants no access to anything.
// Get yours: sentry.io → your project → Settings → Client Keys (DSN).
const SENTRY_DSN = 'https://7556f29ead4c77cf2e78660505abdd38@o4511679491997696.ingest.de.sentry.io/4511679504121936';

export function initSentry() {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
  });
}
