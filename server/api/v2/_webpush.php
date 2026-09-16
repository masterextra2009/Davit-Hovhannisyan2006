<?php
declare(strict_types=1);

// Уведомления в браузер (те, что показывает сам компьютер или телефон, когда
// сайт закрыт) — второй канал рядом с Expo, см. _push.php.
//
// Почему это отдельный файл и почему так длинно: в отличие от Expo, письмо в
// браузер нельзя просто отправить. Оно должно быть
//   1) подписано нашим ключом (VAPID, RFC 8292) — чтобы служба доставки
//      (Google, Mozilla, Apple) видела, от кого письмо;
//   2) зашифровано ключами конкретного браузера (RFC 8291) — чтобы сама
//      служба доставки не могла прочитать текст уведомления.
// Раньше всё это делала библиотека внутри Cloud Function; она уезжает вместе
// с Firebase, поэтому шифрование пришлось перенести сюда.
//
// Ключи нашей стороны лежат вне сайта: .sever18-private/push.php
// (создаются один раз скриптом server/tools/make-vapid-keys.php).

/** Сколько служба доставки хранит недоставленное письмо. */
const WEBPUSH_TTL = 86400;
/** Почта владельца сервиса — этого требует VAPID, туда пишут при проблемах. */
const WEBPUSH_CONTACT = 'mailto:photo-sever@yandex.ru';

function b64url_encode(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function b64url_decode(string $s): string
{
    $s = strtr(trim($s), '-_', '+/');
    return (string) base64_decode(str_pad($s, (int) (ceil(strlen($s) / 4) * 4), '='), true);
}

/** Настройки нашей стороны: закрытый ключ (PEM) и открытый (base64url). */
function webpush_keys(): array
{
    static $keys = null;
    if ($keys === null) {
        $file = SITE_DIR . '/../.sever18-private/push.php';
        $cfg = is_readable($file) ? (require $file) : [];
        $keys = is_array($cfg) ? $cfg : [];
    }
    return $keys;
}

function webpush_public_key(): string
{
    return (string) (webpush_keys()['public_key'] ?? '');
}

/**
 * Отправляет уведомление в один браузер.
 * Возвращает код ответа службы доставки: 201 — принято, 404/410 — подписки
 * больше нет (её надо удалить у нас), 0 — отправить не удалось.
 */
function webpush_send(array $subscription, string $title, string $body): int
{
    $endpoint = (string) ($subscription['endpoint'] ?? '');
    $p256dh = (string) ($subscription['keys']['p256dh'] ?? '');
    $auth = (string) ($subscription['keys']['auth'] ?? '');
    if ($endpoint === '' || $p256dh === '' || $auth === '') {
        return 0;
    }
    $keys = webpush_keys();
    if (empty($keys['private_key_pem']) || empty($keys['public_key'])) {
        error_log('api/v2 webpush: нет ключей VAPID');
        return 0;
    }

    try {
        $payload = json_encode(['title' => $title, 'body' => $body, 'url' => '/'], JSON_UNESCAPED_UNICODE);
        $encrypted = webpush_encrypt($p256dh, $auth, (string) $payload);
        $jwt = webpush_vapid_jwt($endpoint, (string) $keys['private_key_pem']);
    } catch (Throwable $e) {
        error_log('api/v2 webpush: ' . $e->getMessage());
        return 0;
    }

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'TTL: ' . WEBPUSH_TTL,
            'Urgency: normal',
            'Authorization: vapid t=' . $jwt . ', k=' . $keys['public_key'],
        ],
        CURLOPT_POSTFIELDS => $encrypted,
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 201 && $code !== 200 && $code !== 202) {
        error_log('api/v2 webpush: служба доставки ответила ' . $code);
    }
    return $code;
}

/**
 * Шифрование текста уведомления под конкретный браузер (RFC 8291, формат
 * aes128gcm). Отдельные ключи $asPem и $salt — только для проверки по
 * образцу из RFC: в бою и то и другое создаётся заново на каждое письмо.
 */
