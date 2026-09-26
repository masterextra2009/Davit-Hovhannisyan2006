<?php
declare(strict_types=1);

// Напоминание «заказ готов и ждёт вас» (запускается по расписанию, не из браузера).
//
// Раньше это делал api/order-reminder-cron.php, но он читал заказы из
// Firestore — после переезда там новых заказов нет, и напоминания не уходили.
//
// Правило то же: заказ в статусе «Готов к выдаче» дольше 2 суток и
// напоминания по нему ещё не было → клиенту:
//   • уведомление в личном кабинете (и в приложении, в «Уведомлениях»);
//   • push на телефон, если стоит приложение;
//   • сообщение в Telegram, если подключён и не выключен.
// Отметка ready_reminder_sent = 1 — повторно по тому же заказу не шлём
// (снова станет «готов» — orders.php сбросит отметку).
//
// Заказы, готовые дольше 14 дней, не трогаем: скорее всего, их давно забрали,
// а статус «Выдан» просто забыли поставить — напоминать такому клиенту странно.
//
// Запуск (Beget, раз в сутки, например в 10:00):
//   /usr/local/php-cgi/8.2/bin/php ~/sever-18.ru/public_html/api/v2/order-reminder.php
// Пробный запуск — только показать, кому ушло бы напоминание:
//   … order-reminder.php --dry
//
// Через веб не работает намеренно: снаружи этот файл только отвечает 403.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Только по расписанию'], JSON_UNESCAPED_UNICODE);
    exit;
}

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_webpush.php';
require __DIR__ . '/_push.php';
require __DIR__ . '/_telegram.php';

define('DRY_RUN', in_array('--dry', $argv ?? [], true));

/** Через сколько дней после «готов» напоминаем. */
const REMIND_AFTER_DAYS = 2;
/** Старше этого — не напоминаем (см. выше). */
const REMIND_MAX_DAYS = 14;

$pdo = db();
$st = $pdo->prepare(
    "SELECT o.id, o.user_id, o.ready_at, u.full_name, u.telegram_chat_id, u.telegram_notifications_enabled
       FROM orders o JOIN users u ON u.id = o.user_id
      WHERE o.status = 'ready' AND o.ready_reminder_sent = 0 AND o.rejected = 0
        AND u.deleted_at IS NULL
        AND o.ready_at <= UTC_TIMESTAMP(3) - INTERVAL ? DAY
        AND o.ready_at >= UTC_TIMESTAMP(3) - INTERVAL ? DAY"
);
$st->execute([REMIND_AFTER_DAYS, REMIND_MAX_DAYS]);

$sent = 0;
foreach ($st->fetchAll() as $o) {
    $id = (string) $o['id'];
    if (DRY_RUN) {
        echo "напомнили бы: $id · {$o['full_name']} · готов с {$o['ready_at']} UTC"
            . ((int) $o['telegram_notifications_enabled'] === 1 && $o['telegram_chat_id'] ? ' · +Telegram' : '') . "\n";
        continue;
    }

    // Сначала отметка: если отправка ниже упадёт на полпути, лучше не
    // напомнить, чем напоминать каждый день.
    $pdo->prepare('UPDATE orders SET ready_reminder_sent = 1 WHERE id = ?')->execute([$id]);

    $body = 'Заказ №' . $id . ' готов уже больше 2 дней — не забудьте забрать. Северное шоссе, 18, Раменское.';
    // Постоянный id — повторный запуск не создаст второе уведомление.
    $pdo->prepare('INSERT IGNORE INTO notifications (id, user_id, title, body, type, is_read, created_at)
                   VALUES (?, ?, ?, ?, ?, 0, ?)')
        ->execute(['notif_reminder_' . $id, $o['user_id'], 'Заказ ждёт вас', $body, 'order_status', now_utc()]);
    push_to_user((string) $o['user_id'], 'Заказ ждёт вас', $body);
    if ((int) $o['telegram_notifications_enabled'] === 1) {
        notify_user($o['telegram_chat_id'], "🖨 <b>Фото-Север</b>\n\nВаш заказ №" . tg_escape($id)
            . ' готов и ждёт вас! Адрес: Северное шоссе, 18, Раменское.');
    }
    $sent++;
}

echo DRY_RUN ? "(пробный запуск — ничего не отправлено)\n" : "напоминаний отправлено: $sent\n";
