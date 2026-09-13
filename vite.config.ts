import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // 'hidden', а не true: карты исходников по-прежнему собираются (они нужны,
      // чтобы читать ошибки), но в конце бандла больше не пишется строка
      // //# sourceMappingURL=... — браузер за ними не ходит. Сразу после сборки
      // scripts/strip-sourcemaps.mjs уносит сами .map-файлы из dist/ в папку
      // sourcemaps/, чтобы они не уезжали на сервер: при sourcemap: true файл
      // index-*.js.map лежал на sever-18.ru в открытом доступе (4 МБ), и по нему
      // любой желающий восстанавливал исходный код сайта целиком.
      sourcemap: 'hidden' as const,
    },
    // esbuild по умолчанию оставляет /** @license */-блоки из зависимостей
    // прямо в минифицированном коде (React и др. дублируют один и тот же
    // заголовок в каждом внутреннем модуле) — на билде это ~150КБ мёртвого
    // веса в основном бандле, ровно то, на что жаловался Lighthouse audit
    // "Minify JavaScript". 'none' убирает их полностью — обычная практика
    // для прод-бандлов (сама лицензия остаётся в исходниках зависимостей).
    esbuild: {
      legalComments: 'none' as const,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
