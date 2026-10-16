<?php
declare(strict_types=1);

// NEXUS (dash.sever-18.ru, пульт Давида) берёт отсюда цифры по заказам для раздела «Сайт».
// Только количества и суммы — ни имён, ни телефонов клиентов. Пускаем по секрету в
// заголовке X-Nexus-Secret (лежит в .sever18-private/nexus.php, в репозиторий не попадает).
//
//   GET stats — заказы сегодня/7 дней (и неделей раньше), выручка, ждут оплаты/выдачи,
//               заказы по дням за 14 дней, что заказывают за 30 дней.
// Дни считаем по Москве (UTC+3, без перехода на летнее время); отклонённые заказы не считаем.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_doc_photo_catalog.php';

function nexus_secret_ok(): bool
{
    $file = SITE_DIR . '/../.sever18-private/nexus.php';
    $cfg = is_readable($file) ? (require $file) : [];
    $secret = is_array($cfg) ? (string) ($cfg['secret'] ?? '') : '';
    $given = (string) ($_SERVER['HTTP_X_NEXUS_SECRET'] ?? '');
    return $secret !== '' && hash_equals($secret, $given);
}

/** К какой группе отнести заказ в «Что заказывают». */
function nexus_kind(array $o, array $services): string
{
    if ($o['service_id'] === DOC_PHOTO_SERVICE_ID) {
        return 'Фото на документы';
    }
    if ($o['service_id']) {
        return $services[$o['service_id']] ?? 'Услуги';
    }
    if (in_array($o['paper_type'], ['standard_a3', 'bw_a3'], true)) {
        return 'Печать А3';
    }
    foreach (json_decode((string) $o['files'], true) ?: [] as $f) {
        if (!empty($f['photoSize'])) {
            return 'Печать фото';
        }
    }
    return $o['photo_size'] ? 'Печать фото' : 'Документы';
}

if (!nexus_secret_ok()) {
    fail('Нет доступа', 403);
}
if (($_GET['action'] ?? '') !== 'stats') {
    fail('Неизвестное действие', 404);
}

$msk = new DateTimeZone('Europe/Moscow');
$today = new DateTimeImmutable('today', $msk);
$from = $today->modify('-29 days')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');

$pdo = db();
$services = $pdo->query('SELECT id, title FROM services')->fetchAll(PDO::FETCH_KEY_PAIR);
$st = $pdo->prepare('SELECT order_date, status, payment_status, total_cost, service_id, paper_type, photo_size, files
                     FROM orders WHERE rejected = 0 AND order_date >= ?');
$st->execute([$from]);

$days = [];
for ($i = 13; $i >= 0; $i--) {
    $days[$today->modify("-$i days")->format('Y-m-d')] = 0;
}
$todayKey = $today->format('Y-m-d');
$weekFrom = $today->modify('-6 days')->format('Y-m-d');
$prevFrom = $today->modify('-13 days')->format('Y-m-d');
$out = ['today' => 0, 'week' => 0, 'prevWeek' => 0, 'revenueToday' => 0.0, 'revenueWeek' => 0.0, 'revenuePrevWeek' => 0.0];
$kinds = [];
foreach ($st as $o) {
    $day = (new DateTimeImmutable($o['order_date'], new DateTimeZone('UTC')))->setTimezone($msk)->format('Y-m-d');
    $paid = $o['payment_status'] === 'paid' || $o['status'] === 'printed';
    $sum = $paid ? (float) $o['total_cost'] : 0.0;
    if (isset($days[$day])) {
        $days[$day]++;
    }
    if ($day === $todayKey) {
        $out['today']++;
        $out['revenueToday'] += $sum;
    }
    if ($day >= $weekFrom) {
        $out['week']++;
        $out['revenueWeek'] += $sum;
    } elseif ($day >= $prevFrom) {
        $out['prevWeek']++;
        $out['revenuePrevWeek'] += $sum;
    }
    $kind = nexus_kind($o, $services);
    $kinds[$kind] = ($kinds[$kind] ?? 0) + 1;
}
arsort($kinds);

// «Ждут» — за всё время: не оплачены (и ещё не выданы) / готовы, но не забраны.
$wait = $pdo->query("SELECT
        SUM(payment_status <> 'paid' AND status <> 'printed') AS unpaid,
        SUM(status = 'ready') AS ready
    FROM orders WHERE rejected = 0")->fetch();

foreach (['revenueToday', 'revenueWeek', 'revenuePrevWeek'] as $k) {
    $out[$k] = round($out[$k], 2);
}
respond(['ok' => true] + $out + [
    'unpaid' => (int) ($wait['unpaid'] ?? 0),
    'ready' => (int) ($wait['ready'] ?? 0),
    'days' => array_map(fn($d, $n) => ['day' => $d, 'orders' => $n], array_keys($days), $days),
    'kinds' => array_map(fn($k, $n) => ['name' => $k, 'orders' => $n], array_keys($kinds), $kinds),
    'at' => time(),
]);
