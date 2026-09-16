<?php
declare(strict_types=1);

// Уведомления (колокольчик) на своём сервере — вместо коллекции Firestore
// notifications и живой подписки onSnapshot.
//
// Как и чат, работает опросом: list&since=… отдаёт только то, что появилось
// с прошлого раза, плюс своё время сервера для следующего опроса.
//
// Клиент (Authorization: Bearer <token>):
//   GET  list   [&since=ISO]        → {notifications, deletedIds, serverTime}
//   POST create {title, body, type} → {notification}   себе
//   POST read   [{id}]              — одно или все свои
//   POST delete {id}
// Админ:
//   GET  list   [&since=ISO][&userId=…]  — свои или указанного клиента
//   POST create {userId, title, body, type}
//   POST read / delete                   — любые
//
// Права повторяют firestore.rules: клиент видит, заводит и удаляет только
// свои уведомления.

require __DIR__ . '/_bootstrap.php';

const NOTIFICATION_TYPES = ['order_status', 'chat', 'payment', 'profile'];
/** Журнал активности живёт двое суток — столько же, сколько показывают сайт и приложение. */
const NOTIFICATION_HOURS = 48;
const MAX_NOTIFICATIONS = 500;

$action = $_GET['action'] ?? '';
if ($action === 'create') {
    $RATE_LIMIT_MAX = 120;
    $RATE_LIMIT_WINDOW = 300;
    require __DIR__ . '/../rate-limit.php';
}

$user = require_user();
$isAdmin = $user['role'] === 'admin';

switch ($action) {
    case 'list':
        require_method('GET');
        list_notifications($user, $isAdmin);
    case 'create':
        require_method('POST');
        create_notification($user, $isAdmin);
    case 'read':
        require_method('POST');
        mark_read($user, $isAdmin);
    case 'delete':
        require_method('POST');
        delete_notification($user, $isAdmin);
    default:
        fail('Неизвестное действие', 404);
}

// ─────────────────────────── Чтение ───────────────────────────

function list_notifications(array $user, bool $isAdmin)
{
    $pdo = db();
    $serverTime = now_utc();

    // Старые уведомления убираем прямо здесь — раньше это делал браузер
    // клиента по таймеру, и если он давно не заходил, они копились в базе.
    $pdo->exec('DELETE FROM notifications WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL ' . NOTIFICATION_HOURS . ' HOUR');

    $where = [];
    $args = [];
    if (!$isAdmin) {
        $where[] = 'user_id = ?';
        $args[] = $user['id'];
    } elseif (($_GET['userId'] ?? '') !== '') {
        $where[] = 'user_id = ?';
        $args[] = (string) $_GET['userId'];
    }

    $since = null;
    if (($_GET['since'] ?? '') !== '') {
        $since = parse_iso((string) $_GET['since']);
        if ($since === null) {
            fail('Неверный параметр since');
        }
        // Запас 5 секунд — на записи, сделанные ровно во время прошлого опроса.
        $since = (new DateTimeImmutable($since, new DateTimeZone('UTC')))
            ->modify('-5 seconds')->format('Y-m-d H:i:s.v');
        $where[] = 'created_at >= ?';
        $args[] = $since;
    }

    $st = $pdo->prepare(
        'SELECT * FROM notifications'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY created_at DESC LIMIT ' . MAX_NOTIFICATIONS
    );
    $st->execute($args);
    $notifications = array_map('notification_public', $st->fetchAll());

    $deletedIds = [];
    if ($since !== null) {
        $pdo->exec('DELETE FROM notification_deletions WHERE deleted_at < UTC_TIMESTAMP(3) - INTERVAL 30 DAY');
        $d = $pdo->prepare(
            'SELECT notification_id FROM notification_deletions WHERE deleted_at >= ?' . ($isAdmin ? '' : ' AND user_id = ?')
        );
        $d->execute($isAdmin ? [$since] : [$since, $user['id']]);
        $deletedIds = $d->fetchAll(PDO::FETCH_COLUMN);
    }

    respond([
        'ok' => true,
        'notifications' => $notifications,
        'deletedIds' => $deletedIds,
        'serverTime' => iso($serverTime),
    ]);
}

/** Уведомление в том виде, в каком его ждут сайт и приложение (src/types.ts Notification). */
function notification_public(array $n): array
{
    return [
        'id' => $n['id'],
        'userId' => $n['user_id'],
        'title' => $n['title'],
        'body' => $n['body'],
        'timestamp' => iso($n['created_at']),
        'read' => (bool) $n['is_read'],
        'type' => $n['type'],
    ];
}

// ─────────────────────────── Запись ───────────────────────────

function create_notification(array $user, bool $isAdmin)
{
    $title = str_field('title', 255);
    $body = str_field('body', 2000);
    $type = str_field('type', 32);
    if ($title === '') {
        fail('Пустой заголовок');
    }
    if (!in_array($type, NOTIFICATION_TYPES, true)) {
        fail('Неизвестный вид уведомления');
    }

    // Клиент заводит уведомление только себе, админ — кому угодно.
    $targetId = $user['id'];
    if ($isAdmin && str_field('userId', 64) !== '') {
        $targetId = str_field('userId', 64);
        $st = db()->prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL');
        $st->execute([$targetId]);
        if (!$st->fetch()) {
            fail('Клиент не найден', 404);
        }
    }

    $id = 'n_' . new_id(20);
    $now = now_utc();
    db()->prepare('INSERT INTO notifications (id, user_id, title, body, type, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
        ->execute([$id, $targetId, $title, $body, $type, $now]);

    $st = db()->prepare('SELECT * FROM notifications WHERE id = ?');
    $st->execute([$id]);
    respond(['ok' => true, 'notification' => notification_public($st->fetch())]);
}

function mark_read(array $user, bool $isAdmin)
{
    $id = str_field('id', 64);
    if ($id === '') {
        // Открыли колокольчик — прочитаны все свои.
        db()->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
            ->execute([$user['id']]);
        respond(['ok' => true]);
    }
    $row = load_own($id, $user, $isAdmin);
    if ($row !== null) {
        db()->prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')->execute([$id]);
    }
    respond(['ok' => true]);
}

function delete_notification(array $user, bool $isAdmin)
{
    $id = str_field('id', 64);
    if ($id === '') {
        fail('Не указано уведомление');
    }
    $row = load_own($id, $user, $isAdmin);
    if ($row === null) {
        respond(['ok' => true]); // уже удалено — повтор не считаем ошибкой
    }
    $pdo = db();
    $pdo->prepare('DELETE FROM notifications WHERE id = ?')->execute([$id]);
    // Чтобы опрос «что нового» узнал об удалении — см. schema-005-notifications.sql.
    $pdo->prepare('INSERT INTO notification_deletions (notification_id, user_id, deleted_at) VALUES (?, ?, ?)
                   ON DUPLICATE KEY UPDATE deleted_at = VALUES(deleted_at)')
        ->execute([$id, $row['user_id'], now_utc()]);
    respond(['ok' => true]);
}

/** Уведомление, если оно существует и доступно этому пользователю; иначе null или 403. */
function load_own(string $id, array $user, bool $isAdmin): ?array
{
    $st = db()->prepare('SELECT * FROM notifications WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        return null;
    }
    if (!$isAdmin && $row['user_id'] !== $user['id']) {
        fail('Нет доступа', 403);
    }
    return $row;
}
