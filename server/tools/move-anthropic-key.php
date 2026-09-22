<?php
declare(strict_types=1);

/**
 * Разовый скрипт: убрать ключ Anthropic из файлов сайта.
 *
 * Ключ от console.anthropic.com лежал открытым текстом прямо в файлах папки
 * api/ — в трёх сразу. PHP наружу исходник не отдаёт, но хранить ключ рядом с
 * кодом сайта всё равно нельзя: он попадает в любой просмотр файлов, в копии,
 * в пересылку. Настройки базы у нас давно лежат в закрытой папке выше
 * public_html — ключу туда же.
 *
 * Что делает:
 *   1. находит ключ в файлах api/ и кладёт его в
 *      ~/sever-18.ru/.sever18-private/anthropic.json (права 600);
 *   2. в каждом файле заменяет сам ключ на чтение из этой папки;
 *   3. рядом с каждым правленым файлом оставляет копию .bak-key.
 *
 * Запускать НА СЕРВЕРЕ: php8.3 <путь к этому файлу>. Повторный запуск
 * безопасен: если ключей в файлах не осталось, скрипт ничего не делает.
 * После проверки скрипт и копии .bak-key удалить.
 */

$apiDir = dirname(__DIR__, 2) . '/public_html/api';
if (!is_dir($apiDir)) {
    $apiDir = getenv('HOME') . '/sever-18.ru/public_html/api';
}
$privateDir = dirname($apiDir, 2) . '/.sever18-private';

if (!is_dir($apiDir)) {
    exit("НЕ НАШЁЛ папку api\n");
}
if (!is_dir($privateDir)) {
    exit("НЕ НАШЁЛ закрытую папку $privateDir\n");
}

// Чем заменяем ключ в коде. Одно выражение, без require: файл может быть
// подключён не один раз, а require во второй раз вернул бы true вместо ключа.
$replacement = "(json_decode((string) @file_get_contents(__DIR__ . '/../../.sever18-private/anthropic.json'), true)['key'] ?? '')";

$files = glob($apiDir . '/*.php') ?: [];
$found = '';
$touched = [];

foreach ($files as $file) {
    $code = (string) file_get_contents($file);
    if (!preg_match('/sk-ant-api03[A-Za-z0-9_\-]+/', $code, $m)) {
        continue;
    }
    if ($found === '') {
        $found = $m[0];
    } elseif ($found !== $m[0]) {
        echo "ВНИМАНИЕ: в файлах разные ключи, дальше беру первый\n";
    }
    // Вместе с кавычками — иначе в коде останется пустая пара кавычек.
    $fixed = preg_replace("/'sk-ant-api03[A-Za-z0-9_\\-]+'/", $replacement, $code);
    $fixed = preg_replace('/"sk-ant-api03[A-Za-z0-9_\\-]+"/', $replacement, (string) $fixed);
    if ($fixed === null || $fixed === $code) {
        echo "НЕ СМОГ поправить: " . basename($file) . " (ключ записан непривычно)\n";
        continue;
    }
    copy($file, $file . '.bak-key');
    file_put_contents($file, $fixed);
    $touched[] = basename($file);
}

if ($found === '') {
    exit("Ключей в файлах api/ не осталось — делать нечего.\n");
}

$target = $privateDir . '/anthropic.json';
file_put_contents($target, json_encode(['key' => $found], JSON_UNESCAPED_SLASHES) . "\n");
chmod($target, 0600);

echo "Ключ вынесен в " . $target . "\n";
echo "Поправлены файлы: " . implode(', ', $touched) . "\n";

// Проверяем, что из нового места он действительно читается.
$check = json_decode((string) file_get_contents($target), true);
echo "Проверка чтения: " . (($check['key'] ?? '') === $found ? "ОК" : "НЕ ЧИТАЕТСЯ") . "\n";

foreach ($touched as $name) {
    $out = [];
    exec('php8.3 -l ' . escapeshellarg($apiDir . '/' . $name) . ' 2>&1', $out);
    echo "  " . $name . ": " . trim(implode(' ', $out)) . "\n";
}
