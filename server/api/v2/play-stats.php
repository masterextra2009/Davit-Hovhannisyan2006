<?php
declare(strict_types=1);

// Сборщик цифр из Google Play для карточки «Установки из Google Play» в
// аналитике админки (запускается по расписанию, не из браузера).
//
// Google не отдаёт установки живым запросом — только отчётами CSV, которые
// раз в сутки кладёт в своё хранилище (Cloud Storage, бакет pubsite_prod_…).
// Забираем их под отдельным «роботом» play-stats@sever18-push: в Play Console
// у него единственное право — «просмотр и скачивание массовых отчётов», ничего
// менять в приложении он не может. Ключ робота лежит вне сайта:
// .sever18-private/play-stats-key.json.
//
// Результат — .sever18-private/play-stats.json, его читает misc.php?action=play-stats:
//   total     — всего установок (пользователи) за всё время
//   today     — установок за последний день в отчёте
//   week      — установок за последние 7 дней отчёта
//   rating    — средняя оценка за всё время (null, пока оценок нет)
//   updatedAt — на какой день данные (Google отстаёт на 1–2 дня)
//
// Запуск (Beget, раз в сутки):
//   /usr/local/php-cgi/8.2/bin/php ~/sever-18.ru/public_html/api/v2/play-stats.php
//
// Через веб не работает намеренно: снаружи этот файл только отвечает 403.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Только по расписанию'], JSON_UNESCAPED_UNICODE);
    exit;
}

const PLAY_BUCKET = 'pubsite_prod_8582983780738498809';
const PLAY_PACKAGE = 'ru.sever18.app';
const PRIVATE_DIR = __DIR__ . '/../../../.sever18-private';

try {
    $token = google_token(PRIVATE_DIR . '/play-stats-key.json');

    // Установки: берём два последних месячных отчёта — чтобы «за неделю»
    // в первые дни месяца захватывала конец прошлого.
    $installs = [];
    foreach (array_slice(list_reports($token, 'stats/installs/installs_' . PLAY_PACKAGE . '_'), -2) as $name) {
        foreach (read_csv(download($token, $name)) as $row) {
            $installs[$row['Date']] = $row;
        }
    }
    if (!$installs) {
        throw new RuntimeException('Отчётов об установках пока нет (Google присылает их с задержкой в несколько дней)');
    }
    ksort($installs);
    $days = array_values($installs);
    $last = end($days);

    $daily = fn(array $r): int => (int) ($r['Daily User Installs'] ?? $r['Install events'] ?? 0);
    $week = array_sum(array_map($daily, array_slice($days, -7)));
    $total = isset($last['Total User Installs']) && $last['Total User Installs'] !== ''
        ? (int) $last['Total User Installs']
        : array_sum(array_map($daily, $days));

    // Оценка: последнее непустое «Total Average Rating» (пока оценок нет, там NA).
    $rating = null;
    $ratingFiles = list_reports($token, 'stats/ratings/ratings_' . PLAY_PACKAGE . '_');
    foreach (array_reverse($ratingFiles) as $name) {
        foreach (array_reverse(read_csv(download($token, $name))) as $row) {
            $v = $row['Total Average Rating'] ?? '';
            if (is_numeric($v)) {
                $rating = round((float) $v, 2);
                break 2;
            }
        }
    }

    $result = [
        'total' => $total,
        'today' => $daily($last),
        'week' => $week,
        'rating' => $rating,
        'updatedAt' => $last['Date'],
        'collectedAt' => gmdate('c'),
    ];
    $tmp = PRIVATE_DIR . '/play-stats.json.tmp';
    file_put_contents($tmp, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    rename($tmp, PRIVATE_DIR . '/play-stats.json');
    echo json_encode($result, JSON_UNESCAPED_UNICODE), "\n";
} catch (Throwable $e) {
    // Старый play-stats.json не трогаем: пусть карточка показывает вчерашние
    // цифры, а не пустоту из-за разового сбоя Google.
    fwrite(STDERR, 'play-stats: ' . $e->getMessage() . "\n");
    exit(1);
}

// ─────────────────────────── Google ───────────────────────────

/** Токен доступа робота (JWT, подписанный его ключом) — только чтение хранилища. */
function google_token(string $keyFile): string
{
    $key = json_decode((string) @file_get_contents($keyFile), true);
    if (!is_array($key) || empty($key['private_key'])) {
        throw new RuntimeException('Нет ключа робота: ' . $keyFile);
    }
    $b64 = fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $now = time();
    $unsigned = $b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])) . '.' . $b64(json_encode([
        'iss' => $key['client_email'],
        'scope' => 'https://www.googleapis.com/auth/devstorage.read_only',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
    ]));
    if (!openssl_sign($unsigned, $sig, $key['private_key'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Не удалось подписать запрос ключом робота');
    }
    $res = json_decode(http('https://oauth2.googleapis.com/token', [], http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $unsigned . '.' . $b64($sig),
    ])), true);
    if (empty($res['access_token'])) {
        throw new RuntimeException('Google не выдал токен');
    }
    return $res['access_token'];
}

/** Имена месячных отчётов «…_overview.csv» с данным началом, по порядку месяцев. */
function list_reports(string $token, string $prefix): array
{
    $url = 'https://storage.googleapis.com/storage/v1/b/' . PLAY_BUCKET . '/o?fields=items(name)&prefix=' . rawurlencode($prefix);
    $res = json_decode(http($url, ['Authorization: Bearer ' . $token]), true);
    $names = array_filter(array_column($res['items'] ?? [], 'name'), fn($n) => str_ends_with($n, '_overview.csv'));
    sort($names);
    return array_values($names);
}

function download(string $token, string $name): string
{
    return http('https://storage.googleapis.com/storage/v1/b/' . PLAY_BUCKET . '/o/' . rawurlencode($name) . '?alt=media',
        ['Authorization: Bearer ' . $token]);
}

/** CSV из Google Play — в UTF-16 с BOM; возвращает строки как [колонка => значение]. */
function read_csv(string $raw): array
{
    if (str_starts_with($raw, "\xFF\xFE") || str_starts_with($raw, "\xFE\xFF")) {
        $raw = mb_convert_encoding($raw, 'UTF-8', 'UTF-16');
    }
    $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
    $lines = array_values(array_filter(preg_split('/\r\n|\n|\r/', $raw), fn($l) => trim($l) !== ''));
    if (!$lines) {
        return [];
    }
    $head = array_map('trim', str_getcsv(array_shift($lines)));
    $rows = [];
    foreach ($lines as $line) {
        $cells = array_map('trim', str_getcsv($line));
        if (count($cells) === count($head)) {
            $rows[] = array_combine($head, $cells);
        }
    }
    return $rows;
}

function http(string $url, array $headers = [], ?string $post = null): string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($post !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
    }
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($body === false || $code >= 400) {
        $msg = json_decode((string) $body, true)['error']['message'] ?? curl_error($ch);
        throw new RuntimeException("Google ответил $code: $msg");
    }
    return $body;
}
