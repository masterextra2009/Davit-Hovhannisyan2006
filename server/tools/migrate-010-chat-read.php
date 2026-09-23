<?php
declare(strict_types=1);

/**
 * Разовая докладка к базе: когда сообщение чата отметили прочитанным.
 * Что именно добавляется — см. server/schema-010-chat-read.sql.
 *
 * Запускать НА СЕРВЕРЕ, из папки api/v2:
 *     php ~/sever-18.ru/public_html/api/v2/migrate-010-chat-read.php
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
foreach ($pdo->query('SHOW COLUMNS FROM chat_messages') as $row) {
    $have[$row['Field']] = true;
}

if (isset($have['read_changed_at'])) {
    exit("Столбец уже на месте — ничего не делаю.\n");
}

$pdo->exec('ALTER TABLE chat_messages ADD COLUMN read_changed_at DATETIME(3) NULL AFTER read_by_client, ADD KEY ix_chat_read_changed (read_changed_at)');
echo "Готово: добавлен столбец read_changed_at\n";

foreach ($pdo->query('SHOW COLUMNS FROM chat_messages') as $row) {
    echo '  ' . $row['Field'] . ' ' . $row['Type'] . "\n";
}
