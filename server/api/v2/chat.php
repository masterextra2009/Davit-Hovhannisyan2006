<?php
declare(strict_types=1);

// Чат мастерской на своём сервере (api/v2/chat.php?action=…) — вместо
// коллекции Firestore chatMessages и живой подписки onSnapshot.
//
// Живой подписки здесь нет: сайт и приложение спрашивают «что нового с такого-то
// времени» (list&since=…) раз в несколько секунд. Поэтому в ответе есть
// serverTime — его и надо прислать следующим since, чтобы не зависеть от часов
// на телефоне клиента.
//
// Клиент (Authorization: Bearer <token>):
//   GET  list   [&since=ISO]        → {messages, deletedIds, adminTyping, serverTime}
//   POST send   {message}           → {message}   пишет в свой диалог
//   POST read                       — пометить ответы админа прочитанными
// Админ:
//   GET  list   [&since=ISO][&userId=…]        — все диалоги или один
//   POST send   {userId, message}
//   POST read   {userId}
//   POST typing {userId, on}        — «Администратор печатает» у клиента
//   POST delete {id}                — одно сообщение
//   POST clear  {userId}            — весь диалог клиента
//
// Права повторяют firestore.rules: клиент видит и пишет только свой диалог,
// чужие не читает; удаляет и чистит переписку только админ.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_telegram.php';
require __DIR__ . '/_push.php';

/** Фото и голосовые пока лежат внутри сообщения как data:-ссылка (см. schema.sql). */
const MAX_MESSAGE_CHARS = 3000000;
/** Сколько сообщений отдаём за один опрос. */
const MAX_MESSAGES = 3000;
/** Сколько «печатает» считается свежим — столько же, сколько показывает приложение. */
const TYPING_SECONDS = 6;

$action = $_GET['action'] ?? '';
if ($action === 'send') {
    // Опрос (list) и «печатает» сюда не попадают — счётчик тратят только
    // настоящие сообщения.
    $RATE_LIMIT_MAX = 60;
    $RATE_LIMIT_WINDOW = 300;
    require __DIR__ . '/../rate-limit.php';
}

$user = require_user();
$isAdmin = $user['role'] === 'admin';

switch ($action) {
    case 'list':
        require_method('GET');
        list_messages($user, $isAdmin);
    case 'send':
        require_method('POST');
        send_message($user, $isAdmin);
    case 'read':
        require_method('POST');
        mark_read($user, $isAdmin);
    case 'typing':
        require_method('POST');
        require_admin($isAdmin);
        set_typing();
    case 'delete':
        require_method('POST');
        // Удалять может и клиент — но только своё сообщение, см. внутри.
        delete_message($user, $isAdmin);
    case 'clear':
        require_method('POST');
        require_admin($isAdmin);
        clear_dialog();
    default:
        fail('Неизвестное действие', 404);
}

// ─────────────────────────── Чтение ───────────────────────────

function list_messages(array $user, bool $isAdmin)
{
    $pdo = db();
    $serverTime = now_utc();

    $where = [];
    $args = [];
    if (!$isAdmin) {
        $where[] = 'user_id = ?';
        $args[] = $user['id'];
        // Удалённое клиентом у себя клиенту больше не показываем
        // (у админа оно остаётся, schema-011).
        $where[] = 'client_deleted_at IS NULL';
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
        // Запас 5 секунд — на сообщения, записанные ровно во время прошлого опроса.
        $since = (new DateTimeImmutable($since, new DateTimeZone('UTC')))
            ->modify('-5 seconds')->format('Y-m-d H:i:s.v');
        // Плюс сообщения, которые с тех пор отметили прочитанными: иначе
        // вторые галочки не доходят до собеседника, пока он не откроет чат
        // заново (schema-010-chat-read.sql).
        $where[] = '(created_at >= ? OR read_changed_at >= ?)';
        $args[] = $since;
        $args[] = $since;
    }

    // Свежие сообщения важнее старых: если их вдруг больше лимита, берём
    // последние, а отдаём в обычном порядке — от старых к новым.
    $st = $pdo->prepare(
        'SELECT * FROM (SELECT * FROM chat_messages'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY created_at DESC LIMIT ' . MAX_MESSAGES . ') t ORDER BY t.created_at ASC'
    );
    $st->execute($args);
    $messages = array_map('message_public', $st->fetchAll());

    $deletedIds = [];
    if ($since !== null) {
        $pdo->exec('DELETE FROM chat_deletions WHERE deleted_at < UTC_TIMESTAMP(3) - INTERVAL 30 DAY');
        $d = $pdo->prepare(
            'SELECT message_id FROM chat_deletions WHERE deleted_at >= ?' . ($isAdmin ? ' AND client_only = 0' : ' AND user_id = ?')
        );
        $d->execute($isAdmin ? [$since] : [$since, $user['id']]);
        $deletedIds = $d->fetchAll(PDO::FETCH_COLUMN);
    }

    // «Администратор печатает» — только клиенту и только пока свежее.
    $typing = false;
    if (!$isAdmin && $user['admin_typing_at'] !== null) {
        $typing = (new DateTimeImmutable($user['admin_typing_at'], new DateTimeZone('UTC')))
            ->getTimestamp() > time() - TYPING_SECONDS;
    }

    respond([
        'ok' => true,
        'messages' => $messages,
        'deletedIds' => $deletedIds,
        'adminTyping' => $typing,
        'serverTime' => iso($serverTime),
    ]);
}

