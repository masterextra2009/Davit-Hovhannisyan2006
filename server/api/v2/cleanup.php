<?php
declare(strict_types=1);

// Уборка по сроку хранения (запускается по расписанию, не из браузера).
//
// Политика на сайте обещает: «файлы и фотографии, загруженные для печати,
// хранятся до выдачи заказа и удаляются не позднее 30 дней после его выдачи»
// (legal.html, п. 5.3). До появления этого файла обещание ничем не
// выполнялось — файлы лежали на сервере вечно. Расхождение политики с делом
// — это нарушение 152-ФЗ и повод для претензий магазинов приложений, поэтому
// уборка делает ровно то, что написано в документе.
//
// Что делает:
//   1. У выданных заказов (status = printed) старше 30 дней удаляет сами
//      файлы с диска и убирает из заказа ссылки на них. Строка заказа
//      остаётся: сумма, состав и дата нужны для отчётности.
//   2. Удаляет «осиротевшие» загрузки старше 45 дней — файлы, которые
//      человек выбрал, но заказ так и не оформил (брони живут 6 часов).
//   3. Чистит просроченные брони и старые записи о входах.
//
// Запуск (Beget, раз в сутки; путь к PHP тот же, что у остальных задач):
//   /usr/local/php-cgi/8.2/bin/php ~/sever-18.ru/public_html/api/v2/cleanup.php
//
// Пробный запуск — только посчитать, ничего не удаляя:
//   … cleanup.php --dry
//
// Через веб не работает намеренно: снаружи этот файл только отвечает 403.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Только по расписанию'], JSON_UNESCAPED_UNICODE);
    exit;
}

require __DIR__ . '/_bootstrap.php';

/** --dry: только посчитать, что было бы удалено. */
define('DRY_RUN', in_array('--dry', $argv ?? [], true));

/** Сколько дней храним файлы выданного заказа. Должно совпадать с п. 5.3 политики. */
const KEEP_DAYS_AFTER_ISSUE = 30;
/** Сколько дней держим загрузки, по которым заказ так и не оформили. */
const KEEP_DAYS_ORPHAN = 45;

$pdo = db();
$removedFiles = 0;
$freedBytes = 0;
$touchedOrders = 0;

// ─────────────── 1. Файлы выданных заказов ───────────────

$st = $pdo->prepare(
    'SELECT id, files FROM orders
      WHERE status = ?
        AND COALESCE(completed_at, ready_at, order_date) < UTC_TIMESTAMP(3) - INTERVAL ? DAY'
);
$st->execute(['printed', KEEP_DAYS_AFTER_ISSUE]);

foreach ($st->fetchAll() as $order) {
    $files = json_decode((string) $order['files'], true);
    if (!is_array($files) || !$files) {
        continue;
    }

    $changed = false;
    foreach ($files as &$f) {
        if (!is_array($f)) {
            continue;
        }
        foreach (['url', 'previewUrl'] as $key) {
            $path = upload_path_from_url($f[$key] ?? null);
            if ($path === null) {
                continue;
            }
            if (delete_upload($path, $freedBytes)) {
                $removedFiles++;
            }
            // Ссылку убираем в любом случае: файла на диске больше нет, и
            // кнопка «Скачать» в админке не должна вести в пустоту.
            unset($f[$key]);
            $changed = true;
        }
    }
    unset($f);

    if ($changed && !DRY_RUN) {
        $pdo->prepare('UPDATE orders SET files = ? WHERE id = ?')
            ->execute([json_encode($files, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $order['id']]);
    }
    if ($changed) {
        $touchedOrders++;
    }
}

// ─────────────── 2. Осиротевшие загрузки ───────────────

// Сначала собираем все пути, на которые ссылается хоть один заказ: их не
// трогаем, даже если файл старый (заказ мог зависнуть в работе).
$referenced = [];
foreach ($pdo->query('SELECT files FROM orders')->fetchAll(PDO::FETCH_COLUMN) as $json) {
    $files = json_decode((string) $json, true);
    if (!is_array($files)) {
        continue;
    }
    foreach ($files as $f) {
        if (!is_array($f)) {
            continue;
        }
        foreach (['url', 'previewUrl'] as $key) {
            $path = upload_path_from_url($f[$key] ?? null);
            if ($path !== null) {
                $referenced[$path] = true;
            }
        }
    }
}

// Фото профиля (сайт и приложение) и скриншоты «Заметили ошибку?» лежат в
// той же папке клиента, но это не заказы — их не трогаем, пока на них
// ссылается профиль или отзыв (найдено 25.09.2026 перед первым запуском).
foreach ([
    'SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL',
    'SELECT screenshot_url FROM feedback WHERE screenshot_url IS NOT NULL',
] as $sql) {
    try {
        foreach ($pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN) as $url) {
            $path = upload_path_from_url($url);
            if ($path !== null) {
                $referenced[$path] = true;
            }
        }
    } catch (Throwable $e) {
        // Нет таблицы или поля — лучше ничего не удалять, чем удалить лишнее.
        error_log('cleanup: не прочитаны ссылки профилей/отзывов: ' . $e->getMessage());
        exit(1);
    }
}

