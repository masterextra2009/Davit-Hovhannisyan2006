<?php
declare(strict_types=1);

// Вход и регистрация на новом сервере (api/v2/auth.php?action=…).
//
//   POST register  {email, password, fullName, phone?, consentVersion, source}
//   POST login     {email, password, source}
//   POST logout    (Authorization: Bearer <token>)
//   GET  me        (Authorization: Bearer <token>)
//   POST guest     {source}  — «Загрузить файл» без регистрации
//   POST upgrade   {email, password, fullName, phone?, consentVersion}
//                            — гость заводит настоящий аккаунт, заказы остаются
//   POST delete-account       — клиент удаляет свой аккаунт (152-ФЗ, ст. 14)
//   POST forgot    {email}    — письмо со ссылкой на смену пароля
//   POST reset     {token, password} — сама смена пароля по ссылке из письма
//
// Старые клиенты входят со своими паролями: пока пароль ещё не перенесён
// (password_hash пуст), он один раз сверяется с Firebase и сохраняется у нас
// хешем — дальше Google для этого клиента не нужен. Сами пароли из Google не
// выгружаются и нигде не хранятся в открытом виде.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_referrals.php';
require __DIR__ . '/_mail.php';
require __DIR__ . '/_erase.php';

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
/** Сколько живёт ссылка (и код) из письма о смене пароля. */
const RESET_TTL_MINUTES = 60;
/**
 * Сколько раз можно ошибиться кодом, прежде чем он умрёт.
 *
 * Перебор и так закрыт общим ограничителем (10 обращений за 5 минут), но
 * шесть цифр — это немного, и пусть у самого кода будет свой предел.
 */
const RESET_CODE_TRIES = 5;

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
    case 'guest':
        require_method('POST');
        limit_attempts();
        guest();
    case 'upgrade':
        require_method('POST');
        limit_attempts();
        upgrade_guest();
    case 'delete-account':
        require_method('POST');
        delete_account();
    case 'forgot':
        require_method('POST');
        limit_attempts();
        forgot_password();
    case 'reset':
        require_method('POST');
        limit_attempts();
        reset_password();
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
    // Согласие на рекламу — отдельное, и по умолчанию его НЕТ
    // (38-ФЗ, ст. 18). Уведомления о своём заказе к рекламе не
    // относятся и приходят независимо от этой галочки.
    $marketing = (body()['marketingConsent'] ?? false) === true;
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO users (id, email, full_name, role, phone, password_hash, auth_provider, marketing_consent, created_at)
             VALUES (?, ?, ?, \'client\', ?, ?, \'password\', ?, ?)'
        )->execute([$id, $email, $fullName, $phone ?: null, password_hash($password, PASSWORD_DEFAULT), $marketing ? 1 : 0, now_utc()]);

        $consent = $pdo->prepare(
            'INSERT INTO consents (user_id, kind, granted, doc_version, source, ip) VALUES (?, ?, 1, ?, ?, ?)'
        );
        $consent->execute([$id, 'personal_data', $consentVersion, $source, client_ip()]);
        $consent->execute([$id, 'offer', $consentVersion, $source, client_ip()]);
        if ($marketing) {
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

/**
 * Гостевой вход: человек нажал «Загрузить файл» на главной и не хочет пока
 * заводить аккаунт. Пароля нет — заказ держится на самом пропуске, поэтому
 * гость живёт только в этом браузере. Почту и имя он укажет при оформлении.
 */
function guest()
{
    $pdo = db();
    $id = new_id();
    $source = source();
    $pdo->prepare(
        "INSERT INTO users (id, email, full_name, role, auth_provider, is_guest, created_at)
         VALUES (?, NULL, '', 'client', 'guest', 1, ?)"
    )->execute([$id, now_utc()]);

    // Согласие гость даёт тем же нажатием — храним так же, как у обычных.
    $consentVersion = str_field('consentVersion', 32);
    if ($consentVersion !== '') {
        $consent = $pdo->prepare(
            'INSERT INTO consents (user_id, kind, granted, doc_version, source, ip) VALUES (?, ?, 1, ?, ?, ?)'
        );
        $consent->execute([$id, 'personal_data', $consentVersion, $source, client_ip()]);
        $consent->execute([$id, 'offer', $consentVersion, $source, client_ip()]);
    }

    $token = create_session($id, $source === 'app' ? 'app' : 'web');
    $user = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $user->execute([$id]);
    respond(['ok' => true, 'token' => $token, 'user' => user_public($user->fetch())], 201);
}

/**
 * Удаление своего аккаунта по требованию клиента (152-ФЗ, ст. 14 ч. 1: право
 * на удаление данных; в приложении это обязательный пункт и по правилам
 * магазинов).
 *
 * Что происходит: профиль помечается удалённым и обезличивается прямо сейчас,
 * входы обрываются, чат и уведомления удаляются вместе с ним (они привязаны к
 * пользователю). Заказы остаются: на них держится бухгалтерия и чеки ЮKassa —
 * но без имени, почты и телефона. Файлы заказов чистит уборщик по сроку.
 */
function delete_account()
{
    $user = require_user();
    if ($user['role'] === 'admin') {
        fail('Аккаунт администратора так не удаляется', 403);
    }
    erase_user($user['id']);
    respond(['ok' => true]);
}

/**
 * Гость решил завести настоящий аккаунт. Важно: остаёмся тем же самым
 * пользователем — только добавляем почту, пароль и имя. Иначе его заказы,
 * загруженные файлы и переписка остались бы на «старом» госте, а человек
 * увидел бы пустой кабинет.
 */
function upgrade_guest()
{
    $user = require_user();
    if ((int) $user['is_guest'] !== 1) {
        fail('Аккаунт уже зарегистрирован', 409);
    }
    $email = normalized_email();
    $password = (string) (body()['password'] ?? '');
    $fullName = str_field('fullName');
    $phone = str_field('phone', 32);
    $consentVersion = str_field('consentVersion', 32);

    if (mb_strlen($password) < MIN_PASSWORD) {
        fail('Пароль — не короче ' . MIN_PASSWORD . ' символов');
    }
    if ($fullName === '') {
        fail('Укажите имя');
    }
    if ($consentVersion === '' || (body()['personalDataConsent'] ?? false) !== true) {
        fail('Нужно согласие на обработку персональных данных');
    }

    $pdo = db();
    $exists = $pdo->prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?');
    $exists->execute([$email, $user['id']]);
    if ($exists->fetchColumn()) {
        fail('Эта почта уже занята — войдите в тот аккаунт', 409);
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "UPDATE users SET email = ?, full_name = ?, phone = ?, password_hash = ?,
                    auth_provider = 'password', is_guest = 0 WHERE id = ?"
        )->execute([$email, $fullName, $phone ?: null, password_hash($password, PASSWORD_DEFAULT), $user['id']]);

        $consent = $pdo->prepare(
            'INSERT INTO consents (user_id, kind, granted, doc_version, source, ip) VALUES (?, ?, 1, ?, ?, ?)'
        );
        $source = source();
        $consent->execute([$user['id'], 'personal_data', $consentVersion, $source, client_ip()]);
        $consent->execute([$user['id'], 'offer', $consentVersion, $source, client_ip()]);

        // Свой код приглашения гостю не заводили — заводим сейчас, вместе с
        // подарком, если он пришёл по чужой ссылке.
        register_referral_code($pdo, $user['id']);
        apply_invite($pdo, $user['id'], str_field('referralCode', 32));
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_log('api/v2 upgrade: ' . $e->getMessage());
        fail('Не удалось завершить регистрацию. Попробуйте ещё раз.', 500);
    }

    // Заказы, файлы и переписка остаются на месте: id не менялся.
    $st = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $st->execute([$user['id']]);
    respond(['ok' => true, 'user' => user_public($st->fetch())]);
}


