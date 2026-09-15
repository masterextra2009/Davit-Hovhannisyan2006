<?php
declare(strict_types=1);

// Вход через Google, Telegram, Яндекс ID и VK ID (api/v2/oauth.php).
//
//   GET  ?action=start&provider=google|telegram|yandex|vk&source=site|app
//        → переход на страницу входа соцсети
//   GET  (возврат из Google / Яндекса / VK: ?code=…&state=…)
//   GET  ?action=telegram&st=… (возврат из Telegram)
//        → переход обратно на сайт (?auth_ticket=…) или в приложение
//          (sever18://auth?ticket=…); при ошибке — auth_error=…
//   POST ?action=exchange {ticket, personalDataConsent?, consentVersion?, marketingConsent?}
//        → {token, user} или {needConsent: true, profile} для нового клиента
//
// Новый клиент получает аккаунт только после отдельного согласия на обработку
// персональных данных (152-ФЗ, ст. 9) — сама кнопка «Войти через…» согласием
// не считается. Ключи соцсетей лежат в .sever18-private/oauth.php, токен бота
// Telegram — в api/config.php, в код не копируются.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_telegram.php';

const OAUTH_REDIRECT = 'https://sever-18.ru/api/v2/oauth.php';
const SITE_ORIGIN = 'https://sever-18.ru';
const APP_RETURN = 'sever18://auth';
const PROVIDERS = ['google', 'telegram', 'yandex', 'vk'];
const PROVIDER_NAMES = ['google' => 'Google', 'telegram' => 'Telegram', 'yandex' => 'Яндекс', 'vk' => 'VK'];
const OAUTH_TTL_MIN = 15;
/** Публичный id бота @photosever_bot (не токен). */
const TELEGRAM_BOT_ID = '8854566946';

// Защита от перебора билетов и засорения базы: 30 обращений за 5 минут с адреса.
$RATE_LIMIT_MAX = 30;
$RATE_LIMIT_WINDOW = 300;
require __DIR__ . '/../rate-limit.php';

$action = $_GET['action'] ?? '';
if ($action === '' && isset($_GET['state'])) {
    $action = 'callback';
}

switch ($action) {
    case 'start':
        start();
    case 'callback':
        callback();
    case 'telegram':
        telegram_return();
    case 'exchange':
        require_method('POST');
        exchange();
    default:
        fail('Неизвестное действие', 404);
}

// ─────────────────────────── Начало входа ───────────────────────────

function start()
{
    $provider = (string) ($_GET['provider'] ?? '');
    $source = ($_GET['source'] ?? '') === 'app' ? 'app' : 'site';
    if (!in_array($provider, PROVIDERS, true)) {
        back($source, ['auth_error' => 'failed']);
    }

    $pdo = db();
    $pdo->exec('DELETE FROM oauth_states WHERE expires_at < UTC_TIMESTAMP(3)');
    $pdo->exec('DELETE FROM auth_tickets WHERE expires_at < UTC_TIMESTAMP(3)');

    $cfg = provider_config($provider);
    if ($cfg === null) {
        back($source, ['auth_error' => 'not_configured', 'provider' => $provider]);
    }

    $state = bin2hex(random_bytes(24));
    $verifier = b64url(random_bytes(48));
    $challenge = b64url(hash('sha256', $verifier, true));
    $pdo->prepare('INSERT INTO oauth_states (state_hash, provider, source, code_verifier, expires_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([hash('sha256', $state), $provider, $source, $verifier, expires_in(OAUTH_TTL_MIN)]);

    switch ($provider) {
        case 'google':
            $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
                'client_id' => $cfg['client_id'],
                'redirect_uri' => OAUTH_REDIRECT,
                'response_type' => 'code',
                'scope' => 'openid email profile',
                'state' => $state,
                'code_challenge' => $challenge,
                'code_challenge_method' => 'S256',
                'prompt' => 'select_account',
            ]);
            break;
        case 'yandex':
            $url = 'https://oauth.yandex.ru/authorize?' . http_build_query([
                'response_type' => 'code',
                'client_id' => $cfg['client_id'],
                'redirect_uri' => OAUTH_REDIRECT,
                'state' => $state,
                'code_challenge' => $challenge,
                'code_challenge_method' => 'S256',
            ]);
            break;
        case 'vk':
            $url = 'https://id.vk.com/authorize?' . http_build_query([
                'response_type' => 'code',
                'client_id' => $cfg['client_id'],
                'redirect_uri' => OAUTH_REDIRECT,
                'state' => $state,
                'code_challenge' => $challenge,
                'code_challenge_method' => 'S256',
                'scope' => 'email',
            ]);
            break;
        default: // telegram
            $url = 'https://oauth.telegram.org/auth?' . http_build_query([
                'bot_id' => $cfg['bot_id'],
                'origin' => SITE_ORIGIN,
                'embed' => 0,
                'request_access' => 'write',
                'return_to' => OAUTH_REDIRECT . '?action=telegram&st=' . $state,
            ]);
    }
    redirect($url);
}

