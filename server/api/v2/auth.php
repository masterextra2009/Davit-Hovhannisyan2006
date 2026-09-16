<?php
declare(strict_types=1);

// Вход и регистрация на новом сервере (api/v2/auth.php?action=…).
//
//   POST register  {email, password, fullName, phone?, consentVersion, source}
//   POST login     {email, password, source}
//   POST logout    (Authorization: Bearer <token>)
//   GET  me        (Authorization: Bearer <token>)
//
// Старые клиенты входят со своими паролями: пока пароль ещё не перенесён
// (password_hash пуст), он один раз сверяется с Firebase и сохраняется у нас
// хешем — дальше Google для этого клиента не нужен. Сами пароли из Google не
// выгружаются и нигде не хранятся в открытом виде.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_referrals.php';

/**
 * Защита от подбора пароля: не больше 10 попыток входа или регистрации за
 * 5 минут с одного адреса. Только на них — «кто я» приложение спрашивает часто.
 */
function limit_attempts()
{
    $RATE_LIMIT_MAX = 10;
    $RATE_LIMIT_WINDOW = 300;
    require __DIR__ . '/../rate-limit.php';
}

const MIN_PASSWORD = 6;

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'register':
        require_method('POST');
        limit_attempts();
        register();
    case 'login':
        require_method('POST');
        limit_attempts();
        login();
    case 'logout':
        require_method('POST');
        logout();
    case 'me':
        require_method('GET');
        respond(['ok' => true, 'user' => user_public(require_user())]);
    default:
        fail('Неизвестное действие', 404);
}

function normalized_email(): string
{
    $email = mb_strtolower(str_field('email'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Проверьте адрес почты');
    }
    return $email;
}

function source(): string
{
    return str_field('source', 8) === 'app' ? 'app' : 'site';
}

function register()
{
    $email = normalized_email();
    $password = (string) (body()['password'] ?? '');
    $fullName = str_field('fullName');
    $phone = str_field('phone', 32);
    $consentVersion = str_field('consentVersion', 32);
    $source = source();

    if (mb_strlen($password) < MIN_PASSWORD) {
        fail('Пароль — не короче ' . MIN_PASSWORD . ' символов');
    }
    if ($fullName === '') {
        fail('Укажите имя');
    }
    // Согласие на обработку данных — отдельно и обязательно (152-ФЗ).
    if ($consentVersion === '' || (body()['personalDataConsent'] ?? false) !== true) {
        fail('Нужно согласие на обработку персональных данных');
    }

    $pdo = db();
    $exists = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
    $exists->execute([$email]);
    if ($exists->fetchColumn()) {
        fail('Аккаунт с этой почтой уже есть — войдите', 409);
    }

    $id = new_id();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO users (id, email, full_name, role, phone, password_hash, auth_provider, created_at)
             VALUES (?, ?, ?, \'client\', ?, ?, \'password\', ?)'
        )->execute([$id, $email, $fullName, $phone ?: null, password_hash($password, PASSWORD_DEFAULT), now_utc()]);

        $consent = $pdo->prepare(
            'INSERT INTO consents (user_id, kind, granted, doc_version, source, ip) VALUES (?, ?, 1, ?, ?, ?)'
        );
        $consent->execute([$id, 'personal_data', $consentVersion, $source, client_ip()]);
        $consent->execute([$id, 'offer', $consentVersion, $source, client_ip()]);
        if ((body()['marketingConsent'] ?? false) === true) {
            $consent->execute([$id, 'marketing', $consentVersion, $source, client_ip()]);
        }

        // Свой код для приглашения друзей и, если пришёл по чужой ссылке,
        // подарочная скидка новичку (см. _referrals.php).
        register_referral_code($pdo, $id);
        apply_invite($pdo, $id, str_field('referralCode', 32));

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_log('api/v2 register: ' . $e->getMessage());
        fail('Не удалось создать аккаунт. Попробуйте ещё раз.', 500);
    }

    $token = create_session($id, $source === 'app' ? 'app' : 'web');
    $user = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $user->execute([$id]);
    respond(['ok' => true, 'token' => $token, 'user' => user_public($user->fetch())], 201);
}

function login()
{
    $email = normalized_email();
    $password = (string) (body()['password'] ?? '');
    if ($password === '') {
        fail('Введите пароль');
    }
    $generic = 'Неверная почта или пароль';

    $pdo = db();
    $st = $pdo->prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL');
    $st->execute([$email]);
    $user = $st->fetch() ?: null;

    if ($user && $user['password_hash']) {
        if (!password_verify($password, $user['password_hash'])) {
            fail($generic, 401);
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        }
    } else {
        // Пароль ещё в Google: сверяем один раз и переносим к себе.
        $fb = firebase_check_password($email, $password);
        if (!$fb) {
            fail($generic, 401);
        }
        if (!$user) {
            // Клиент есть в Google, но его данные ещё не перенесены — заводим
            // минимальную запись; полный перенос потом дополнит её по id.
            $pdo->prepare(
                'INSERT INTO users (id, email, full_name, role, auth_provider, created_at)
                 VALUES (?, ?, ?, \'client\', \'password\', ?)'
            )->execute([$fb['localId'], $email, $fb['displayName'] ?? '', now_utc()]);
            $user = ['id' => $fb['localId']];
        }
        $pdo->prepare('UPDATE users SET password_hash = ?, auth_provider = \'password\' WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }

    $pdo->prepare('UPDATE users SET last_active_at = ? WHERE id = ?')->execute([now_utc(), $user['id']]);
    $token = create_session($user['id'], source() === 'app' ? 'app' : 'web');
    $fresh = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $fresh->execute([$user['id']]);
    respond(['ok' => true, 'token' => $token, 'user' => user_public($fresh->fetch())]);
}

function logout()
{
    $token = bearer_token();
    if ($token !== '') {
        db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }
    respond(['ok' => true]);
}

/**
 * Сверяет пароль с Firebase Authentication. Возвращает localId и имя или null.
 * Открытый ключ веб-приложения Firebase берётся из файла сайта — в код не копируется.
 */
function firebase_check_password(string $email, string $password): ?array
{
    $cfgPath = SITE_DIR . '/firebase-applet-config.json';
    $cfg = is_file($cfgPath) ? json_decode((string) file_get_contents($cfgPath), true) : null;
    $apiKey = is_array($cfg) ? ($cfg['apiKey'] ?? '') : '';
    if ($apiKey === '') {
        error_log('api/v2 login: firebase apiKey not found');
        return null;
    }
    $ch = curl_init('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' . rawurlencode($apiKey));
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['email' => $email, 'password' => $password, 'returnSecureToken' => false]),
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false || $code !== 200) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) && !empty($data['localId']) ? $data : null;
}