/** Сообщение в том виде, в каком его ждут сайт и приложение (src/types.ts ChatMessage). */
function message_public(array $m): array
{
    return [
        'id' => $m['id'],
        'userId' => $m['user_id'],
        'senderId' => $m['sender_id'],
        'senderRole' => $m['sender_role'],
        'senderName' => $m['sender_name'],
        'message' => $m['message'],
        'timestamp' => iso($m['created_at']),
        'readByAdmin' => (bool) $m['read_by_admin'],
        'readByClient' => (bool) $m['read_by_client'],
        // Клиент убрал сообщение у себя — админ видит его с пометкой.
        'clientDeleted' => !empty($m['client_deleted_at']),
    ];
}

// ─────────────────────────── Отправка ───────────────────────────

function send_message(array $user, bool $isAdmin)
{
    $raw = body()['message'] ?? '';
    if (!is_string($raw)) {
        fail('Пустое сообщение');
    }
    $text = trim($raw);
    if ($text === '') {
        fail('Пустое сообщение');
    }
    if (mb_strlen($text) > MAX_MESSAGE_CHARS) {
        fail('Сообщение слишком большое', 413);
    }

    // Чей это диалог: клиент пишет только в свой, админ — в указанный.
    if ($isAdmin) {
        $dialogUserId = str_field('userId', 64);
        if ($dialogUserId === '') {
            fail('Не указан клиент');
        }
        $st = db()->prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL');
        $st->execute([$dialogUserId]);
        $client = $st->fetch();
        if (!$client) {
            fail('Клиент не найден', 404);
        }
    } else {
        $dialogUserId = $user['id'];
        $client = $user;
    }

    $id = 'c_' . new_id(20);
    $now = now_utc();
    db()->prepare(
        'INSERT INTO chat_messages (id, user_id, sender_id, sender_role, sender_name, message, created_at, read_by_admin, read_by_client)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $dialogUserId,
        $user['id'],
        $isAdmin ? 'admin' : 'client',
        $user['full_name'],
        $text,
        $now,
        $isAdmin ? 1 : 0,
        $isAdmin ? 0 : 1,
    ]);

    if ($isAdmin) {
        // Ответ ушёл — «печатает» у клиента гаснет сразу, не дожидаясь таймера.
        db()->prepare('UPDATE users SET admin_typing_at = NULL WHERE id = ?')->execute([$dialogUserId]);
        if ((int) $client['telegram_notifications_enabled'] === 1) {
            notify_user(
                $client['telegram_chat_id'],
                "💬 <b>Фото-Север</b>\n\n" . tg_escape(preview($text))
                . "\n\n<i>Ответить можно в личном кабинете: https://sever-18.ru</i>"
            );
        }
        push_to_user($dialogUserId, 'Ответ от Фото-Север', preview($text));
    } else {
        // Раньше это делала Cloud Function notifyNewChatMessage — она уезжает
        // вместе с Firebase. Уведомление уходит здесь, когда сообщение уже в базе.
        notify_admin(
            "💬 <b>Новое сообщение в чате</b>\n"
            . tg_escape($user['full_name'] !== '' ? $user['full_name'] : 'Клиент')
            . ($user['email'] ? ' (' . tg_escape((string) $user['email']) . ')' : '')
            . "\n\n" . tg_escape(preview($text))
        );
        push_to_admins(
            'Новое сообщение от ' . ($user['full_name'] !== '' ? $user['full_name'] : 'клиента'),
            preview($text),
            'chat-' . $user['id']
        );
    }

    $st = db()->prepare('SELECT * FROM chat_messages WHERE id = ?');
    $st->execute([$id]);
    respond(['ok' => true, 'message' => message_public($st->fetch())]);
}

/** Короткий текст для уведомления: вместо картинки или голосового — подпись. */
function preview(string $text): string
{
    if (str_starts_with($text, '[IMAGE]:')) {
        return '📷 Фото';
    }
    if (str_starts_with($text, '[STICKER]:')) {
        return '🖼 Стикер';
    }
    if (str_starts_with($text, '[VOICE]:')) {
        return '🎤 Голосовое сообщение';
    }
    return mb_substr($text, 0, 200);
}