// ─────────────────────────── Возврат из соцсети ───────────────────────────

function callback()
{
    $st = take_state((string) ($_GET['state'] ?? ''));
    if ($st === null) {
        back('site', ['auth_error' => 'expired']);
    }
    if (isset($_GET['error']) || !isset($_GET['code'])) {
        back($st['source'], ['auth_error' => 'cancelled']);
    }
    $cfg = provider_config($st['provider']);
    if ($cfg === null || $st['provider'] === 'telegram') {
        back($st['source'], ['auth_error' => 'failed']);
    }

    $code = (string) $_GET['code'];
    switch ($st['provider']) {
        case 'google':
            $profile = google_profile($cfg, $code, $st['code_verifier']);
            break;
        case 'yandex':
            $profile = yandex_profile($cfg, $code, $st['code_verifier']);
            break;
        default:
            $profile = vk_profile($cfg, $code, $st['code_verifier'], (string) ($_GET['device_id'] ?? ''), (string) ($_GET['state'] ?? ''));
    }
    if ($profile === null) {
        back($st['source'], ['auth_error' => 'failed']);
    }
    finish($st['provider'], $profile, $st['source']);
}

/** Telegram возвращает данные либо в адресе (?id=…&hash=…), либо после «#». */
function telegram_return()
{
    if (!isset($_GET['hash'], $_GET['id'], $_GET['auth_date'])) {
        // Данные после «#» серверу не приходят — их перекладывает в адрес
        // маленький скрипт на этой же странице.
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>Вход через Telegram</title>'
            . '<p id="msg" style="font:16px system-ui,sans-serif;text-align:center;margin-top:40vh">Входим…</p>'
            . '<script src="tg-return.js"></script>';
        exit;
    }

    $st = take_state((string) ($_GET['st'] ?? ''));
    if ($st === null || $st['provider'] !== 'telegram') {
        back('site', ['auth_error' => 'expired']);
    }

    $token = telegram_bot_token();
    if ($token === '') {
        error_log('api/v2 oauth: telegram bot token not found');
        back($st['source'], ['auth_error' => 'not_configured', 'provider' => 'telegram']);
    }

    // Подпись Telegram: HMAC-SHA256 от полей входа, ключ — sha256 токена бота.
    $fields = [];
    foreach (['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username'] as $k) {
        if (isset($_GET[$k]) && $_GET[$k] !== '') {
            $fields[] = $k . '=' . $_GET[$k];
        }
    }
    $expected = hash_hmac('sha256', implode("\n", $fields), hash('sha256', $token, true));
    if (!hash_equals($expected, (string) $_GET['hash'])) {
        back($st['source'], ['auth_error' => 'failed']);
    }
    if (time() - (int) $_GET['auth_date'] > 3600) {
        back($st['source'], ['auth_error' => 'expired']);
    }

    finish('telegram', [
        'uid' => (string) $_GET['id'],
        'email' => null,
        'emailVerified' => false,
        'name' => trim(($_GET['first_name'] ?? '') . ' ' . ($_GET['last_name'] ?? '')),
        'avatar' => $_GET['photo_url'] ?? null,
        'username' => $_GET['username'] ?? null,
    ], $st['source']);
}

/**
 * Клиент уже входил этой соцсетью — вход. Почта из соцсети подтверждена и
 * совпадает с аккаунтом — привязываем соцсеть к нему. Иначе — новый клиент:
 * аккаунт появится только после согласия (exchange).
 */
