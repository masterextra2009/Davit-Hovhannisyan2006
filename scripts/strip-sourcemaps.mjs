/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, mkdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Карты исходников (.map) — это полный исходный код сайта в одном файле.
// Раньше они собирались в dist/assets/ и вместе со всем остальным уезжали
// на сервер, где лежали в открытом доступе: любой мог скачать
// sever-18.ru/assets/index-*.js.map и прочитать код так, как он написан,
// с комментариями и названиями переменных.
//
// Совсем отказаться от них нельзя — без карт ошибки в Sentry выглядят как
// нечитаемая каша из однобуквенных имён. Поэтому карты по-прежнему
// собираются, но этот скрипт сразу после сборки уносит их из dist/ в
// отдельную папку sourcemaps/ в корне проекта. На сервер уходит только
// содержимое dist/, значит карты остаются лежать на этом компьютере — их
// можно открыть вручную, когда надо разобрать ошибку.
//
// Папка пересоздаётся при каждой сборке, чтобы в ней не копились карты от
// старых сборок с другими хешами в именах.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const mapsDir = path.join(projectRoot, 'sourcemaps');

function collectMaps(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collectMaps(full));
    else if (entry.name.endsWith('.map')) found.push(full);
  }
  return found;
}

function main() {
  if (!existsSync(distDir)) {
    throw new Error('Папки dist/ нет — сборка не дошла до этого шага.');
  }

  const maps = collectMaps(distDir);

  rmSync(mapsDir, { recursive: true, force: true });
  mkdirSync(mapsDir, { recursive: true });

  for (const mapPath of maps) {
    // Имена файлов в dist/assets/ уникальны за счёт хеша, поэтому кладём
    // всё плоско в sourcemaps/ — вложенность dist/ воспроизводить не нужно.
    renameSync(mapPath, path.join(mapsDir, path.basename(mapPath)));
  }

  // Подстраховка: если Vite когда-нибудь снова начнёт дописывать ссылку на
  // карту в конец бандла (build.sourcemap вернут в true), файлы уедут, а
  // ссылка останется — браузер будет ловить 404. Пусть сборка об этом скажет.
  const leftovers = collectMaps(distDir);
  if (leftovers.length > 0) {
    throw new Error(`В dist/ остались карты исходников: ${leftovers.join(', ')}`);
  }

  console.log(`Карты исходников убраны из dist/ в sourcemaps/ (${maps.length} шт.)`);
}

main();