$uploads = SITE_DIR . '/uploads';
$cutoff = time() - KEEP_DAYS_ORPHAN * 86400;
$orphans = 0;

foreach (glob($uploads . '/*', GLOB_ONLYDIR) ?: [] as $dir) {
    // uploads/public — картинки новостей и витрины, их срок хранения не
    // ограничен: это не персональные данные клиентов.
    if (basename($dir) === 'public') {
        continue;
    }
    foreach (glob($dir . '/*') ?: [] as $file) {
        if (!is_file($file) || filemtime($file) > $cutoff) {
            continue;
        }
        $path = 'uploads/' . basename($dir) . '/' . basename($file);
        if (isset($referenced[$path])) {
            continue;
        }
        if (delete_upload($path, $freedBytes)) {
            $orphans++;
        }
    }
    // Пустую папку клиента убираем следом, чтобы не копились тысячи пустых.
    if (!DRY_RUN && ($rest = glob($dir . '/*')) !== false && !$rest) {
        @rmdir($dir);
    }
}

// ─────────────── 3. Просроченные брони и входы ───────────────

$reservations = 0;
$sessions = 0;
if (!DRY_RUN) {
try {
    $reservations = $pdo->exec(
        'DELETE FROM order_reservations WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 7 DAY'
    ) ?: 0;
} catch (Throwable $e) {
    // Таблицы может не быть на старой копии базы — это не повод падать.
    error_log('cleanup: брони не почищены: ' . $e->getMessage());
}

try {
    $sessions = $pdo->exec('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP(3)') ?: 0;
} catch (Throwable $e) {
    error_log('cleanup: сессии не почищены: ' . $e->getMessage());
}
}

printf(
    (DRY_RUN ? '[ПРОБНЫЙ ЗАПУСК, ничего не удалено] ' : '') . "Уборка: файлов заказов удалено %d (в %d заказах), осиротевших %d, освобождено %.1f МБ, броней %d, входов %d\n",
    $removedFiles,
    $touchedOrders,
    $orphans,
    $freedBytes / 1048576,
    $reservations,
    $sessions
);

// ─────────────── вспомогательное ───────────────

/**
 * Достаёт из ссылки путь вида uploads/{id}/{файл}.
 *
 * Ссылки бывают двух видов: подписанная (files.php?action=get&path=…) и
 * прямая на /uploads/… — вторая осталась от старого сайта. Всё, что ведёт не
 * на наш сервер и не в uploads, отбрасываем: удалять по чужой ссылке нельзя.
 */
function upload_path_from_url($url): ?string
{
    if (!is_string($url) || $url === '') {
        return null;
    }
    $path = null;
    $query = parse_url($url, PHP_URL_QUERY);
    if (is_string($query)) {
        parse_str($query, $q);
        if (isset($q['path']) && is_string($q['path'])) {
            $path = $q['path'];
        }
    }
    if ($path === null) {
        $inUrl = parse_url($url, PHP_URL_PATH);
        if (is_string($inUrl) && str_contains($inUrl, '/uploads/')) {
            $path = ltrim(substr($inUrl, (int) strpos($inUrl, '/uploads/')), '/');
        }
    }
    if ($path === null) {
        return null;
    }
    $path = rawurldecode($path);
    // Та же проверка, что в files.php: строго uploads/{папка}/{файл}.
    if (!preg_match('#^uploads/[^/]+/[^/]+$#', $path) || str_contains($path, '..')) {
        return null;
    }
    return $path;
}

/** Удаляет файл из uploads и прибавляет его размер к освобождённому месту. */
function delete_upload(string $path, int &$freedBytes): bool
{
    $full = SITE_DIR . '/' . $path;
    if (!is_file($full)) {
        return false;
    }
    $size = (int) filesize($full);
    if (DRY_RUN) {
        $freedBytes += $size;
        return true;
    }
    if (!@unlink($full)) {
        error_log('cleanup: не удалось удалить ' . $path);
        return false;
    }
    $freedBytes += $size;
    return true;
}