// ─────────────────────────── Прочитано / печатает ───────────────────────────

function mark_read(array $user, bool $isAdmin)
{
    if ($isAdmin) {
        $dialogUserId = str_field('userId', 64);
        if ($dialogUserId === '') {
            fail('Не указан клиент');
        }
        // Админ открыл диалог — прочитаны сообщения клиента.
        db()->prepare("UPDATE chat_messages SET read_by_admin = 1, read_changed_at = ? WHERE user_id = ? AND sender_role = 'client' AND read_by_admin = 0")
            ->execute([now_utc(), $dialogUserId]);
    } else {
        db()->prepare("UPDATE chat_messages SET read_by_client = 1, read_changed_at = ? WHERE user_id = ? AND sender_role = 'admin' AND read_by_client = 0")
            ->execute([now_utc(), $user['id']]);
    }
    respond(['ok' => true]);
}

function set_typing()
{
    $dialogUserId = str_field('userId', 64);
    if ($dialogUserId === '') {
        fail('Не указан клиент');
    }
    $on = (bool) (body()['on'] ?? true);
    db()->prepare('UPDATE users SET admin_typing_at = ? WHERE id = ?')
        ->execute([$on ? now_utc() : null, $dialogUserId]);
    respond(['ok' => true]);
}

// ─────────────────────────── Удаление (только админ) ───────────────────────────

/**
 * Удаление сообщения.
 *
 * Админ может удалить любое. Клиент — только СВОЁ и только из своей
 * переписки: чужие сообщения и ответы мастерской он стирать не должен, иначе
 * из диалога можно вычистить то, о чём договаривались.
 *
 * Раньше удалять мог только админ, и в приложении кнопки «Удалить» не было
 * вовсе — Давид (23.09.2026): «отмечаю в чате сообщение и хочу удалить, нету
 * кнопки, только копировать и скачать».
 */
function delete_message(array $user, bool $isAdmin)
{
    $id = str_field('id', 64);
    if ($id === '') {
        fail('Не указано сообщение');
    }
    $pdo = db();
    $st = $pdo->prepare('SELECT user_id, sender_role FROM chat_messages WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        respond(['ok' => true]); // уже удалено — повтор не считаем ошибкой
    }
    if (!$isAdmin && ($row['user_id'] !== $user['id'] || $row['sender_role'] !== 'client')) {
        fail('Удалить можно только своё сообщение', 403);
    }
    if (!$isAdmin) {
        // Клиент удаляет только у себя: у мастерской переписка остаётся до тех
        // пор, пока её не удалит админ (Давид 25.09.2026 — на случай
        // претензии). read_changed_at — чтобы пометку увидел опрос админки.
        $now = now_utc();
        $pdo->prepare('UPDATE chat_messages SET client_deleted_at = ?, read_changed_at = ? WHERE id = ?')
            ->execute([$now, $now, $id]);
        remember_deletions([$id], $row['user_id'], true);
        respond(['ok' => true]);
    }
    $pdo->prepare('DELETE FROM chat_messages WHERE id = ?')->execute([$id]);
    remember_deletions([$id], $row['user_id']);
    respond(['ok' => true]);
}

function clear_dialog()
{
    $dialogUserId = str_field('userId', 64);
    if ($dialogUserId === '') {
        fail('Не указан клиент');
    }
    $pdo = db();
    $st = $pdo->prepare('SELECT id FROM chat_messages WHERE user_id = ?');
    $st->execute([$dialogUserId]);
    $ids = $st->fetchAll(PDO::FETCH_COLUMN);
    $pdo->prepare('DELETE FROM chat_messages WHERE user_id = ?')->execute([$dialogUserId]);
    remember_deletions($ids, $dialogUserId);
    respond(['ok' => true, 'deleted' => count($ids)]);
}

/**
 * Опрос «что нового» удалённую строку не увидит — её уже нет. Поэтому факт
 * удаления записываем отдельно, и в ответе list уходит deletedIds.
 */
function remember_deletions(array $ids, string $dialogUserId, bool $clientOnly = false): void
{
    if (!$ids) {
        return;
    }
    // Удаление админом перекрывает «скрыто клиентом»: тогда сообщение уходит у обоих.
    $st = db()->prepare('INSERT INTO chat_deletions (message_id, user_id, deleted_at, client_only) VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE deleted_at = VALUES(deleted_at), client_only = VALUES(client_only)');
    $now = now_utc();
    foreach ($ids as $id) {
        $st->execute([$id, $dialogUserId, $now, $clientOnly ? 1 : 0]);
    }
}