function finish(string $provider, array $profile, string $source)
{
    $pdo = db();
    $st = $pdo->prepare(
        'SELECT i.user_id FROM user_identities i JOIN users u ON u.id = i.user_id
         WHERE i.provider = ? AND i.provider_uid = ? AND u.deleted_at IS NULL'
    );
    $st->execute([$provider, $profile['uid']]);
    $userId = $st->fetchColumn() ?: null;

    if ($userId === null && $profile['email'] && $profile['emailVerified']) {
        $st = $pdo->prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL');
        $st->execute([mb_strtolower($profile['email'])]);
        $userId = $st->fetchColumn() ?: null;
        if ($userId !== null) {
            $pdo->prepare('INSERT IGNORE INTO user_identities (provider, provider_uid, user_id, email) VALUES (?, ?, ?, ?)')
                ->execute([$provider, $profile['uid'], $userId, $profile['email']]);
        }
    }

    $ticket = bin2hex(random_bytes(32));
    if ($userId !== null) {
        $pdo->prepare('UPDATE user_identities SET last_login_at = ? WHERE provider = ? AND provider_uid = ?')
            ->execute([now_utc(), $provider, $profile['uid']]);
        $pdo->prepare('INSERT INTO auth_tickets (ticket_hash, user_id, source, expires_at) VALUES (?, ?, ?, ?)')
            ->execute([hash('sha256', $ticket), $userId, $source, expires_in(OAUTH_TTL_MIN)]);
    } else {
        $profile['provider'] = $provider;
        $pdo->prepare('INSERT INTO auth_tickets (ticket_hash, profile, source, expires_at) VALUES (?, ?, ?, ?)')
            ->execute([hash('sha256', $ticket), json_encode($profile, JSON_UNESCAPED_UNICODE), $source, expires_in(OAUTH_TTL_MIN)]);
    }
    back($source, $source === 'app' ? ['ticket' => $ticket] : ['auth_ticket' => $ticket]);
}

// ─────────────────────────── Обмен билета на вход ───────────────────────────

