const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Довершает 'strict-dynamic' CSP из index.html (см. комментарий там): Vite
// эмитит основной бандл как статический <script type="module" src="...">
// с именем, которое меняется от билда к билду (content-hash в имени файла),
// поэтому его sha256 нельзя вписать в CSP заранее в исходном index.html —
// только здесь, после того как имя и содержимое файла уже известны.
//
// Заменяем этот статический тег на инлайн-загрузчик, который сам
// динамически создаёт <script type="module"> с тем же src и вставляет его в
// DOM — тогда браузер доверяет ему по хэшу самого загрузчика (инлайн-контент
// известен здесь, до записи файла), а 'strict-dynamic' в CSP передаёт это
// доверие дальше, самому бандлу и всем его lazy import()-чанкам.

const distDir = path.join(__dirname, 'dist');
const indexPath = path.join(distDir, 'index.html');

let html = fs.readFileSync(indexPath, 'utf8');

const entryTagRe = /<script type="module" crossorigin src="(\/assets\/index-[^"]+\.js)"><\/script>/;
const match = html.match(entryTagRe);
if (!match) {
  throw new Error('csp-postbuild: entry <script type="module"> tag not found in dist/index.html — Vite output format changed?');
}
const entrySrc = match[1];

// document.head — не document.body: Vite может эмитить точку входа как
// внутри <head>, так и в конце <body> в зависимости от версии/конфига, а
// document.head существует уже в момент выполнения любого скрипта из <head>
// (в отличие от document.body, которого там ещё может не быть).
const loaderJs = `(function(d,s){var j=d.createElement('script');j.type='module';j.crossOrigin='';j.src='${entrySrc}';d.head.appendChild(j);})(document);`;
// CSP hash-source matching normalizes CRLF/CR to LF before hashing (per
// spec) — normalize here too so this stays correct even if loaderJs above
// ever grows multi-line (today it's single-line, so this is a no-op).
const loaderHash = 'sha256-' + crypto.createHash('sha256').update(loaderJs.replace(/\r\n|\r/g, '\n'), 'utf8').digest('base64');

html = html.replace(entryTagRe, `<script>${loaderJs}</script>`);

const cspRe = /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src[^;"]*)("|;)/;
if (!cspRe.test(html)) {
  throw new Error('csp-postbuild: CSP <meta> with script-src not found in dist/index.html');
}
html = html.replace(cspRe, (_m, scriptSrcPart, terminator) => `${scriptSrcPart} '${loaderHash}'${terminator}`);

fs.writeFileSync(indexPath, html, 'utf8');
console.log(`csp-postbuild: patched dist/index.html — entry bundle ${entrySrc} now loaded via hashed loader (${loaderHash})`);
