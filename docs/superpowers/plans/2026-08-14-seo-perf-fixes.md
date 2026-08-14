# SEO/Perf Fixes (Landing Prerender, Bundle Size, Cloudflare) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the guest landing page's real text visible to search-engine crawlers without executing JS, shrink the JS that guests download on first load, and re-enable Cloudflare proxying — without touching the logged-in Dashboard/AdminPanel experience.

**Architecture:** A new build-time Node script renders `LandingPage.tsx` to a static HTML string (via `esbuild` + `react-dom/server`, both already project dependencies) and injects it into `dist/index.html`'s `<div id="root">` after `vite build` runs, so the existing GitHub Actions → SFTP → Beget pipeline picks it up automatically. Separately, `@sentry/react` is switched from a static import to a dynamic one so it stops bloating the main JS chunk that every guest downloads.

**Tech Stack:** Vite 6, React 19, TypeScript, esbuild (devDependency, already installed), react-dom/server, no new npm packages.

## Global Constraints

- Do not modify anything under `src/components/Dashboard.tsx`, `AdminPanel.tsx`, `AuthScreen.tsx` or any authenticated-only screen — out of scope, not indexed by search engines anyway.
- `LandingPage.tsx`'s visible output and behavior for real visitors must stay identical — this is a build-output change only, not a redesign.
- The production build must remain pure static files (no Node server introduced) — Beget hosting only accepts static files over SFTP.
- No new runtime npm dependencies. `esbuild` and `react-dom` are already present.
- This repo has no test runner configured (`npm run lint` is `tsc --noEmit` only) — verification steps use direct commands and content assertions (`grep`/`Select-String`), not a test framework, consistent with existing project conventions.
- Nothing in this plan is deployed to production (`git push` to `main`) without the user's explicit go-ahead first — the GitHub Actions workflow on `main` deploys straight to the live site.

---

### Task 1: Build-time prerender of the landing page

