<?php
declare(strict_types=1);

// Общая часть нового сервера Фото-Севера (api/v2) — переезд данных из Google
// Firebase в РФ (152-ФЗ, ст. 18 ч. 5). База MySQL mastesu6_sever на хостинге
// Beget; настройки с паролем лежат выше public_html:
// ~/sever-18.ru/.sever18-private/sever18-db.php.
//
// Подключается первой строкой в каждом файле api/v2.

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// Технические подробности ошибок — только в журнал сервера. Клиенту раньше
// уходил текст «Fatal error» с путями на хостинге — этого быть не должно.
ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e) {
    error_log('api/v2: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['ok' => false, 'error' => 'Что-то пошло не так. Попробуйте ещё раз.'], JSON_UNESCAPED_UNICODE);
});

// Сайт обращается из браузера — ему нужен CORS. Приложение ходит без Origin.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ['https://sever-18.ru', 'https://www.sever-18.ru'], true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/** Домашняя папка аккаунта: ~/sever-18.ru/public_html/api/v2 → ~ */
const HOME_DIR = __DIR__ . '/../../../..';
/** Корень сайта: ~/sever-18.ru/public_html */
const SITE_DIR = __DIR__ . '/../..';
/** Сколько живёт вход, дней. */
const SESSION_DAYS = 180;

function respond(array $data, int $code = 200)
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $code = 400)
{
    respond(['ok' => false, 'error' => $message], $code);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    // Сайт на Beget работает от отдельного пользователя сайта: домашняя папка
    // и ~/private ему закрыты. Поэтому настройки лежат в папке сайта, но выше
    // public_html — из интернета она не открывается.
    $candidates = [
        SITE_DIR . '/../.sever18-private/sever18-db.php',
        HOME_DIR . '/private/sever18-db.php',
    ];
    $c = null;
    foreach ($candidates as $file) {
        if (is_readable($file)) {
            $c = require $file;
            break;
        }
    }
    if (!is_array($c)) {
        error_log('api/v2 db: config not readable');
        fail('Сервер временно недоступен. Попробуйте чуть позже.', 503);
    }
    try {
        $pdo = new PDO(
            "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']}",
            $c['user'],
            $c['password'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        $pdo->exec("SET time_zone = '+00:00'");
    } catch (Throwable $e) {
        error_log('api/v2 db: ' . $e->getMessage());
        fail('Сервер временно недоступен. Попробуйте чуть позже.', 503);
    }
    return $pdo;
}

/** Тело запроса в JSON. */
function body(): array
{
    static $data = null;
    if ($data === null) {
        $raw = file_get_contents('php://input') ?: '';
        $decoded = json_decode($raw, true);
        $data = is_array($decoded) ? $decoded : [];
    }
    return $data;
}

function str_field(string $key, int $max = 255): string
{
    $v = body()[$key] ?? '';
    return is_string($v) ? mb_substr(trim($v), 0, $max) : '';
}

function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        fail('Неверный метод запроса', 405);
    }
}

/** Время для MySQL в UTC, с миллисекундами. */
function now_utc(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');
}

/** Время из MySQL — в ISO 8601, как его привыкли видеть сайт и приложение. */
function iso(?string $mysql): ?string
{
    if ($mysql === null) {
        return null;
    }
    return (new DateTimeImmutable($mysql, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

/** Id в том же виде, что у Firebase: 28 латинских букв и цифр. */
function new_id(int $len = 28): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    $out = '';
    for ($i = 0; $i < $len; $i++) {
        $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $out;
}

function client_ip(): string
{
    return substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45);
}

/** Выдаёт новый вход и возвращает токен. В базе хранится только его sha256. */
function create_session(string $userId, string $device): string
{
    $token = bin2hex(random_bytes(32));
    $expires = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify('+' . SESSION_DAYS . ' days')
        ->format('Y-m-d H:i:s.v');
    db()->prepare('INSERT INTO sessions (token_hash, user_id, device, expires_at) VALUES (?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $userId, $device === 'app' ? 'app' : 'web', $expires]);
    return $token;
}

function bearer_token(): string
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    // Apache на Beget не кладёт Authorization в $_SERVER — берём из заголовков.
    if ($h === '' && function_exists('getallheaders')) {
        $h = array_change_key_case(getallheaders(), CASE_LOWER)['authorization'] ?? '';
    }
    return preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $h, $m) ? strtolower($m[1]) : '';
}

/** Текущий пользователь по токену или null. */
function current_user(): ?array
{
    $token = bearer_token();
    if ($token === '') {
        return null;
    }
    $st = db()->prepare(
        'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND u.deleted_at IS NULL'
    );
    $st->execute([hash('sha256', $token)]);
    $row = $st->fetch();
    return $row ?: null;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        fail('Нужно войти в аккаунт', 401);
    }
    return $user;
}

/** ISO 8601 → время MySQL в UTC, или null. */
function parse_iso(string $s): ?string
{
    if ($s === '' || !preg_match('/^\d{4}-\d{2}-\d{2}T/', $s)) {
        return null;
    }
    try {
        return (new DateTimeImmutable($s))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    } catch (Throwable $e) {
        return null;
    }
}

function require_admin(bool $isAdmin)
{
    if (!$isAdmin) {
        fail('Нет доступа', 403);
    }
}

/** Пользователь в том виде, в каком его ждут сайт и приложение (src/types.ts). */
function user_public(array $u): array
{
    // Редкие поля профиля (например, как обрезан аватар: avatarX/avatarY/
    // avatarScale) лежат в extra одним свёртком — их сайт ждёт наравне с
    // остальными, поэтому разворачиваем обратно.
    $extra = !empty($u['extra']) ? (json_decode((string) $u['extra'], true) ?: []) : [];

    return array_filter(array_merge($extra, [
        'id' => $u['id'],
        'email' => $u['email'],
        'fullName' => $u['full_name'],
        'role' => $u['role'],
        'phone' => $u['phone'],
        'avatarUrl' => $u['avatar_url'],
        'createdAt' => iso($u['created_at']),
        'isGuest' => (bool) $u['is_guest'],
        'telegramChatId' => $u['telegram_chat_id'],
        'telegramUsername' => $u['telegram_username'],
        'telegramNotificationsEnabled' => (bool) $u['telegram_notifications_enabled'],
        'promoCode' => $u['promo_code'],
        'promoDiscount' => $u['promo_discount'] !== null ? (int) $u['promo_discount'] : null,
        'promoExpiresAt' => iso($u['promo_expires_at']),
        'promoGiftedSeen' => (bool) $u['promo_gifted_seen'],
        'referralCode' => $u['referral_code'],
        'adminTypingAt' => iso($u['admin_typing_at']),
    ]), fn($v) => $v !== null);
}
