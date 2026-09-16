/**
 * Подготовка проверочной копии (sever-18.ru/proverka/) после обычной сборки.
 *
 * Делает две вещи:
 *  1. Выключает регистрацию сервис-воркера. Воркер боевого сайта живёт в корне
 *     домена и кэшировал бы боевые файлы поверх проверочных.
 *  2. Пересчитывает sha256-хэши инлайн-скриптов в Content-Security-Policy.
 *     Это обязательный шаг: браузер считает хэш от текста скрипта, и после
 *     правки в пункте 1 старый хэш перестаёт совпадать — скрипт молча не
 *     выполняется (в консоли «Executing inline script violates ... CSP»).
 *
 * Запуск: node scripts/staging-patch.mjs dist/index.html
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const file = process.argv[2] || 'dist/index.html';
let html = fs.readFileSync(file, 'utf8');

// 1. Заглушаем регистрацию сервис-воркера.
const swMarker = "if ('serviceWorker' in navigator) {";
if (html.includes(swMarker)) {
  html = html.replace(swMarker, "if (false && 'serviceWorker' in navigator) { // проверочная копия: воркер боевого сайта здесь не нужен");
}

// 2. Считаем хэши всех инлайн-скриптов заново.
// Комментарии вырезаем, иначе упоминание тега script внутри комментария
// собьёт поиск. Переводы строк нормализуем: браузер по спецификации CSP
// хэширует текст с \n, а на Windows файл может лежать с \r\n.
const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
const hashes = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(withoutComments)) !== null) {
  const body = m[1].replace(/\r\n/g, '\n');
  hashes.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
}

// Меняем ТОЛЬКО хэши и ТОЛЬКО внутри самого тега политики: в файле есть ещё
// комментарий, где слова script-src встречаются в пояснении, и трогать его
// нельзя. Остальные разрешения (адреса счётчиков Google и Яндекса) остаются
// на месте — иначе счётчики перестанут грузиться.
const metaRe = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
const meta = html.match(metaRe);
if (!meta) {
  console.error('staging-patch: не нашёл тег Content-Security-Policy — проверьте index.html');
  process.exit(1);
}
let first = true;
const policy = meta[2].replace(/'sha256-[^']*'/g, () => {
  if (first) { first = false; return hashes.join(' '); }
  return '';
}).replace(/\s{2,}/g, ' ');
html = html.replace(metaRe, `$1${policy}$3`);

fs.writeFileSync(file, html);
console.log(`staging-patch: сервис-воркер выключен, пересчитано хэшей: ${hashes.length}`);
