<?php
declare(strict_types=1);

// Привязка Telegram клиента к аккаунту (api/v2/telegram.php?action=…).
//
//   POST link-code   — вошедший клиент получает одноразовую ссылку на бота
//                      → {url: https://t.me/fotosever_bot?start=КОД}
//   POST webhook     — Telegram присылает сюда сообщения боту @fotosever_bot
//                      («Фото-Север», id 8854566946 — тот же, что шлёт все
//                      уведомления и работает во входе через Telegram). Не
//                      путать со старым @photosever_bot: привязка к нему не
//                      давала @fotosever_bot права писать клиенту.
//
// Что было не так со старыми api/telegram_link.php + telegram_webhook.php:
//   • связку «клиент → чат» они писали в файл telegram_chatids.json, а
//     уведомления после переезда шлёт api/v2 и ищет чат в users.telegram_chat_id
//     — поэтому у подключивших Telegram после переезда сообщения не приходили;
//   • номер клиента для кода присылал браузер без всякого входа — кто угодно
//     мог привязать свой Telegram к ЧУЖОМУ аккаунту и читать его уведомления
//     о заказах и ответы мастерской.
// Здесь код выдаётся только вошедшему — и только на свой аккаунт.
//
// Webhook принимает только запросы с секретной меткой, которую мы сами
// передали Telegram при setWebhook (заголовок X-Telegram-Bot-Api-Secret-Token).
// Метка выводится из токена бота — отдельно её хранить не нужно.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_telegram.php';

const TG_BOT_USERNAME = 'fotosever_bot';
/** Сколько живёт одноразовый код привязки. */
const TG_LINK_CODE_HOURS = 24;

switch ($_GET['action'] ?? '') {
    case 'link-code':
        require_method('POST');
        link_code(require_user());
    case 'webhook':
        require_method('POST');
        webhook();
    default:
        fail('Неизвестное действие', 404);
}

function link_code(array $user)
{
    $pdo = db();
    $pdo->prepare('DELETE FROM telegram_link_codes WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL ? HOUR')
        ->execute([TG_LINK_CODE_HOURS]);
    // Telegram пропускает в /start только A-Z a-z 0-9 _ - (до 64 знаков).
    $code = 'l' . bin2hex(random_bytes(12));
    $pdo->prepare('INSERT INTO telegram_link_codes (code, user_id, created_at) VALUES (?, ?, ?)')
        ->execute([$code, $user['id'], now_utc()]);
    respond(['ok' => true, 'url' => 'https://t.me/' . TG_BOT_USERNAME . '?start=' . $code]);
}

/** Секретная метка для setWebhook — одна и та же, пока не сменят токен бота. */
function telegram_webhook_secret(): string
{
    $token = telegram_bot_token();
    return $token === '' ? '' : hash_hmac('sha256', 'sever18-telegram-webhook', $token);
}

function webhook()
{
    $secret = telegram_webhook_secret();
    $given = (string) ($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '');
    if ($secret === '' || !hash_equals($secret, $given)) {
        fail('Нет доступа', 403);
    }

    $update = json_decode((string) file_get_contents('php://input'), true);
    $message = is_array($update) ? ($update['message'] ?? null) : null;
    $chatId = is_array($message) ? (string) ($message['chat']['id'] ?? '') : '';
    // Привязываем только личную переписку с ботом, не группы.
    if ($chatId === '' || ($message['chat']['type'] ?? '') !== 'private') {
        respond(['ok' => true]);
    }
    $text = trim((string) ($message['text'] ?? ''));
    if (strpos($text, '/start') !== 0) {
        respond(['ok' => true]);
    }

    $code = trim(substr($text, strlen('/start')));
    if ($code === '') {
        notify_user($chatId, "👋 Привет! Я бот <b>Фото-Север</b>.\n\nЧтобы получать уведомления, нажмите кнопку «Подключить Telegram» в личном кабинете на сайте:\n🌐 https://sever-18.ru");
        respond(['ok' => true]);
    }

    $pdo = db();
    $st = $pdo->prepare('SELECT user_id FROM telegram_link_codes
                          WHERE code = ? AND created_at >= UTC_TIMESTAMP(3) - INTERVAL ? HOUR');
    $st->execute([mb_substr($code, 0, 64), TG_LINK_CODE_HOURS]);
    $userId = $st->fetchColumn();
    if ($userId === false) {
        notify_user($chatId, "⚠️ Ссылка устарела или уже использована.\n\nПожалуйста, нажмите кнопку «Подключить Telegram» в личном кабинете ещё раз.");
        respond(['ok' => true]);
    }

    // Клиент сам подключил Telegram — значит, уведомления туда он и хочет.
    $username = ltrim((string) ($message['from']['username'] ?? ''), '@');
    $pdo->prepare('UPDATE users SET telegram_chat_id = ?, telegram_username = COALESCE(NULLIF(?, \'\'), telegram_username),
                          telegram_notifications_enabled = 1
                    WHERE id = ? AND deleted_at IS NULL')
        ->execute([$chatId, mb_substr($username, 0, 64), $userId]);
    $pdo->prepare('DELETE FROM telegram_link_codes WHERE user_id = ?')->execute([$userId]);

    notify_user($chatId, "✅ <b>Telegram успешно подключён!</b>\n\nТеперь вы будете получать уведомления о статусе заказов и ответы от оператора прямо сюда.\n\n📍 <b>Фото-Север</b> — Северное шоссе, 18, Раменское\n🌐 Личный кабинет: https://sever-18.ru");
    respond(['ok' => true]);
}
