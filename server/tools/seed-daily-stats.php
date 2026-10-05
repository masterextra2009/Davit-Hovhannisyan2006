<?php
declare(strict_types=1);

/**
 * Разовая затравка счётчиков «Заказы» и «Оборот» по дням (05.10.2026).
 * Дальше их копит сам сервер (daily_stat_add в api/v2/_bootstrap.php), а этот
 * скрипт один раз переносит то, что ещё лежит в таблице orders. Выданные
 * заказы старше 48 часов уже удалены — их не вернуть, поэтому первые дни
 * октября будут неполными.
 *
 * Запускать НА СЕРВЕРЕ, ДО выкладки нового _bootstrap.php:
 *     php ~/sever-18.ru/public_html/api/v2/seed-daily-stats.php
 *
 * Повторный запуск ничего не трогает, если счётчики уже есть. После запуска
 * файл удалить с сервера.
 */

// Настройки ищем, поднимаясь вверх по папкам: так скрипт не зависит от того,
// куда именно его положили.
$candidates = [getenv('HOME') . '/private/sever18-db.php'];
$dir = __DIR__;
for ($i = 0; $i < 5; $i++) {
    $candidates[] = $dir . '/.sever18-private/sever18-db.php';
    $dir = dirname($dir);
}
$c = null;
foreach ($candidates as $file) {
    if (is_readable($file)) {
        $c = require $file;
        break;
    }
}
if (!is_array($c)) {
    exit("НЕ НАШЁЛ настройки базы\n");
}

$pdo = new PDO(
    "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']}",
    $c['user'],
    $c['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$exists = $pdo->query("SELECT COUNT(*) FROM stats WHERE name IN ('orders_daily', 'revenue_daily')")->fetchColumn();
if ((int) $exists > 0) {
    exit("Счётчики уже есть — ничего не делаю\n");
}

// order_date хранится в UTC, день считаем московский — как daily_stat_add.
$day = fn(string $utc) => (new DateTimeImmutable($utc, new DateTimeZone('UTC')))
    ->setTimezone(new DateTimeZone('Europe/Moscow'))->format('Y-m-d');
$orders = [];
$revenue = [];
foreach ($pdo->query('SELECT order_date, total_cost, payment_status FROM orders') as $o) {
    $d = $day((string) $o['order_date']);
    $orders[$d] = ($orders[$d] ?? 0) + 1;
    if ($o['payment_status'] === 'paid') {
        $revenue[$d] = round(($revenue[$d] ?? 0) + (float) $o['total_cost'], 2);
    }
}
$ins = $pdo->prepare('INSERT INTO stats (name, data) VALUES (?, ?)');
$ins->execute(['orders_daily', json_encode((object) $orders)]);
$ins->execute(['revenue_daily', json_encode((object) $revenue)]);
ksort($orders);
ksort($revenue);
echo "Заказы по дням: " . json_encode($orders) . "\n";
echo "Оборот по дням: " . json_encode($revenue) . "\n";