function exchange()
{
    $ticket = strtolower(str_field('ticket', 64));
    if (!preg_match('/^[a-f0-9]{64}$/', $ticket)) {
        fail('Ссылка входа устарела — попробуйте ещё раз', 410);
    }
    $pdo = db();
    $st = $pdo->prepare('SELECT * FROM auth_tickets WHERE ticket_hash = ? AND expires_at > UTC_TIMESTAMP(3)');
    $st->execute([hash('sha256', $ticket)]);
    $row = $st->fetch();
    if (!$row) {
        fail('Ссылка входа устарела — попробуйте ещё раз', 410);
    }
    $device = $row['source'] === 'app' ? 'app' : 'web';

    if ($row['user_id'] !== null) {
        $pdo->prepare('DELETE FROM auth_tickets WHERE ticket_hash = ?')->execute([$row['ticket_hash']]);
        $pdo->prepare('UPDATE users SET last_active_at = ? WHERE id = ?')->execute([now_utc(), $row['user_id']]);
        $user = $pdo->prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL');
        $user->execute([$row['user_id']]);
        $u = $user->fetch();
        if (!$u) {
            fail('Аккаунт не найден', 404);
        }
        respond(['ok' => true, 'token' => create_session($u['id'], $device), 'user' => user_public($u)]);
    }

    $profile = json_decode((string) $row['profile'], true) ?: [];
    $provider = (string) ($profile['provider'] ?? '');
    if (!in_array($provider, PROVIDERS, true) || empty($profile['uid'])) {
        fail('Ссылка входа устарела — попробуйте ещё раз', 410);
    }

    $consentVersion = str_field('consentVersion', 32);
    if ($consentVersion === '' || (body()['personalDataConsent'] ?? false) !== true) {
        // Билет не гасим: клиент отметит согласие и отправит его ещё раз.
        respond(['ok' => true, 'needConsent' => true, 'profile' => array_filter([
            'provider' => $provider,
            'providerName' => PROVIDER_NAMES[$provider],
            'fullName' => $profile['name'] ?? '',
            'email' => $profile['email'] ?? null,
            'avatarUrl' => $profile['avatar'] ?? null,
        ], fn($v) => $v !== null)]);
    }

    // Почту берём, только если соцсеть её подтвердила и она ни за кем не числится.
    $email = null;
    if (!empty($profile['email']) && !empty($profile['emailVerified'])) {
        $candidate = mb_strtolower((string) $profile['email']);
        $taken = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
        $taken->execute([$candidate]);
        $email = $taken->fetchColumn() ? null : $candidate;
    }
    $name = mb_substr(trim((string) ($profile['name'] ?? '')), 0, 255) ?: 'Клиент';
    $avatar = isset($profile['avatar']) && preg_match('#^https://#', (string) $profile['avatar'])
        ? mb_substr((string) $profile['avatar'], 0, 1024) : null;
    $source = $row['source'];

    $id = new_id();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO users (id, email, full_name, role, avatar_url, auth_provider, telegram_username, created_at, last_active_at)
             VALUES (?, ?, ?, \'client\', ?, ?, ?, ?, ?)'
        )->execute([
            $id, $email, $name, $avatar, $provider,
            $provider === 'telegram' ? mb_substr((string) ($profile['username'] ?? ''), 0, 64) ?: null : null,
            now_utc(), now_utc(),
        ]);
        $pdo->prepare('INSERT INTO user_identities (provider, provider_uid, user_id, email, last_login_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$provider, (string) $profile['uid'], $id, $profile['email'] ?? null, now_utc()]);

        $consent = $pdo->prepare(
            'INSERT INTO consents (user_id, kind, granted, doc_version, source, ip) VALUES (?, ?, 1, ?, ?, ?)'
        );
        $consent->execute([$id, 'personal_data', $consentVersion, $source, client_ip()]);
        $consent->execute([$id, 'offer', $consentVersion, $source, client_ip()]);
        if ((body()['marketingConsent'] ?? false) === true) {
            $consent->execute([$id, 'marketing', $consentVersion, $source, client_ip()]);
        }
        $pdo->prepare('DELETE FROM auth_tickets WHERE ticket_hash = ?')->execute([$row['ticket_hash']]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_log('api/v2 oauth exchange: ' . $e->getMessage());
        fail('Не удалось создать аккаунт. Попробуйте ещё раз.', 500);
    }

    $user = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $user->execute([$id]);
    respond(['ok' => true, 'token' => create_session($id, $device), 'user' => user_public($user->fetch())], 201);
}

// ─────────────────────────── Соцсети ───────────────────────────

function google_profile(array $cfg, string $code, string $verifier): ?array
{
    $t = http_json('https://oauth2.googleapis.com/token', ['form' => [
        'grant_type' => 'authorization_code',
        'code' => $code,
        'client_id' => $cfg['client_id'],
        'client_secret' => $cfg['client_secret'] ?? '',
        'redirect_uri' => OAUTH_REDIRECT,
        'code_verifier' => $verifier,
    ]]);
    if (empty($t['access_token'])) {
        return null;
    }
    $u = http_json('https://openidconnect.googleapis.com/v1/userinfo', ['headers' => ['Authorization: Bearer ' . $t['access_token']]]);
    if (empty($u['sub'])) {
        return null;
    }
    return [
        'uid' => (string) $u['sub'],
        'email' => $u['email'] ?? null,
        'emailVerified' => ($u['email_verified'] ?? false) === true,
        'name' => $u['name'] ?? '',
        'avatar' => $u['picture'] ?? null,
    ];
}

function yandex_profile(array $cfg, string $code, string $verifier): ?array
{
    $t = http_json('https://oauth.yandex.ru/token', ['form' => [
        'grant_type' => 'authorization_code',
        'code' => $code,
        'client_id' => $cfg['client_id'],
        'client_secret' => $cfg['client_secret'] ?? '',
        'code_verifier' => $verifier,
    ]]);
    if (empty($t['access_token'])) {
        return null;
    }
    $u = http_json('https://login.yandex.ru/info?format=json', ['headers' => ['Authorization: OAuth ' . $t['access_token']]]);
    if (empty($u['id'])) {
        return null;
    }
    $avatar = empty($u['is_avatar_empty']) && !empty($u['default_avatar_id'])
        ? 'https://avatars.yandex.net/get-yapic/' . rawurlencode((string) $u['default_avatar_id']) . '/islands-200'
        : null;
    return [
        'uid' => (string) $u['id'],
        'email' => $u['default_email'] ?? null,
        // Яндекс отдаёт только подтверждённые адреса.
        'emailVerified' => !empty($u['default_email']),
        'name' => $u['real_name'] ?? ($u['display_name'] ?? ''),
        'avatar' => $avatar,
    ];
}

function vk_profile(array $cfg, string $code, string $verifier, string $deviceId, string $state): ?array
{
    $t = http_json('https://id.vk.com/oauth2/auth', ['form' => [
        'grant_type' => 'authorization_code',
        'code' => $code,
        'code_verifier' => $verifier,
        'client_id' => $cfg['client_id'],
        'device_id' => $deviceId,
        'redirect_uri' => OAUTH_REDIRECT,
        'state' => $state,
    ]]);
    if (empty($t['access_token'])) {
        return null;
    }
    $info = http_json('https://id.vk.com/oauth2/user_info', ['form' => [
        'client_id' => $cfg['client_id'],
        'access_token' => $t['access_token'],
    ]]);
    $u = $info['user'] ?? null;
    if (empty($u['user_id'])) {
        return null;
    }
    return [
        'uid' => (string) $u['user_id'],
        'email' => $u['email'] ?? null,
        // VK не гарантирует подтверждение почты — к чужому аккаунту по ней не привязываем.
        'emailVerified' => false,
        'name' => trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? '')),
        'avatar' => $u['avatar'] ?? null,
    ];
}

