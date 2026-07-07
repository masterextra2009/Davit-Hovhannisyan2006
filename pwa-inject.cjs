const fs = require('fs');
const path = require('path');

// Post-build script to inject compiled hashes into service worker precache list
function injectStaticAssets() {
  const distDir = path.join(__dirname, 'dist');
  const swPath = path.join(distDir, 'sw.js');

  if (!fs.existsSync(distDir)) {
    console.error('Error: dist directory does not exist! Please run build first.');
    return;
  }

  if (!fs.existsSync(swPath)) {
    console.warn('Warning: sw.js not found in dist. Service Worker injection skipped.');
    return;
  }

  // Scan dist/assets
  const assetsDir = path.join(distDir, 'assets');
  let assetUrls = [];

  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    files.forEach(file => {
      // Precache only js, css, woff2, and common structural images
      if (
        file.endsWith('.js') ||
        file.endsWith('.css') ||
        file.endsWith('.woff2') ||
        file.endsWith('.svg') ||
        file.endsWith('.png')
      ) {
        assetUrls.push(`/assets/${file}`);
      }
    });
  }

  // Add some other base assets
  const extraAssets = [
    '/favicon.ico',
    '/logo-192.png',
    '/logo-512.png',
    '/manifest.json'
  ];

  extraAssets.forEach(asset => {
    const fullPath = path.join(distDir, asset);
    if (fs.existsSync(fullPath)) {
      assetUrls.push(asset);
    }
  });

  // Unique elements
  assetUrls = [...new Set(assetUrls)];

  console.log(`PWA Injected: Found ${assetUrls.length} compiled assets to precache.`);

  // Load and modify sw.js
  let swContent = fs.readFileSync(swPath, 'utf8');

  // We look for: const ASSETS_TO_CACHE = [ ... ];
  const cacheStartToken = 'const ASSETS_TO_CACHE = [';
  const cacheEndToken = '];';

  const startIndex = swContent.indexOf(cacheStartToken);
  if (startIndex === -1) {
    console.warn('Warning: const ASSETS_TO_CACHE not found in sw.js.');
    return;
  }

  const remainingHeader = swContent.substring(0, startIndex + cacheStartToken.length);
  const searchEndFromIndex = swContent.substring(startIndex + cacheStartToken.length);
  const endIndex = searchEndFromIndex.indexOf(cacheEndToken);

  if (endIndex === -1) {
    console.warn('Warning: End of ASSETS_TO_CACHE array not found.');
    return;
  }

  const remainingFooter = searchEndFromIndex.substring(endIndex);

  // New assets array content
  const formattedAssets = [
    "'/'",
    "'/index.html'",
    ...assetUrls.map(url => `'${url}'`)
  ].join(',\n  ');

  const newSwContent = `${remainingHeader}\n  ${formattedAssets}\n${remainingFooter}`;

  fs.writeFileSync(swPath, newSwContent, 'utf8');
  console.log('Successfully injected asset precache definitions into dist/sw.js!');
}

injectStaticAssets();
