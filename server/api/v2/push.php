<?php
declare(strict_types=1);

// Адреса доставки уведомлений (api/v2/push.php?action=…).
//
//   POST register   {token}          — телефон с приложением сообщает свой адрес Expo
//   POST unregister                  — выход из аккаунта в приложении
//   POST subscribe  {subscription}   — браузер подписался на уведомления сайта
//   POST unsubscribe                 — отписался
//   POST heartbeat  {online}         — «я сейчас на сайте» (раз в 45 секунд)
//
// Зачем heartbeat: push не шлётся тому, кто прямо сейчас на сайте — он и так
// видит новое сообщение или смену статуса живьём. Раньше этот признак вела
// Firestore (users.isOnline / lastActiveAt).

require __DIR__ . '/_bootstrap.php';

$user = require_user();
require_method('POST');

switch ($_GET['action'] ?? '') {
    case 'register':
        register_token($user);
    case 'unregister':
        db()->prepare('UPDATE users SET expo_push_token = NULL WHERE id = ?')->execute([$user['id']]);
        respond(['ok' => true]);
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