**Files:**
- Create: `scripts/render-landing-entry.tsx`
- Create: `scripts/prerender-landing.mjs`
- Modify: `package.json:8` (the `"build"` script)
- Modify: `.gitignore` (ignore the script's temp bundle file)

**Interfaces:**
- Consumes: `LandingPage` named export from `src/components/LandingPage.tsx` (signature: `LandingPage({ onEnter: () => void }): JSX.Element`, already exists, unchanged).
- Produces: `dist/index.html` with real HTML inside `<div id="root">...</div>` instead of empty — no other task depends on this output programmatically, it's the final deliverable for Task 1.

- [ ] **Step 1: Create the SSR entry point**

`scripts/render-landing-entry.tsx`:

```tsx
import { renderToString } from 'react-dom/server';
import { LandingPage } from '../src/components/LandingPage';

export function renderLandingHtml(): string {
  return renderToString(<LandingPage onEnter={() => {}} />);
}
```

- [ ] **Step 2: Create the prerender script**

`scripts/prerender-landing.mjs`:

```js
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const bundlePath = path.join(__dirname, '.tmp-prerender-landing-bundle.cjs');
const distIndexPath = path.join(projectRoot, 'dist', 'index.html');
const ROOT_MARKER = '<div id="root"></div>';

async function main() {
  // Bundle the SSR entry (+ LandingPage + its deps: motion/react, lucide-react,
  // react-dom/server) into one self-contained CommonJS file so it can be
  // require()'d directly by plain Node, no Vite dev/prod server involved.
  await build({
    entryPoints: [path.join(__dirname, 'render-landing-entry.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    outfile: bundlePath,
    logLevel: 'silent',
  });

  const require = createRequire(import.meta.url);
  delete require.cache[require.resolve(bundlePath)];
  const { renderLandingHtml } = require(bundlePath);
  const html = renderLandingHtml();

  if (!html || html.length < 100) {
    throw new Error(`prerender-landing: rendered HTML looks empty/too short (${html?.length ?? 0} chars) — aborting so a bad build never ships.`);
  }

  let distHtml;
  try {
    distHtml = readFileSync(distIndexPath, 'utf8');
  } catch (err) {
    throw new Error(`prerender-landing: could not read ${distIndexPath} — run "vite build" first. (${err.message})`);
  }

  if (!distHtml.includes(ROOT_MARKER)) {
    throw new Error(`prerender-landing: expected to find "${ROOT_MARKER}" in dist/index.html but didn't — the markup shape changed, update this script's marker.`);
  }

  const patched = distHtml.replace(ROOT_MARKER, `<div id="root">${html}</div>`);
  writeFileSync(distIndexPath, patched, 'utf8');

  rmSync(bundlePath, { force: true });

  console.log(`prerender-landing: injected ${html.length} chars of static HTML into dist/index.html`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Wire it into the build pipeline**

In `package.json`, change:

```json
"build": "node pwa-init.cjs && vite build",
```

to:

```json
"build": "node pwa-init.cjs && vite build && node scripts/prerender-landing.mjs",
```

- [ ] **Step 4: Ignore the temp bundle file**

Add to `.gitignore` (append a new line, don't remove existing entries):

```
scripts/.tmp-prerender-landing-bundle.cjs
```

- [ ] **Step 5: Run the full build and verify it succeeds**

Run: `npm run build`
Expected: build completes with the final line `prerender-landing: injected N chars of static HTML into dist/index.html` (N should be a four-or-more-digit number — the whole landing page's markup, not a stub).

- [ ] **Step 6: Verify the real page text is now in the static HTML**

Run (Git Bash):
```bash
grep -c "Северное шоссе" dist/index.html
grep -c 'id="root"></div>' dist/index.html
```
Expected: first command outputs a number ≥ 1 (the address text made it into the static HTML), second command outputs `0` (the empty root marker is gone, replaced by real content).

- [ ] **Step 7: Verify the built site still renders correctly in a browser**

Run: `npm run preview` (serves the `dist/` folder), then open the printed local URL (typically `http://localhost:4173`) in a browser.
Expected: landing page looks and behaves exactly as before — hero section, "Как заказать", prices, map toggle button, "Войти в кабинет" button all present and clickable; no visible flash of duplicated content; browser console has no new errors. Stop the preview server (Ctrl+C) once confirmed.

- [ ] **Step 8: Commit**

```bash
git add scripts/render-landing-entry.tsx scripts/prerender-landing.mjs package.json .gitignore
git commit -m "Prerender landing page to static HTML for search-engine crawlers"
```

---

### Task 2: Stop shipping Sentry in the main JS chunk

**Files:**
- Modify: `src/sentry.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `initSentry()` keeps the exact same exported signature (`(): void`) — `src/main.tsx:7` calls it unchanged, no caller update needed.

- [ ] **Step 1: Record the baseline main chunk size**

Run: `npm run build` (if not already freshly built from Task 1) then:
```bash
ls -la dist/assets/index-*.js
```
Note the byte size shown — this is the "before" number to compare against after Step 3.

- [ ] **Step 2: Switch Sentry to a dynamic import**

In `src/sentry.ts`, replace the whole file with:

```ts
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
```

- [ ] **Step 3: Rebuild and compare the main chunk size**

Run:
```bash
npm run build
ls -la dist/assets/index-*.js
```
Expected: the byte size is meaningfully smaller than the Step 1 baseline (Sentry's SDK is tens of KB), and a new separate chunk file appears under `dist/assets/` that wasn't there before (the dynamically-imported Sentry code).

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: no errors (this project's `lint` script is `tsc --noEmit` — confirms the dynamic import's types resolve correctly).

- [ ] **Step 5: Manually confirm Sentry still initializes**

Run: `npm run preview`, open the site in a browser with devtools open on the Network tab.
Expected: a separate JS request for the Sentry chunk fires shortly after page load (not blocking first paint); no console errors about Sentry failing to load.

- [ ] **Step 6: Commit**

```bash
git add src/sentry.ts
git commit -m "Defer Sentry init to a dynamic import to shrink the main JS chunk"
```

---

### Task 3: Re-enable Cloudflare proxying (manual, no code)

Not a coding task — this is a config change in the Cloudflare web dashboard that only the account owner can perform. Confirmed in brainstorming: the user has Cloudflare access.

- [ ] **Step 1:** Log into the Cloudflare dashboard at `dash.cloudflare.com` and select the `sever-18.ru` site.
- [ ] **Step 2:** Open the **DNS** tab.
- [ ] **Step 3:** Find the DNS record (A or CNAME) that points at the Beget server. Its proxy-status icon (a small cloud, under the "Proxy status" column) will be **grey** ("DNS only").
- [ ] **Step 4:** Click the grey cloud to toggle it to **orange** ("Proxied").
- [ ] **Step 5: Verify from a terminal**

Run: `curl -sSI https://sever-18.ru/`
Expected: response headers now include `Server: cloudflare` and a `CF-RAY: ...` header (compare against the pre-fix response, which showed `Server: nginx-reuseport` with no Cloudflare headers at all).

---

## Deploying to production

None of the above tasks touch `main` until explicitly pushed. Once Task 1 and Task 2 are committed and verified locally (Task 3 has no code to deploy), get the user's explicit go-ahead, then:

```bash
git push origin main
```

This triggers the existing `.github/workflows/deploy.yml` GitHub Action, which builds (`npm run build` — now including the prerender step) and SFTPs `dist/*` to `sever-18.ru/public_html` on Beget automatically.
