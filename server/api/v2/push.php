<?php
declare(strict_types=1);

// Адреса доставки уведомлений (api/v2/push.php?action=…).
//
//   POST register   {token}          — телефон с приложением сообщает свой адрес Expo
//   POST unregister                  — выход из аккаунта в приложении
//   POST subscribe  {subscription}   — браузер подписался на уведомления сайта
//   POST unsubscribe                 — отписался
//   POST heartbeat  {online}         — «я сейчас на сайте» (раз в 45 секунд)
//   GET  key                         — открытый ключ VAPID для подписки браузера
//
// Зачем heartbeat: push не шлётся тому, кто прямо сейчас на сайте — он и так
// видит новое сообщение или смену статуса живьём. Раньше этот признак вела
// Firestore (users.isOnline / lastActiveAt).

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_webpush.php';

// Открытый ключ нужен браузеру ДО подписки, и секретом он не является —
// единственное место здесь, куда можно зайти без входа в аккаунт.
if (($_GET['action'] ?? '') === 'key') {
    require_method('GET');
    respond(['ok' => true, 'publicKey' => webpush_public_key()]);
}

$user = require_user();
require_method('POST');

switch ($_GET['action'] ?? '') {
    case 'register':
        register_token($user);
    case 'unregister':
        unregister_token($user);
    case 'subscribe':
        subscribe_browser($user);
    case 'unsubscribe':
        db()->prepare('UPDATE users SET push_subscription = NULL WHERE id = ?')->execute([$user['id']]);
        respond(['ok' => true]);
    case 'heartbeat':
        heartbeat($user);
    default:
        fail('Неизвестное действие', 404);
}

function register_token(array $user)
{
    $token = str_field('token', 255);
    // Expo выдаёт адреса вида ExponentPushToken[xxxxxxxx]. Чужие строки не
    // храним: всё равно ничего не доставят, а место в профиле займут.
    if (!preg_match('/^Expo(nent)?PushToken\[[A-Za-z0-9_\-]+\]$/', $token)) {
        fail('Неверный адрес уведомлений');
    }
    // Один и тот же телефон может войти под другим аккаунтом — тогда старый
    // владелец адреса перестаёт быть его хозяином, иначе уведомления чужого
    // заказа придут на этот телефон.
    db()->prepare('UPDATE users SET expo_push_token = NULL WHERE expo_push_token = ? AND id <> ?')
        ->execute([$token, $user['id']]);
    db()->prepare('UPDATE users SET expo_push_token = ? WHERE id = ?')->execute([$token, $user['id']]);
    // Телефонов у аккаунта может быть несколько — уведомления идут на все
    // (schema-012). Строка телефона переезжает к тому, кто вошёл последним.
    $now = now_utc();
    db()->prepare('INSERT INTO push_devices (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?) AS new
                   ON DUPLICATE KEY UPDATE user_id = new.user_id, last_seen_at = new.last_seen_at')
        ->execute([$token, $user['id'], $now, $now]);
    respond(['ok' => true]);
}

/**
 * Выход из аккаунта в приложении. Новое приложение присылает адрес своего
 * телефона — убираем только его, остальные телефоны клиента продолжают
 * получать уведомления. Старые версии адрес не присылают — тогда, как и
 * раньше, отвязываем все телефоны аккаунта.
 */
function unregister_token(array $user)
{
    $token = (string) (body()['token'] ?? '');
    if ($token !== '') {
        db()->prepare('DELETE FROM push_devices WHERE token = ? AND user_id = ?')->execute([$token, $user['id']]);
        db()->prepare('UPDATE users SET expo_push_token = NULL WHERE id = ? AND expo_push_token = ?')
            ->execute([$user['id'], $token]);
    } else {
        db()->prepare('DELETE FROM push_devices WHERE user_id = ?')->execute([$user['id']]);
        db()->prepare('UPDATE users SET expo_push_token = NULL WHERE id = ?')->execute([$user['id']]);
    }
    respond(['ok' => true]);
}

function subscribe_browser(array $user)
{
    $sub = body()['subscription'] ?? null;
    if (!is_array($sub) || !isset($sub['endpoint']) || !is_string($sub['endpoint'])) {
        fail('Неверная подписка браузера');
    }
    $json = json_encode($sub, JSON_UNESCAPED_SLASHES);
    if (strlen((string) $json) > 4000) {
        fail('Слишком длинная подписка браузера');
    }
    db()->prepare('UPDATE users SET push_subscription = ? WHERE id = ?')->execute([$json, $user['id']]);
    respond(['ok' => true]);
}

function heartbeat(array $user)
{
    $online = (body()['online'] ?? true) !== false;
    db()->prepare('UPDATE users SET is_online = ?, last_active_at = ? WHERE id = ?')
        ->execute([$online ? 1 : 0, now_utc(), $user['id']]);
    respond(['ok' => true]);
}