function webpush_encrypt(string $p256dhB64, string $authB64, string $payload, ?string $asPem = null, ?string $salt = null): string
{
    $uaPublic = b64url_decode($p256dhB64);   // 65 байт: точка на кривой P-256
    $authSecret = b64url_decode($authB64);   // 16 байт
    if (strlen($uaPublic) !== 65 || strlen($authSecret) !== 16) {
        throw new RuntimeException('неверные ключи подписки браузера');
    }

    // Наша одноразовая пара ключей на это письмо.
    if ($asPem === null) {
        $as = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if ($as === false) {
            throw new RuntimeException('не удалось создать одноразовый ключ');
        }
    } else {
        $as = openssl_pkey_get_private($asPem);
        if ($as === false) {
            throw new RuntimeException('не удалось прочитать ключ для проверки');
        }
    }
    $asDetails = openssl_pkey_get_details($as);
    $asPublic = "\x04" . str_pad($asDetails['ec']['x'], 32, "\x00", STR_PAD_LEFT)
        . str_pad($asDetails['ec']['y'], 32, "\x00", STR_PAD_LEFT);

    // Общий секрет с браузером (ECDH).
    $shared = openssl_pkey_derive(ec_public_pem($uaPublic), $as, 32);
    if ($shared === false) {
        throw new RuntimeException('не удалось согласовать общий ключ');
    }

    // Дальше — строго по RFC 8291: из общего секрета и «auth» браузера
    // выводим ключ шифрования и одноразовое число.
    $prkKey = hash_hmac('sha256', $shared, $authSecret, true);
    $keyInfo = "WebPush: info\x00" . $uaPublic . $asPublic;
    $ikm = hash_hmac('sha256', $keyInfo . "\x01", $prkKey, true);

    $salt = $salt ?? random_bytes(16);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\x00", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\x00", $salt);

    // 0x02 — признак конца текста (padding delimiter из RFC 8188).
    $tag = '';
    $ciphertext = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    if ($ciphertext === false) {
        throw new RuntimeException('не удалось зашифровать уведомление');
    }

    // Заголовок письма: соль, размер блока, наш одноразовый открытый ключ.
    return $salt . pack('N', 4096) . chr(65) . $asPublic . $ciphertext . $tag;
}

/** Подпись VAPID: доказывает службе доставки, что письмо от нашего сервера. */
function webpush_vapid_jwt(string $endpoint, string $privatePem): string
{
    $parts = parse_url($endpoint);
    $audience = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');

    $header = b64url_encode((string) json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = b64url_encode((string) json_encode([
        'aud' => $audience,
        'exp' => time() + 12 * 3600,
        'sub' => WEBPUSH_CONTACT,
    ]));

    $key = openssl_pkey_get_private($privatePem);
    if ($key === false) {
        throw new RuntimeException('не удалось прочитать ключ VAPID');
    }
    $der = '';
    if (!openssl_sign($header . '.' . $claims, $der, $key, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('не удалось подписать письмо');
    }
    return $header . '.' . $claims . '.' . b64url_encode(der_to_raw_signature($der));
}

/** Открытый ключ браузера (65 байт) → PEM, как того хочет OpenSSL. */
function ec_public_pem(string $point): string
{
    // Постоянная часть DER для кривой P-256 (prime256v1) + сама точка.
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** Закрытый ключ из 32 «сырых» байт → PEM (нужно только для проверки по образцу RFC). */
function ec_private_pem(string $d, string $point): string
{
    $der = "\x30\x77\x02\x01\x01\x04\x20" . $d
        . "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07"
        . "\xa1\x44\x03\x42\x00" . $point;
    return "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n";
}

/**
 * OpenSSL отдаёт подпись в формате DER, а JWT ждёт 64 байта «r и s подряд».
 */
function der_to_raw_signature(string $der): string
{
    $offset = 2;
    if (ord($der[1]) > 0x80) {
        $offset += ord($der[1]) - 0x80;   // длинная форма длины
    }
    $parts = [];
    for ($i = 0; $i < 2; $i++) {
        if ($der[$offset] !== "\x02") {
            throw new RuntimeException('неожиданный формат подписи');
        }
        $len = ord($der[$offset + 1]);
        $value = substr($der, $offset + 2, $len);
        $value = ltrim($value, "\x00");                       // убрать ведущий ноль
        $parts[] = str_pad($value, 32, "\x00", STR_PAD_LEFT); // дополнить до 32 байт
        $offset += 2 + $len;
    }
    return $parts[0] . $parts[1];
}
