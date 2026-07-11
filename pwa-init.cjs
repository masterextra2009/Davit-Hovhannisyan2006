const fs = require('fs');
const path = require('path');

// PWA-иконки (favicon.ico, logo-192.png, logo-512.png) теперь — заранее
// подготовленные файлы правильного размера в /public, а не копии
// полноразмерного src/assets/logo.png (та копия весила ~700КБ на каждую
// иконку). Если их вдруг не окажется в /public (например, сразу после
// смены логотипа), подстрахуемся и скопируем полноразмерный логотип —
// лучше тяжёлая иконка, чем совсем без иконки — но обычным путём эти
// файлы просто уже лежат в public/ и коммитятся в репозиторий.
function initPwa() {
  const publicDir = path.join(__dirname, 'public');
  const srcLogoPath = path.join(__dirname, 'src', 'assets', 'logo.webp');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const icons = ['logo-192.png', 'logo-512.png', 'favicon.ico'];
  const missing = icons.filter(name => !fs.existsSync(path.join(publicDir, name)));

  if (missing.length === 0) {
    console.log('PWA icons already present in /public — skipping regeneration.');
    return;
  }

  if (fs.existsSync(srcLogoPath)) {
    for (const name of missing) {
      try {
        fs.copyFileSync(srcLogoPath, path.join(publicDir, name));
      } catch (err) {
        console.error(`Error copying fallback PWA icon ${name}:`, err);
      }
    }
    console.log(`Missing PWA icons (${missing.join(', ')}) — copied fallback from src/assets/logo.webp. Regenerate properly sized versions when convenient.`);
  } else {
    console.warn('Source logo not found — PWA icons missing:', missing.join(', '));
  }
}

initPwa();
