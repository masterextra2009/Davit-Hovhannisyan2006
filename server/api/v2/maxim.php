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
//   POST autocall-tick        — сам Максим (X-Maxim-Secret) раз в 10 минут: авто-обзвон
//   GET/POST autocall {enabled} — админ: выключатель авто-обзвона
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

// Авто-обзвон (Давид, 11.10): через 2 суток после «Готов», Пн–Сб 11:00–18:00 по Москве,
// не взял — ещё одна попытка не раньше чем через 20 часов, и всё.
const AUTOCALL_AFTER_HOURS = 48;
const AUTOCALL_MAX_AGE_DAYS = 14;   // дольше — скорее всего забрали, а «Выдан» не нажали
const AUTOCALL_MAX_ATTEMPTS = 2;
const AUTOCALL_RETRY_HOURS = 20;
const AUTOCALL_DAILY_LIMIT = 15;
const AUTOCALL_FROM_HOUR = 11;
const AUTOCALL_TO_HOUR = 18;

function autocall_enabled(?bool $set = null): bool
{
    $file = SITE_DIR . '/../.sever18-private/maxim-autocall.json';
    if ($set !== null) {
        file_put_contents($file, json_encode(['enabled' => $set, 'changedAt' => gmdate('c')]), LOCK_EX);
        return $set;
    }
    $c = is_readable($file) ? json_decode((string) file_get_contents($file), true) : null;
    return is_array($c) && ($c['enabled'] ?? false) === true;
}

/** Номер клиента: из заказа (приложение), иначе из профиля. '' — номера нет. */
function order_phone(array $o): string
{
    $digits = preg_replace('/\D/', '', (string) ($o['user_phone'] ?: $o['profile_phone']));
    return strlen($digits) < 10 ? '' : '7' . substr($digits, -10);
}

/** Максим звонит по готовому заказу. Пишет журнал и возвращает запись о звонке. */
function start_order_call(array $o, bool $auto): array
{
    maxim_api('POST', '/api/outbound', [
        'number' => order_phone($o),
        'order' => [
            'id' => $o['id'],
            'what' => order_what($o),
            'date' => ru_day((string) $o['order_date']),
            'paid' => $o['payment_status'] === 'paid',
            'name' => (string) $o['user_name'],
        ],
    ]);
    $call = ['at' => gmdate('c'), 'state' => 'calling'];
    order_calls(function (array $calls) use ($o, $call, $auto, &$out) {
        $prev = $calls[$o['id']] ?? [];
        $attempts = (int) ($prev['autoAttempts'] ?? 0) + ($auto ? 1 : 0);
        // manual — Давид хоть раз звонил кнопкой: автомат этот заказ больше не трогает.
        $manual = !$auto || !empty($prev['manual']);
        $out = $call + ($auto ? ['auto' => true] : []) + ($manual ? ['manual' => true] : [])
            + ($attempts ? ['autoAttempts' => $attempts] : []);
        $calls[$o['id']] = $out;
        return $calls;
    });
    return $out;
}

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
            $calls[$orderId] = ['state' => $state, 'result' => $text, 'doneAt' => gmdate('c')] + $calls[$orderId];
        }
        return $calls;
    });
    respond(['ok' => true, 'found' => $found]);
}

if ($action === 'autocall-tick') {
    require_method('POST');
    if (!maxim_secret_ok()) {
        fail('Нет доступа', 403);
    }
    if (!autocall_enabled()) {
        respond(['ok' => true, 'skip' => 'выключен']);
    }
    $now = new DateTime('now', new DateTimeZone('Europe/Moscow'));
    $hour = (int) $now->format('G');
    if ((int) $now->format('N') === 7 || $hour < AUTOCALL_FROM_HOUR || $hour >= AUTOCALL_TO_HOUR) {
        respond(['ok' => true, 'skip' => 'не время']);
    }
    $calls = order_calls();
    $today = $now->format('Y-m-d');
    $todayAuto = 0;
    foreach ($calls as $c) {
        $at = strtotime((string) ($c['at'] ?? '')) ?: 0;
        if (($c['state'] ?? '') === 'calling' && time() - $at < ORDER_CALL_BUSY_SECONDS) {
            respond(['ok' => true, 'skip' => 'Максим уже звонит']); // по одному, без очереди на линии
        }
        if (!empty($c['auto']) && (new DateTime('@' . $at))->setTimezone(new DateTimeZone('Europe/Moscow'))->format('Y-m-d') === $today) {
            $todayAuto++;
        }
    }
    if ($todayAuto >= AUTOCALL_DAILY_LIMIT) {
        respond(['ok' => true, 'skip' => 'лимит на сегодня']);
    }
    $st = db()->prepare('SELECT o.*, u.phone AS profile_phone FROM orders o LEFT JOIN users u ON u.id = o.user_id'
        . ' WHERE o.status = \'ready\' AND o.rejected = 0 AND o.ready_at IS NOT NULL'
        . ' AND o.ready_at <= UTC_TIMESTAMP() - INTERVAL ' . AUTOCALL_AFTER_HOURS . ' HOUR'
        . ' AND o.ready_at >= UTC_TIMESTAMP() - INTERVAL ' . AUTOCALL_MAX_AGE_DAYS . ' DAY'
        . ' ORDER BY o.ready_at ASC LIMIT 200');
    $st->execute();
    foreach ($st->fetchAll() as $o) {
        if (order_phone($o) === '') {
            continue;
        }
        $c = $calls[$o['id']] ?? null;
        if ($c) {
            // Давид уже звонил кнопкой (Давид, 11.10: «если я уже нажал позвонить, он не
            // набирал повторно») или уже поговорили — больше не беспокоим.
            if (!empty($c['manual']) || empty($c['auto']) || ($c['state'] ?? '') === 'answered') {
                continue;
            }
            if ((int) ($c['autoAttempts'] ?? 0) >= AUTOCALL_MAX_ATTEMPTS) {
                continue;
            }
            if (time() - (strtotime((string) ($c['at'] ?? '')) ?: 0) < AUTOCALL_RETRY_HOURS * 3600) {
                continue;
            }
        }
        $call = start_order_call($o, true);
        respond(['ok' => true, 'called' => $o['id'], 'call' => $call]);
    }
    respond(['ok' => true, 'skip' => 'некому звонить']);
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
        if (order_phone($o) === '') {
            fail('У клиента нет номера телефона');
        }
        $prev = order_calls()[$orderId] ?? null;
        if ($prev && $prev['state'] === 'calling' && time() - (strtotime($prev['at']) ?: 0) < ORDER_CALL_BUSY_SECONDS) {
            fail('Максим уже звонит этому клиенту');
        }
        respond(['ok' => true, 'call' => start_order_call($o, false)]);
    case 'autocall':
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            respond(['ok' => true, 'enabled' => autocall_enabled((body()['enabled'] ?? false) === true)]);
        }
        respond(['ok' => true, 'enabled' => autocall_enabled()]);
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
