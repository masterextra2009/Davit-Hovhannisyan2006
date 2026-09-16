<?php
declare(strict_types=1);

// Файлы заказов (api/v2/files.php?action=…) — загрузка и выдача с проверкой,
// чей это файл.
//
// Что не так со старым api/upload.php: он принимает файл от кого угодно, без
// входа в аккаунт, а номер владельца берёт прямо из запроса. А сами файлы
// лежат в открытой папке /uploads/{id}/ и отдаются по прямой ссылке любому,
// кто её знает. Паспорт или справка клиента — ровно такой же файл.
//
//   POST upload  (multipart: file)            → {path, url, name, size}
//   POST upload-public (multipart: file)      → {url}   только админ
//   GET  get     &path=…[&exp=…&sig=…]        → сам файл
//   POST link    {path, hours?}               → {url}  временная ссылка
//
// Кто что может: свой файл — владелец, любой — админ. Плюс временная
// подписанная ссылка: она нужна там, где заголовок с входом не приложить —
// картинка в <img>, открытие файла в новой вкладке, печать.
//
// Ключ для подписи ссылок лежит вне сайта: .sever18-private/files.php.

require __DIR__ . '/_bootstrap.php';

const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
/** Сколько живёт временная ссылка по умолчанию. */
const LINK_DEFAULT_HOURS = 24;
const LINK_MAX_HOURS = 24 * 30;
/** Исполняемое не принимаем: такой файл на сервере — чужой код, а не заказ. */
const FORBIDDEN_EXT = ['php', 'phtml', 'php3', 'php4', 'php5', 'phar', 'pl', 'py', 'cgi', 'asp', 'aspx', 'sh', 'exe', 'js', 'htaccess'];

$action = $_GET['action'] ?? '';

// Выдача файла — единственное место, куда можно прийти по подписанной ссылке,
// без заголовка с входом. Остальное требует входа.
if ($action === 'get') {
    require_method('GET');
    serve_file();
}

$user = require_user();
$isAdmin = $user['role'] === 'admin';

switch ($action) {
    case 'upload':
        require_method('POST');
        upload_file($user);
    case 'upload-public':
        require_method('POST');
        require_admin($isAdmin);
        upload_public($user);
    case 'link':
        require_method('POST');
        make_link($user, $isAdmin);
    default:
        fail('Неизвестное действие', 404);
}

// ─────────────────────────── Загрузка ───────────────────────────

function upload_file(array $user)
{
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        fail('Файл не получен');
    }
    $f = $_FILES['file'];
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail(upload_error_text((int) $f['error']));
    }
    if ((int) $f['size'] > UPLOAD_MAX_BYTES) {
        fail('Файл слишком большой. Максимальный размер — 50 МБ', 413);
    }

    $safeName = safe_file_name((string) $f['name']);
    $ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
    if (in_array($ext, FORBIDDEN_EXT, true)) {
        fail('Этот тип файла не поддерживается');
    }

    // Папка клиента называется его номером — так же, как в старом upload.php,
    // чтобы уже загруженные файлы остались на своих местах.
    $userDir = SITE_DIR . '/uploads/' . $user['id'];
    if (!is_dir($userDir) && !mkdir($userDir, 0755, true) && !is_dir($userDir)) {
        error_log('api/v2 files: не удалось создать папку клиента');
        fail('Не удалось сохранить файл', 500);
    }

    $unique = time() . '_' . random_int(1000, 9999) . '_' . $safeName;
    $target = $userDir . '/' . $unique;
    if (!move_uploaded_file($f['tmp_name'], $target)) {
        error_log('api/v2 files: не удалось перенести файл');
        fail('Не удалось сохранить файл', 500);
    }

    $path = 'uploads/' . $user['id'] . '/' . $unique;
    respond([
        'ok' => true,
        'path' => $path,
        'url' => signed_url($path, LINK_DEFAULT_HOURS),
        'name' => $safeName,
        'size' => (int) $f['size'],
    ]);
}

/** Имя файла без опасных знаков, кириллица и расширение сохраняются. */
function safe_file_name(string $name): string
{
    $name = basename(str_replace('\\', '/', $name));
    $name = preg_replace('/[^a-zA-Zа-яА-ЯёЁ0-9_.\- ]/u', '_', $name) ?? '';
    $name = preg_replace('/\.{2,}/', '.', $name) ?? '';
    $name = trim($name, '_ .');
    return $name === '' ? 'file' : mb_substr($name, 0, 150);
}

function upload_error_text(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Файл слишком большой',
        UPLOAD_ERR_PARTIAL => 'Файл загружен не полностью — попробуйте ещё раз',
        UPLOAD_ERR_NO_FILE => 'Файл не выбран',
        default => 'Не удалось загрузить файл',
    };
}

/**
 * Картинки новостей, услуг и стикеров — они по смыслу общие: их показывает
 * приложение всем клиентам, и ссылка на них живёт в новости годами. Поэтому
 * такие файлы кладём в отдельную папку uploads/public/ и отдаём обычной
 * прямой ссылкой, без входа и без срока.
 *
 * Разделение нужно и на будущее: личные файлы заказов из uploads/{номер
 * клиента}/ мы закроем от прямых ссылок, а эту папку оставим открытой.
 */
