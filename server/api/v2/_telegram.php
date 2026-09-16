<?php
declare(strict_types=1);

// Сообщения от бота @photosever_bot изнутри сервера. Открытой ссылки, через
// которую кто угодно мог бы написать админу от имени бота (как старый
// api/telegram_admin_notify.php), здесь нет.
//
// Токен бота — из api/config.php, id чата админа — из
// .sever18-private/notify.php. В код не копируются.

function telegram_bot_token(): string
{
    static $token = null;
    if ($token === null) {
        $file = SITE_DIR . '/api/config.php';
        if (!defined('TELEGRAM_BOT_TOKEN') && is_readable($file)) {
            ob_start();
            require_once $file;
            ob_end_clean();
        }
        $token = defined('TELEGRAM_BOT_TOKEN') ? (string) TELEGRAM_BOT_TOKEN : (string) getenv('TELEGRAM_BOT_TOKEN');
    }
    return $token;
}

/** Сообщение админу мастерской (HTML-разметка Telegram). */
function notify_admin(string $html): bool
{
    static $chat = null;
    if ($chat === null) {
        $file = SITE_DIR . '/../.sever18-private/notify.php';
        $cfg = is_readable($file) ? (require $file) : [];
        $chat = is_array($cfg) ? (string) ($cfg['admin_chat_id'] ?? '') : '';
    }
    $token = telegram_bot_token();
    if ($chat === '' || $token === '') {
        error_log('api/v2 notify: telegram is not configured');
        return false;
    }
    $ch = curl_init('https://api.telegram.org/bot' . $token . '/sendMessage');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'chat_id' => $chat,
            'text' => $html,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ], JSON_UNESCAPED_UNICODE),
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200) {
        error_log('api/v2 notify: telegram HTTP ' . $code);
    }
    return $code === 200;
}

/**
 * Сообщение клиенту в Telegram — если он привязал бота и не выключил
 * уведомления. Раньше это делал открытый api/telegram_notify.php, которым мог
 * воспользоваться кто угодно; здесь адрес берётся из базы, а не из запроса.
 */
function notify_user(?string $chatId, string $html): bool
{
    $chatId = trim((string) $chatId);
    $token = telegram_bot_token();
    if ($chatId === '' || $token === '') {
        return false;
    }
    $ch = curl_init('https://api.telegram.org/bot' . $token . '/sendMessage');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'chat_id' => $chatId,
            'text' => $html,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ], JSON_UNESCAPED_UNICODE),
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200) {
        error_log('api/v2 notify_user: telegram HTTP ' . $code);
    }
    return $code === 200;
}

function tg_escape(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