/**
 * «Забыли пароль?» — присылаем на почту ссылку для смены пароля.
 *
 * Ответ всегда одинаковый, даже если такой почты у нас нет: иначе по форме
 * можно было бы проверять, зарегистрирован ли человек на сайте.
 */
function forgot_password()
{
    $email = mb_strtolower(str_field('email'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Проверьте адрес почты');
    }
    $answer = ['ok' => true, 'sent' => true];

    $pdo = db();
    $st = $pdo->prepare('SELECT id, full_name FROM users WHERE email = ? AND deleted_at IS NULL AND is_guest = 0');
    $st->execute([$email]);
    $user = $st->fetch();
    if (!$user) {
        respond($answer);
    }

    // Старые неиспользованные ссылки этого человека гасим: действующей должна
    // быть только последняя.
    $pdo->prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL')->execute([$user['id']]);

    $token = bin2hex(random_bytes(32));
    // Шесть цифр рядом со ссылкой — для приложения. Там ссылку открывать
    // некуда: телефон откроет её в браузере и уведёт человека на сайт.
    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $expires = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify('+' . RESET_TTL_MINUTES . ' minutes')->format('Y-m-d H:i:s.v');
    $pdo->prepare('INSERT INTO password_resets (token_hash, code_hash, user_id, expires_at) VALUES (?, ?, ?, ?)')
        ->execute([hash('sha256', $token), reset_code_hash($code, (string) $user['id']), $user['id'], $expires]);

    $link = 'https://sever-18.ru/?reset=' . $token;
    $name = trim((string) $user['full_name']);
    // Код идёт ПЕРВЫМ: в приложении нужен именно он, а приложением
    // пользуются с телефона, где письмо читают бегло и до конца не листают.
    $text = ($name !== '' ? $name . ', здравствуйте!' : 'Здравствуйте!') . "

"
        . "Вы просили сменить пароль в личном кабинете Фото-Север.

"
        . "Код для приложения:  " . $code . "

"
        . "Впишите его в приложении, в окне «Забыли пароль?».

"
        . "Если вы на компьютере — откройте эту ссылку:

"
        . $link . "

"
        . "И код, и ссылка действуют час и срабатывают один раз.

"
        . "Если вы ничего не просили — просто удалите это письмо, пароль останется прежним.

"
        . "Фото-Север, Северное шоссе, 18
https://sever-18.ru";

    if (!send_mail($email, 'Смена пароля в Фото-Север', $text)) {
        // Человеку про внутренние сбои не рассказываем — но и делать вид, что
        // письмо ушло, нельзя: он будет ждать его напрасно.
        fail('Не удалось отправить письмо. Напишите нам в чат — поможем вручную.', 500);
    }
    respond($answer);
}

/** Отпечаток кода. Соль — номер клиента: одинаковые шесть цифр у разных людей
 *  должны давать разные отпечатки. */
function reset_code_hash(string $code, string $userId): string
{
    return hash('sha256', $code . '|' . $userId);
}

/**
 * Находит действующую заявку на смену пароля по коду из письма.
 *
 * Ответ на «кода нет» и на «код неверен» намеренно один и тот же: иначе по
 * нему можно было бы узнать, заведён ли на эту почту кабинет.
 */
function find_reset_by_code(string $email, string $code): array
{
    if (!preg_match('/^\d{6}$/', $code)) {
        fail('Код — шесть цифр из письма');
    }
    $pdo = db();
    $st = $pdo->prepare('SELECT r.token_hash, r.code_hash, r.tries, r.user_id, u.email
                         FROM password_resets r JOIN users u ON u.id = r.user_id
                         WHERE u.email = ? AND r.code_hash IS NOT NULL AND r.used_at IS NULL
                           AND r.expires_at > UTC_TIMESTAMP(3) AND u.deleted_at IS NULL
                         ORDER BY r.created_at DESC LIMIT 1');
    $st->execute([$email]);
    $row = $st->fetch();
    if (!$row) {
        fail('Код не подошёл или устарел — запросите новый', 410);
    }
    if ((int) $row['tries'] >= RESET_CODE_TRIES) {
        fail('Слишком много попыток. Запросите новый код.', 429);
    }
    // hash_equals, а не ==: сравнение за одинаковое время, чтобы по задержке
    // нельзя было подбирать код по одной цифре.
    if (!hash_equals((string) $row['code_hash'], reset_code_hash($code, (string) $row['user_id']))) {
        $pdo->prepare('UPDATE password_resets SET tries = tries + 1 WHERE token_hash = ?')
            ->execute([$row['token_hash']]);
        fail('Код не подошёл или устарел — запросите новый', 410);
    }
    return $row;
}

/**
 * Смена пароля: по ссылке из письма (сайт) или по коду из него же (приложение).
 *
 * Два входа, потому что и мест два. В браузере ссылка — самый короткий путь.
 * В приложении она бесполезна: телефон откроет её в браузере и уведёт человека
 * на сайт, где он попадает на страницу, похожую на обычный вход. Поэтому у
 * приложения свой ключ — шесть цифр из того же письма.
 */
function reset_password()
{
    $password = (string) (body()['password'] ?? '');
    if (mb_strlen($password) < MIN_PASSWORD) {
        fail('Пароль — не короче ' . MIN_PASSWORD . ' символов');
    }

    $token = str_field('token', 128);
    $code = preg_replace('/\D+/', '', (string) (body()['code'] ?? '')) ?? '';

    $pdo = db();
    if ($token !== '') {
        if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
            fail('Ссылка не подходит — запросите новую');
        }
        $st = $pdo->prepare('SELECT r.token_hash, r.user_id, u.email FROM password_resets r
                             JOIN users u ON u.id = r.user_id
                             WHERE r.token_hash = ? AND r.used_at IS NULL
                               AND r.expires_at > UTC_TIMESTAMP(3) AND u.deleted_at IS NULL');
        $st->execute([hash('sha256', $token)]);
        $row = $st->fetch();
        if (!$row) {
            fail('Ссылка устарела или уже использована — запросите новую', 410);
        }
    } elseif ($code !== '') {
        $row = find_reset_by_code(mb_strtolower(str_field('email')), $code);
    } else {
        fail('Впишите код из письма');
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $row['user_id']]);
        $pdo->prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?')
            ->execute([now_utc(), $row['token_hash']]);
        // Все прежние входы обрываем: если пароль меняют из-за того, что в
        // аккаунт кто-то влез, чужой вход должен закончиться здесь же.
        $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$row['user_id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_log('api/v2 reset: ' . $e->getMessage());
        fail('Не удалось сменить пароль. Попробуйте ещё раз.', 500);
    }

    // Сразу впускаем — человек только что подтвердил, что почта его.
    $newToken = create_session($row['user_id'], source() === 'app' ? 'app' : 'web');
    $user = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $user->execute([$row['user_id']]);
    respond(['ok' => true, 'token' => $newToken, 'user' => user_public($user->fetch())]);
}
