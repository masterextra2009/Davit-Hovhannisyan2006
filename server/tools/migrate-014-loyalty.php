<?php
declare(strict_types=1);

/**
 * Разовая докладка к базе: скидка за уровень клиента в заказе.
 * Что именно добавляется — см. server/schema-014-loyalty.sql.
 *
 * Запускать НА СЕРВЕРЕ, из папки api/v2:
 *     php ~/sever-18.ru/public_html/api/v2/migrate-014-loyalty.php
 *
 * Можно запускать повторно: если столбцы уже есть, скрипт просто скажет об
 * этом и ничего не тронет. После успешной докладки файл удалить с сервера —
 * ему там больше делать нечего.
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

$have = [];
foreach ($pdo->query('SHOW COLUMNS FROM orders') as $row) {
    $have[$row['Field']] = true;
}

if (isset($have['loyalty_discount'])) {
    exit("Столбец уже на месте — ничего не делаю.\n");
}

$pdo->exec('ALTER TABLE orders ADD COLUMN loyalty_discount TINYINT UNSIGNED NULL AFTER promo_discount');
echo "Готово: добавлен столбец loyalty_discount\n";

foreach ($pdo->query("SHOW COLUMNS FROM orders LIKE '%discount%'") as $row) {
    echo '  ' . $row['Field'] . ' ' . $row['Type'] . "\n";
}
