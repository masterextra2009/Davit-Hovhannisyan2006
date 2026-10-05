<?php
declare(strict_types=1);

// Перевод документов Word ↔ PDF для конвертера приложения (05.10.2026).
//
//   POST convert.php?to=pdf   (multipart: file — Word/Excel/PowerPoint/текст) → сам PDF
//   POST convert.php?to=docx  (multipart: file — PDF)                         → сам .docx
//
// Переводит не хостинг (здесь нет LibreOffice), а VPS Cortex:
// https://cortex.sever-18.ru/convert (server/convert/server.py). Сюда приходит
// только вошедший клиент; файл пересылается на VPS с общим ключом из
// .sever18-private/convert.php и нигде не сохраняется.
//
// Ошибка — JSON {ok:false, error} как у остальных api/v2; успех — сам файл.

require __DIR__ . '/_bootstrap.php';

const CONVERT_MAX_BYTES = 25 * 1024 * 1024;
/** Переводов в день на одного клиента — чтобы чужой скрипт не занял VPS. */
const CONVERT_DAILY_LIMIT = 40;

require_method('POST');
$user = require_user();

$to = (string) ($_GET['to'] ?? '');
if (!in_array($to, ['pdf', 'docx'], true)) {
    fail('Неизвестный перевод');
}
$file = $_FILES['file'] ?? null;
if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    fail('Файл не дошёл до сервера. Попробуйте ещё раз.');
}
if ((int) $file['size'] > CONVERT_MAX_BYTES) {
    fail('Файл больше 25 МБ — такой не перевести.', 413);
}

$cfgFile = SITE_DIR . '/../.sever18-private/convert.php';
$cfg = is_readable($cfgFile) ? (require $cfgFile) : null;
if (!is_array($cfg) || empty($cfg['url']) || empty($cfg['key'])) {
    fail('Перевод документов временно недоступен.', 503);
}

// Счётчик на сегодня: строка stats 'convert:ГГГГ-ММ-ДД' → {id клиента: сколько}.
$day = (new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow')))->format('Y-m-d');
$st = db()->prepare("SELECT JSON_EXTRACT(data, ?) FROM stats WHERE name = ?");
$st->execute(['$."' . $user['id'] . '"', 'convert:' . $day]);
if ((int) $st->fetchColumn() >= CONVERT_DAILY_LIMIT && $user['role'] !== 'admin') {
    fail('На сегодня переводов достаточно — продолжите завтра.', 429);
}

$name = basename((string) ($file['name'] ?? 'file'));
$ch = curl_init(rtrim((string) $cfg['url'], '/') . '?to=' . $to);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => file_get_contents((string) $file['tmp_name']),
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/octet-stream',
        'X-Convert-Key: ' . $cfg['key'],
        // Имя нужно VPS только ради расширения — кириллицу не тащим в заголовок.
        'X-Filename: file.' . strtolower(pathinfo($name, PATHINFO_EXTENSION)),
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 120,
]);
$body = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$ctype = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($body === false || $code === 0) {
    fail('Сервер перевода не отвечает. Попробуйте через минуту.', 502);
}
if ($code !== 200) {
    // Тексты ошибок VPS пишет сам и по-русски — отдаём как есть.
    fail(mb_substr(trim((string) $body), 0, 300) ?: 'Не удалось перевести файл.', $code >= 400 && $code < 600 ? $code : 502);
}

db()->prepare(
    "INSERT INTO stats (name, data) VALUES (?, JSON_OBJECT(?, 1)) AS new
     ON DUPLICATE KEY UPDATE data = JSON_SET(stats.data, ?, COALESCE(JSON_EXTRACT(stats.data, ?), 0) + 1)"
)->execute(['convert:' . $day, $user['id'], '$."' . $user['id'] . '"', '$."' . $user['id'] . '"']);

$base = pathinfo($name, PATHINFO_FILENAME) ?: 'document';
header('Content-Type: ' . ($ctype ?: 'application/octet-stream'));
header('Content-Length: ' . strlen($body));
header("Content-Disposition: attachment; filename=\"document.$to\"; filename*=UTF-8''" . rawurlencode("$base.$to"));
echo $body;
