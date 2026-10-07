<?php
declare(strict_types=1);

// Максим — ИИ-администратор, который отвечает на звонки салона (живёт на своём
// сервере, см. «D:\Рабочие проекты\05 ИИ-администратор»). Этот файл — мост между
// ним и админкой сайта (api/v2/maxim.php?action=…):
//
//   POST note       {text}   — сам Максим: записка Давиду в Telegram (@photosever_bot).
//                              Пускаем по секрету в заголовке X-Maxim-Secret.
//   GET  status              — админ: на связи ли Максим, звонки за сегодня
//   GET  calls&month=ГГГГ-ММ — админ: журнал звонков с расшифровками
//   GET  costs&month=ГГГГ-ММ — админ: расходы за месяц и ближайшие оплаты
//   GET  character           — админ: характер и цены Максима (текст)
//   POST character  {text}   — админ: сохранить характер
//   GET  memory              — админ: что Максим помнит о звонивших
//   POST memory-forget {number} — админ: забыть человека
//
// Адрес, ключ и отпечаток сертификата сервера Максима — в
// .sever18-private/maxim.php (в репозиторий не попадают: он публичный).

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_telegram.php';

function maxim_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $file = SITE_DIR . '/../.sever18-private/maxim.php';
        $cfg = is_readable($file) ? (require $file) : [];
        if (!is_array($cfg)) {
            $cfg = [];
        }
    }
    return $cfg;
}

/** Запрос к серверу Максима. Сертификат у него свой, проверяем по отпечатку ключа. */
function maxim_api(string $method, string $path, ?array $body = null): array
{
    $cfg = maxim_config();
    if (empty($cfg['url']) || empty($cfg['token']) || empty($cfg['pin'])) {
        fail('Максим ещё не подключён к сайту', 503);
    }
    $ch = curl_init(rtrim((string) $cfg['url'], '/') . $path);
    $headers = ['Authorization: Bearer ' . $cfg['token']];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        // Сертификат самоподписанный — вместо цепочки доверия сверяем
        // отпечаток открытого ключа: чужой сервер с ним не совпадёт.
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_PINNEDPUBLICKEY => (string) $cfg['pin'],
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        error_log('maxim.php: ' . $err);
        fail('Сервер Максима не отвечает', 502);
    }
    $data = json_decode((string) $raw, true);
    if (!is_array($data) || $code >= 400 || ($data['ok'] ?? false) !== true) {
        fail(is_array($data) && !empty($data['error']) ? (string) $data['error'] : 'Ошибка сервера Максима', $code >= 400 && $code < 500 ? $code : 502);
    }
    return $data;
}

$action = $_GET['action'] ?? '';

if ($action === 'note') {
    require_method('POST');
    $secret = (string) (maxim_config()['note_secret'] ?? '');
    $given = (string) ($_SERVER['HTTP_X_MAXIM_SECRET'] ?? '');
    if ($secret === '' || !hash_equals($secret, $given)) {
        fail('Нет доступа', 403);
    }
    $text = mb_substr(trim(str_field('text', 4000)), 0, 3500);
    if ($text === '') {
        fail('Пустая записка');
    }
    $sent = notify_admin("📞 <b>Максим</b>\n" . tg_escape($text));
    respond(['ok' => true, 'sent' => $sent]);
}

$user = require_user();
require_admin($user['role'] === 'admin');

switch ($action) {
    case 'status':
        require_method('GET');
        respond(maxim_api('GET', '/api/status'));
    case 'calls':
        require_method('GET');
        $month = (string) ($_GET['month'] ?? gmdate('Y-m'));
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            fail('Неверный месяц');
        }
        respond(maxim_api('GET', '/api/calls?month=' . $month));
    case 'costs':
        require_method('GET');
        $month = (string) ($_GET['month'] ?? gmdate('Y-m'));
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
            fail('Неверный месяц');
        }
        respond(maxim_api('GET', '/api/costs?month=' . $month));
    case 'character':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $text = (string) (body()['text'] ?? '');
            if (mb_strlen($text) > 60000) {
                fail('Слишком длинный текст');
            }
            respond(maxim_api('POST', '/api/character', ['text' => $text]));
        }
        respond(maxim_api('GET', '/api/character'));
    case 'memory':
        require_method('GET');
        respond(maxim_api('GET', '/api/memory'));
    case 'memory-forget':
        require_method('POST');
        respond(maxim_api('POST', '/api/memory', ['number' => str_field('number', 32)]));
    default:
        fail('Неизвестное действие', 404);
}
