<?php
declare(strict_types=1);

// NEXUS (dash.sever-18.ru, пульт Давида) берёт отсюда цифры по заказам для раздела «Сайт».
// Только количества и суммы — ни имён, ни телефонов клиентов. Пускаем по секрету в
// заголовке X-Nexus-Secret (лежит в .sever18-private/nexus.php, в репозиторий не попадает).
//
//   GET stats — заказы и выручка сегодня/7 дней (и неделей раньше), посетители, ждут оплаты/выдачи,
//               заказы/выручка/посетители по дням за 14 дней, что заказывают сейчас.
// Заказы и выручку по дням берём из счётчиков stats (orders_daily, revenue_daily) — выданные
// заказы удаляются из orders через 48 часов, по самой таблице выходило бы занижено.
// Посетители — stats/visits (misc.php?action=visit, раз в сеанс браузера, без cookie).
// «Что заказывают» и «Ждут» — по таблице orders, то есть заказы в работе и выданные за 2 дня.
// Дни — московские; отклонённые заказы не считаем.

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

/** Счётчик из stats: {"ГГГГ-ММ-ДД": число} (у visits — внутри history). */
function nexus_counter(PDO $pdo, string $name): array
{
    $st = $pdo->prepare('SELECT data FROM stats WHERE name = ?');
    $st->execute([$name]);
    $data = json_decode((string) ($st->fetchColumn() ?: '{}'), true) ?: [];
    $days = $name === 'visits' ? ($data['history'] ?? []) : $data;
    return is_array($days) ? $days : [];
}

$orders = nexus_counter($pdo, 'orders_daily');
$revenue = nexus_counter($pdo, 'revenue_daily');
$visits = nexus_counter($pdo, 'visits');
$out = ['today' => 0, 'week' => 0, 'prevWeek' => 0, 'revenueToday' => 0.0, 'revenueWeek' => 0.0, 'revenuePrevWeek' => 0.0,
        'visitsToday' => 0, 'visitsWeek' => 0, 'visitsPrevWeek' => 0];
$days = [];
for ($i = 13; $i >= 0; $i--) {
    $day = $today->modify("-$i days")->format('Y-m-d');
    $o = max(0, (int) round((float) ($orders[$day] ?? 0)));
    $r = (float) ($revenue[$day] ?? 0);
    $v = (int) ($visits[$day] ?? 0);
    $days[] = ['day' => $day, 'orders' => $o, 'revenue' => round($r, 2), 'visits' => $v];
    if ($i === 0) {
        $out['today'] = $o;
        $out['revenueToday'] = $r;
        $out['visitsToday'] = $v;
    }
    $period = $i <= 6 ? 'Week' : 'PrevWeek';
    $out[$i <= 6 ? 'week' : 'prevWeek'] += $o;
    $out['revenue' . $period] += $r;
    $out['visits' . $period] += $v;
}

$kinds = [];
foreach ($st as $o) {
    $kind = nexus_kind($o, $services);
    $kinds[$kind] = ($kinds[$kind] ?? 0) + 1;
}
arsort($kinds);

// «Ждут» — за те же 30 дней (старые брошенные заказы не в счёт): не оплачены (и ещё не выданы) / готовы, но не забраны.
$wait = $pdo->prepare("SELECT
        SUM(payment_status <> 'paid' AND status <> 'printed') AS unpaid,
        SUM(status = 'ready') AS ready
    FROM orders WHERE rejected = 0 AND order_date >= ?");
$wait->execute([$from]);
$wait = $wait->fetch();

foreach (['revenueToday', 'revenueWeek', 'revenuePrevWeek'] as $k) {
    $out[$k] = round($out[$k], 2);
}
respond(['ok' => true] + $out + [
    'unpaid' => (int) ($wait['unpaid'] ?? 0),
    'ready' => (int) ($wait['ready'] ?? 0),
    'days' => $days,
    'kinds' => array_map(fn($k, $n) => ['name' => $k, 'orders' => $n], array_keys($kinds), $kinds),
    'at' => time(),
]);
