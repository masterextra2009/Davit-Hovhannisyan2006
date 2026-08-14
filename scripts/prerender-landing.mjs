/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
