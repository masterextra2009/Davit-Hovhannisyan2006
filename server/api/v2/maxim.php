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
//   POST call       {orderId} — админ: Максим звонит клиенту «заказ готов, когда заберёте?»
//   GET  order-calls          — админ: как прошли эти звонки (итог на карточке заказа)
//   POST call-result {orderId, state, text} — сам Максим (X-Maxim-Secret): итог звонка
//
// Итоги звонков — в .sever18-private/maxim-order-calls.json, а не в заказе:
// админка сохраняет заказ целиком и затёрла бы итог старой копией.
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

const ORDER_CALLS_KEEP_DAYS = 30;
/** Пока Максим дозванивается, повторно по тому же заказу не звоним. */
const ORDER_CALL_BUSY_SECONDS = 180;

/**
 * Итоги звонков по заказам: orderId → {at, state, result?, doneAt?}.
 * state: calling — дозванивается, answered — поговорили, noanswer — не взял,
 * error — звонок не начался. $change получает весь список и правит его под замком.
 */
function order_calls(?callable $change = null): array
{
    $file = SITE_DIR . '/../.sever18-private/maxim-order-calls.json';
    $fh = fopen($file, 'c+');
    if ($fh === false) {
        fail('Не удалось открыть журнал звонков', 500);
    }
    flock($fh, $change ? LOCK_EX : LOCK_SH);
    $calls = json_decode((string) stream_get_contents($fh), true);
    $calls = is_array($calls) ? $calls : [];
    if ($change) {
        $calls = $change($calls);
        $cutoff = time() - ORDER_CALLS_KEEP_DAYS * 86400;
        $calls = array_filter($calls, fn($c) => (strtotime((string) ($c['at'] ?? '')) ?: 0) >= $cutoff);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($calls, JSON_UNESCAPED_UNICODE));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $calls;
}

function maxim_secret_ok(): bool
{
    $secret = (string) (maxim_config()['note_secret'] ?? '');
    $given = (string) ($_SERVER['HTTP_X_MAXIM_SECRET'] ?? '');
    return $secret !== '' && hash_equals($secret, $given);
}

/** Что заказано — Максим говорит клиенту «Вы у нас заказывали …». */
function order_what(array $o): string
{
    if ($o['service_id']) {
        return 'заказ';
    }
    if (in_array($o['paper_type'], ['standard_a3', 'bw_a3'], true)) {
        return 'печать А3';
    }
    $files = json_decode((string) $o['files'], true) ?: [];
    foreach ($files as $f) {
        if (!empty($f['photoSize'])) {
            return 'печать фотографий';
        }
    }
    return $o['photo_size'] ? 'печать фотографий' : 'печать документов';
}

/** «7 октября» по Москве. */
function ru_day(string $mysqlUtc): string
{
    $months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    $d = new DateTime($mysqlUtc, new DateTimeZone('UTC'));
    $d->setTimezone(new DateTimeZone('Europe/Moscow'));
    return (int) $d->format('j') . ' ' . $months[(int) $d->format('n') - 1];
}

$action = $_GET['action'] ?? '';

if ($action === 'call-result') {
    require_method('POST');
    if (!maxim_secret_ok()) {
        fail('Нет доступа', 403);
    }
    $orderId = str_field('orderId', 64);
    $state = str_field('state', 16);
    if (!in_array($state, ['answered', 'noanswer'], true)) {
        fail('Неверный итог');
    }
    $text = str_field('text', 300);
    $found = false;
    order_calls(function (array $calls) use ($orderId, $state, $text, &$found) {
        // Пишем только по звонкам, которые начинала админка.
        if (isset($calls[$orderId])) {
            $found = true;
            $calls[$orderId] = ['at' => $calls[$orderId]['at'], 'state' => $state, 'result' => $text, 'doneAt' => gmdate('c')];
        }
        return $calls;
    });
    respond(['ok' => true, 'found' => $found]);
}

if ($action === 'note') {
    require_method('POST');
    if (!maxim_secret_ok()) {
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
    case 'call':
        require_method('POST');
        $orderId = str_field('orderId', 64);
        $st = db()->prepare('SELECT o.*, u.phone AS profile_phone FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?');
        $st->execute([$orderId]);
        $o = $st->fetch();
        if (!$o) {
            fail('Заказ не найден', 404);
        }
        if ($o['status'] !== 'ready' || (int) $o['rejected'] === 1) {
            fail('Звонить можно только по готовому заказу');
        }
        // Телефон из заказа (приложение), иначе из профиля клиента.
        $digits = preg_replace('/\D/', '', (string) ($o['user_phone'] ?: $o['profile_phone']));
        if (strlen($digits) < 10) {
            fail('У клиента нет номера телефона');
        }
        $prev = order_calls()[$orderId] ?? null;
        if ($prev && $prev['state'] === 'calling' && time() - (strtotime($prev['at']) ?: 0) < ORDER_CALL_BUSY_SECONDS) {
            fail('Максим уже звонит этому клиенту');
        }
        maxim_api('POST', '/api/outbound', [
            'number' => '7' . substr($digits, -10),
            'order' => [
                'id' => $orderId,
                'what' => order_what($o),
                'date' => ru_day((string) $o['order_date']),
                'paid' => $o['payment_status'] === 'paid',
                'name' => (string) $o['user_name'],
            ],
        ]);
        $call = ['at' => gmdate('c'), 'state' => 'calling'];
        order_calls(function (array $calls) use ($orderId, $call) {
            $calls[$orderId] = $call;
            return $calls;
        });
        respond(['ok' => true, 'call' => $call]);
    case 'order-calls':
        require_method('GET');
        $calls = order_calls();
        // Звонок, о котором Максим так и не отчитался (упал, перезапускался), не висит «звоню» вечно.
        foreach ($calls as $id => $c) {
            if ($c['state'] === 'calling' && time() - (strtotime($c['at']) ?: 0) > 15 * 60) {
                $calls[$id]['state'] = 'noanswer';
            }
        }
        respond(['ok' => true, 'calls' => (object) $calls]);
    default:
        fail('Неизвестное действие', 404);
}
