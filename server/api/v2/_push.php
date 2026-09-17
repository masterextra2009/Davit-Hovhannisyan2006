<?php
declare(strict_types=1);

// Push-уведомления на телефон (приложение sever18-app) — вместо Cloud
// Functions notifyOrderStatusChange / notifyNewChatMessage / notifyNewPromo.
//
// Каналов два, и они независимы: приложение (Expo) и браузер сайта
// (push_subscription, шифрование — в _webpush.php). Один и тот же человек
// может пользоваться и тем и другим, поэтому шлём в оба, какие есть.
//
// Общее правило (было и в Cloud Function): не шлём уведомление тому, кто
// прямо сейчас сидит на сайте — он и так видит всё живьём.

require_once __DIR__ . '/_webpush.php';

/** Сколько человек считается «на сайте» после последнего сигнала (сайт шлёт его раз в 45 с). */
const ONLINE_FRESHNESS_SECONDS = 120;
/** Expo принимает до 100 адресов за один запрос. */
const EXPO_BATCH = 100;

/** Понятные названия статусов заказа — те же, что видит клиент. */
const PUSH_STATUS_LABELS = [
    'pending' => 'принят в обработку',
    'approved' => 'подтверждён',
    'printing' => 'печатается',
    'ready' => 'готов к выдаче',
    'printed' => 'напечатан',
];

/**
 * Уведомление одному человеку. Молча ничего не делает, если адреса нет или
 * получатель сейчас на сайте.
 */
function push_to_user(string $userId, string $title, string $body): void
{
    if ($userId === '') {
        return;
    }
    $st = db()->prepare('SELECT id, expo_push_token, push_subscription, is_online, last_active_at
                         FROM users WHERE id = ? AND deleted_at IS NULL');
    $st->execute([$userId]);
    $user = $st->fetch();
    if (!$user || recently_online($user)) {
        return;
    }
    expo_send([$user['id'] => $user['expo_push_token']], $title, $body);
    browser_send($user, $title, $body);
}

/** Уведомление всем администраторам (новое сообщение клиента в чате). */
function push_to_admins(string $title, string $body): void
{
    $rows = db()->query("SELECT id, expo_push_token, push_subscription, is_online, last_active_at FROM users
                         WHERE role = 'admin' AND deleted_at IS NULL
                           AND (expo_push_token IS NOT NULL OR push_subscription IS NOT NULL)")->fetchAll();
    $targets = [];
    foreach ($rows as $u) {
        if (recently_online($u)) {
            continue;
        }
        $targets[$u['id']] = $u['expo_push_token'];
        browser_send($u, $title, $body);
    }
    expo_send($targets, $title, $body);
}

/**
 * Рассылка всем владельцам приложения (новая новость или акция). Админам не
 * шлём — они это и завели. «На сайте сейчас» здесь не смотрим: новость не
 * привязана к тому, что человек делает в эту минуту.
 */
function push_broadcast_clients(string $title, string $body): int
{
    // Только те, кто согласился получать новости и акции: это реклама,
    // и без согласия её слать нельзя (38-ФЗ, ст. 18). Уведомления о
    // заказе и ответы в чате идут другим путём и сюда не попадают.
    $rows = db()->query("SELECT id, expo_push_token FROM users
                         WHERE role <> 'admin' AND deleted_at IS NULL AND expo_push_token IS NOT NULL
                           AND marketing_consent = 1")->fetchAll();
    $targets = [];
    foreach ($rows as $u) {
        $targets[$u['id']] = $u['expo_push_token'];
    }
    expo_send($targets, $title, $body);
    return count($targets);
}

/**
 * Уведомление в браузер сайта. Подписки больше нет (404/410) — убираем её,
 * иначе будем стучаться в мёртвый адрес при каждом заказе.
 */
function browser_send(array $user, string $title, string $body): void
{
    $raw = $user['push_subscription'] ?? null;
    if (!is_string($raw) || $raw === '') {
        return;
    }
    $sub = json_decode($raw, true);
    if (!is_array($sub)) {
        return;
    }
    $code = webpush_send($sub, $title, $body);
    if ($code === 404 || $code === 410) {
        db()->prepare('UPDATE users SET push_subscription = NULL WHERE id = ?')->execute([$user['id']]);
    }
}

function recently_online(array $user): bool
{
    if ((int) ($user['is_online'] ?? 0) !== 1 || empty($user['last_active_at'])) {
        return false;
    }
    $last = (new DateTimeImmutable((string) $user['last_active_at'], new DateTimeZone('UTC')))->getTimestamp();
    return (time() - $last) < ONLINE_FRESHNESS_SECONDS;
}

/**
 * Отправка пачками по 100 адресов. Ответ Expo разбираем: адрес умершего
 * приложения (DeviceNotRegistered) убираем из профиля, чтобы не долбиться в
 * него при каждом заказе.
 *
 * @param array<string,string|null> $targets id пользователя → адрес телефона
 */
function expo_send(array $targets, string $title, string $body): void
{
    $targets = array_filter($targets, fn($t) => is_string($t) && $t !== '');
    if (!$targets) {
        return;
    }
    $title = mb_substr($title, 0, 100);
    $body = mb_substr($body, 0, 180);

    foreach (array_chunk($targets, EXPO_BATCH, true) as $chunk) {
        $userIds = array_keys($chunk);
        $messages = [];
        foreach ($chunk as $token) {
            $messages[] = ['to' => $token, 'title' => $title, 'body' => $body, 'sound' => 'default'];
        }

        $ch = curl_init('https://exp.host/--/api/v2/push/send');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_POSTFIELDS => json_encode($messages, JSON_UNESCAPED_UNICODE),
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code !== 200 || !is_string($raw)) {
            error_log('api/v2 push: Expo HTTP ' . $code);
            continue;
        }
        $json = json_decode($raw, true);
        // Expo может отклонить сам запрос, не дойдя до доставки (испорченный
        // адрес, неверный формат) — тогда вместо data приходит errors.
        if (isset($json['errors'])) {
            error_log('api/v2 push: Expo отклонил запрос: ' . json_encode($json['errors'], JSON_UNESCAPED_UNICODE));
            continue;
        }
        $tickets = is_array($json['data'] ?? null) ? $json['data'] : [];
        foreach ($tickets as $i => $ticket) {
            if (($ticket['status'] ?? '') !== 'error') {
                continue;
            }
            error_log('api/v2 push: ' . (string) ($ticket['message'] ?? 'ошибка доставки'));
            if (($ticket['details']['error'] ?? '') === 'DeviceNotRegistered' && isset($userIds[$i])) {
                db()->prepare('UPDATE users SET expo_push_token = NULL WHERE id = ?')->execute([$userIds[$i]]);
            }
        }
    }
}

/** Текст push-а о смене статуса заказа — тот же, что слала Cloud Function. */
function push_order_status(string $userId, string $orderId, string $status, bool $justPaid): void
{
    if ($justPaid) {
        push_to_user($userId, 'Оплата получена!', 'Заказ ' . $orderId . ' оплачен и передан в печать.');
        return;
    }
    $label = PUSH_STATUS_LABELS[$status] ?? $status;
    push_to_user($userId, 'Статус заказа изменился', 'Заказ ' . $orderId . ': ' . $label);
}