// ─────────────────────────── Служебное ───────────────────────────

/** Настройки соцсети или null, если ключи ещё не вписаны. */
function provider_config(string $provider): ?array
{
    static $all = null;
    if ($all === null) {
        $file = SITE_DIR . '/../.sever18-private/oauth.php';
        $all = is_readable($file) ? (require $file) : [];
        $all = is_array($all) ? $all : [];
    }
    $cfg = $all[$provider] ?? [];
    if ($provider === 'telegram') {
        $cfg['bot_id'] = ($cfg['bot_id'] ?? '') ?: TELEGRAM_BOT_ID;
        return telegram_bot_token() !== '' ? $cfg : null;
    }
    if (empty($cfg['client_id'])) {
        return null;
    }
    if (in_array($provider, ['google', 'yandex'], true) && empty($cfg['client_secret'])) {
        return null;
    }
    return $cfg;
}

/** Забирает одноразовую метку входа (после этого она больше не действует). */
function take_state(string $state): ?array
{
    if (!preg_match('/^[a-f0-9]{48}$/', $state)) {
        return null;
    }
    $pdo = db();
    $hash = hash('sha256', $state);
    $st = $pdo->prepare('SELECT * FROM oauth_states WHERE state_hash = ? AND expires_at > UTC_TIMESTAMP(3)');
    $st->execute([$hash]);
    $row = $st->fetch() ?: null;
    $pdo->prepare('DELETE FROM oauth_states WHERE state_hash = ?')->execute([$hash]);
    return $row;
}

function http_json(string $url, array $opts = []): ?array
{
    $ch = curl_init($url);
    $set = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => $opts['headers'] ?? [],
    ];
    if (isset($opts['form'])) {
        $set[CURLOPT_POST] = true;
        $set[CURLOPT_POSTFIELDS] = http_build_query($opts['form']);
    }
    curl_setopt_array($ch, $set);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false || $code >= 400) {
        error_log('api/v2 oauth: ' . parse_url($url, PHP_URL_HOST) . ' HTTP ' . $code . ' ' . mb_substr((string) $raw, 0, 200));
        return null;
    }
    $data = json_decode((string) $raw, true);
    return is_array($data) ? $data : null;
}

function back(string $source, array $params)
{
    $base = $source === 'app' ? APP_RETURN : SITE_ORIGIN . '/';
    redirect($base . '?' . http_build_query($params));
}

function redirect(string $url)
{
    header('Cache-Control: no-store');
    header('Location: ' . $url, true, 302);
    exit;
}

function b64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function expires_in(int $minutes): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify('+' . $minutes . ' minutes')
        ->format('Y-m-d H:i:s.v');
}
