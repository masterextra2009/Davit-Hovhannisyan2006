<?php
declare(strict_types=1);

// Создаёт пару ключей VAPID для браузерных уведомлений и печатает готовый
// файл настроек. Запускается один раз, вручную, на сервере:
//
//   php ~/make-vapid-keys.php > ~/sever-18.ru/.sever18-private/push.php
//
// Закрытый ключ никуда не отправляется и в репозиторий не попадает. Открытый
// ключ не секрет: его отдаёт сайту api/v2/push.php?action=key, и браузер
// подписывается именно на него. Если ключи поменять — все существующие
// подписки браузеров перестанут работать, и подписаться придётся заново.

$key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
if ($key === false) {
    fwrite(STDERR, "не удалось создать ключ\n");
    exit(1);
}
openssl_pkey_export($key, $pem);
$d = openssl_pkey_get_details($key);

$point = "\x04" . str_pad($d['ec']['x'], 32, "\x00", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\x00", STR_PAD_LEFT);
$public = rtrim(strtr(base64_encode($point), '+/', '-_'), '=');

echo "<?php\n";
echo "// Ключи VAPID для браузерных уведомлений. Созданы " . date('d.m.Y') . ".\n";
echo "// Закрытый ключ не показывать и не копировать в репозиторий.\n";
echo "return [\n";
echo "    'public_key' => '" . $public . "',\n";
echo "    'private_key_pem' => <<<'PEM'\n" . trim((string) $pem) . "\nPEM,\n";
echo "];\n";