function upload_public(array $user)
{
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        fail('Файл не получен');
    }
    $f = $_FILES['file'];
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail(upload_error_text((int) $f['error']));
    }
    if ((int) $f['size'] > UPLOAD_MAX_BYTES) {
        fail('Файл слишком большой. Максимальный размер — 50 МБ', 413);
    }
    $safeName = safe_file_name((string) $f['name']);
    $ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
    if (in_array($ext, FORBIDDEN_EXT, true)) {
        fail('Этот тип файла не поддерживается');
    }

    $dir = SITE_DIR . '/uploads/public';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        error_log('api/v2 files: не удалось создать общую папку');
        fail('Не удалось сохранить файл', 500);
    }
    $unique = time() . '_' . random_int(1000, 9999) . '_' . $safeName;
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $unique)) {
        error_log('api/v2 files: не удалось перенести общий файл');
        fail('Не удалось сохранить файл', 500);
    }
    respond(['ok' => true, 'url' => 'https://sever-18.ru/uploads/public/' . rawurlencode($unique), 'name' => $safeName]);
}

// ─────────────────────────── Выдача ───────────────────────────

function serve_file()
{
    $path = normalized_path((string) ($_GET['path'] ?? ''));
    $ownerId = explode('/', $path)[1] ?? '';

    // Либо годная подписанная ссылка, либо вход: свой файл или админ.
    $exp = (int) ($_GET['exp'] ?? 0);
    $sig = (string) ($_GET['sig'] ?? '');
    $bySignature = $sig !== '' && signature_valid($path, $exp, $sig);

    if (!$bySignature) {
        $user = current_user();
        if (!$user) {
            fail('Нужно войти в аккаунт', 401);
        }
        if ($user['role'] !== 'admin' && $user['id'] !== $ownerId) {
            fail('Нет доступа к этому файлу', 403);
        }
    }

    $full = SITE_DIR . '/' . $path;
    if (!is_file($full)) {
        fail('Файл не найден', 404);
    }

    $name = (string) ($_GET['name'] ?? '');
    $name = $name !== '' ? safe_file_name($name) : basename($full);
    // Скачивание, а не показ: присланный клиентом html или svg, открытый как
    // страница сайта, выполнил бы свой код на нашем домене.
    $disposition = ($_GET['inline'] ?? '') !== '' ? 'inline' : 'attachment';

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? (finfo_file($finfo, $full) ?: 'application/octet-stream') : 'application/octet-stream';
    if ($finfo) {
        finfo_close($finfo);
    }

    // Заголовок JSON поставил _bootstrap.php — здесь отдаём сам файл.
    header_remove('Content-Type');
    header('Content-Type: ' . $mime);
    header('Content-Disposition: ' . $disposition . '; filename*=UTF-8\'\'' . rawurlencode($name));
    header('Content-Length: ' . (string) filesize($full));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=300');

    @set_time_limit(0);
    $fp = fopen($full, 'rb');
    if ($fp === false) {
        fail('Файл не читается', 500);
    }
    while (!feof($fp)) {
        echo fread($fp, 1024 * 1024);
        flush();
    }
    fclose($fp);
    exit;
}

/** Путь строго внутри uploads/: «..», обратные слэши и нули не проходят. */
function normalized_path(string $path): string
{
    $path = str_replace(['\\', chr(0)], '', ltrim(urldecode($path), '/'));
    if (!preg_match('#^uploads/[^/]+/[^/]+$#', $path) || str_contains($path, '..')) {
        fail('Неверный путь к файлу');
    }
    return $path;
}

// ─────────────────────────── Подписанные ссылки ───────────────────────────

function make_link(array $user, bool $isAdmin)
{
    $path = normalized_path(str_field('path', 512));
    $ownerId = explode('/', $path)[1] ?? '';
    if (!$isAdmin && $ownerId !== $user['id']) {
        fail('Нет доступа к этому файлу', 403);
    }
    $hours = (int) (body()['hours'] ?? LINK_DEFAULT_HOURS);
    $hours = max(1, min($hours, LINK_MAX_HOURS));
    respond(['ok' => true, 'url' => signed_url($path, $hours)]);
}

function signed_url(string $path, int $hours): string
{
    $exp = time() + $hours * 3600;
    return 'https://sever-18.ru/api/v2/files.php?action=get'
        . '&path=' . rawurlencode($path)
        . '&exp=' . $exp
        . '&sig=' . make_signature($path, $exp);
}

function make_signature(string $path, int $exp): string
{
    return hash_hmac('sha256', $path . '|' . $exp, files_secret());
}

function signature_valid(string $path, int $exp, string $sig): bool
{
    if ($exp < time()) {
        return false;
    }
    // hash_equals — сравнение без подсказок по времени ответа.
    return hash_equals(make_signature($path, $exp), $sig);
}

/**
 * Ключ подписи ссылок. Лежит рядом с остальными закрытыми настройками, вне
 * public_html. Если файла нет — работать нельзя: без ключа подпись подделает
 * кто угодно.
 */
function files_secret(): string
{
    static $secret = null;
    if ($secret === null) {
        $file = SITE_DIR . '/../.sever18-private/files.php';
        $cfg = is_readable($file) ? (require $file) : [];
        $secret = is_array($cfg) ? (string) ($cfg['link_secret'] ?? '') : '';
        if (strlen($secret) < 32) {
            error_log('api/v2 files: нет ключа для подписи ссылок');
            fail('Сервер временно недоступен. Попробуйте чуть позже.', 503);
        }
    }
    return $secret;
}
