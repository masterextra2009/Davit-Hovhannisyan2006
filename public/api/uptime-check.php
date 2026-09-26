<?php
// Called by Beget CronTab every few minutes to watch sever-18.ru.
//
// Plain "is it up" isn't enough: the 2026-07-24 incident was a stale
// pre-2026-07-19 build silently re-uploaded over the live site — the
// server answered 200 the whole time, just with wrong content. So this
// also checks for the CSP meta tag that's been present in every build
// since 2026-07-19 as a cheap proxy for "this is a current deploy, not
// an old one someone dropped back in".
//
// State is kept in a local file so we only alert once when a problem
// starts and once when it clears, instead of spamming every run.
//
// Сообщение админу шлётся изнутри сервера (api/v2/_telegram.php → notify_admin),
// а не через старый открытый api/telegram_admin_notify.php, которым мог
// писать админу от имени бота кто угодно. Пробное сообщение — только из
// консоли сервера: php uptime-check.php --test (раньше — ?test из браузера,
// то есть тоже кем угодно).

if (!defined('SITE_DIR')) {
    define('SITE_DIR', __DIR__ . '/..');
}
require __DIR__ . '/v2/_telegram.php';

$url = 'https://sever-18.ru/';
$stateFile = __DIR__ . '/.uptime-state.txt';
$isTest = PHP_SAPI === 'cli' && in_array('--test', $argv ?? [], true);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_FOLLOWLOCATION => true,
]);
$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

$isUp = ($httpCode === 200 && $body !== false);
$hasCsp = $isUp && strpos($body, 'Content-Security-Policy') !== false;

$problem = null;
if (!$isUp) {
    $problem = "Сайт sever-18.ru не отвечает (HTTP $httpCode). $curlError";
} elseif (!$hasCsp) {
    $problem = "Сайт sever-18.ru отвечает, но похоже отдаёт старую сборку (нет CSP в index.html) — возможно, файлы на хостинге снова перезаписаны вручную.";
}

function sendTelegramAlert(string $text): void {
    notify_admin(tg_escape($text));
}

if ($isTest) {
    $status = $problem ? "ПРОБЛЕМА: $problem" : "всё в порядке (HTTP $httpCode, CSP " . ($hasCsp ? 'найден' : 'НЕ найден') . ")";
    sendTelegramAlert("✅ Тестовое сообщение мониторинга sever-18.ru — интеграция настроена. Текущий статус: $status");
    echo "test alert sent; status: $status\n";
    exit;
}

$wasProblem = (@file_get_contents($stateFile) === 'problem');

if ($problem && !$wasProblem) {
    sendTelegramAlert("⚠️ $problem");
    file_put_contents($stateFile, 'problem');
} elseif (!$problem && $wasProblem) {
    sendTelegramAlert("✅ sever-18.ru снова в порядке.");
    file_put_contents($stateFile, 'ok');
} elseif (!$problem) {
    file_put_contents($stateFile, 'ok');
}

echo $problem ? "problem: $problem\n" : "ok\n";
