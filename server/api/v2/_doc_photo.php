<?php
declare(strict_types=1);

/**
 * Общее для «Фото на документы»: где лежат файлы и как готовое фото попадает
 * в заказ. Подключается из doc-photo.php и payments.php (после оплаты).
 *
 * Готовое фото без водяного знака лежит ВНЕ сайта (~/sever-18.ru/docphoto-private),
 * потому что папка uploads/ открывается по прямой ссылке. В uploads/ клиента
 * оно копируется только когда заказ оплачен — тогда его видит админка для печати.
 */

require_once __DIR__ . '/_doc_photo_catalog.php';

const DOC_PHOTO_PRIVATE_DIR = SITE_DIR . '/../docphoto-private';

function doc_photo_private_path(string $userId, string $attemptId): string
{
    return DOC_PHOTO_PRIVATE_DIR . '/' . $userId . '/' . $attemptId . '.jpg';
}

/** Данные «фото на документы» из orders.extra. */
function doc_photo_order_extra(array $order): array
{
    $extra = $order['extra'] ? (json_decode((string) $order['extra'], true) ?: []) : [];
    return is_array($extra['docPhoto'] ?? null) ? $extra['docPhoto'] : [];
}

/**
 * Кладёт выбранную попытку в файлы оплаченного заказа (для печати в админке).
 * Возвращает новый список файлов или null, если прикреплять нечего.
 */
function doc_photo_attach(array $order): ?array
{
    if (($order['service_id'] ?? '') !== DOC_PHOTO_SERVICE_ID || ($order['payment_status'] ?? '') !== 'paid') {
        return null;
    }
    $dp = doc_photo_order_extra($order);
    $attemptId = (string) ($dp['attemptId'] ?? '');
    if ($attemptId === '' || !preg_match('/^[A-Za-z0-9]{8,32}$/', $attemptId)) {
        return null;
    }
    $src = doc_photo_private_path((string) $order['user_id'], $attemptId);
    if (!is_file($src)) {
        error_log('doc-photo: нет файла попытки ' . $attemptId . ' для заказа ' . $order['id']);
        return null;
    }
    $doc = doc_photo_find((string) ($dp['docId'] ?? '')) ?? ['name' => 'Фото на документы', 'w' => 35, 'h' => 45, 'copies' => 4];
    $userDir = SITE_DIR . '/uploads/' . $order['user_id'];
    if (!is_dir($userDir) && !mkdir($userDir, 0755, true) && !is_dir($userDir)) {
        error_log('doc-photo: не удалось создать папку клиента');
        return null;
    }
    $name = 'docphoto_' . $order['id'] . '_' . $attemptId . '.jpg';
    if (!copy($src, $userDir . '/' . $name)) {
        error_log('doc-photo: не удалось скопировать фото в заказ ' . $order['id']);
        return null;
    }
    $path = 'uploads/' . $order['user_id'] . '/' . $name;
    $exp = time() + 30 * 24 * 3600;
    $url = 'https://sever-18.ru/api/v2/files.php?action=get&path=' . rawurlencode($path)
        . '&exp=' . $exp . '&sig=' . doc_photo_sign($path, $exp);
    $size = sprintf('%s×%s', rtrim(rtrim(number_format($doc['w'] / 10, 1, ',', ''), '0'), ','), rtrim(rtrim(number_format($doc['h'] / 10, 1, ',', ''), '0'), ','));
    $files = [[
        'id' => 'docphoto-' . $attemptId,
        'name' => $doc['name'] . ' ' . $size . ' см' . (($dp['color'] ?? '') === 'bw' ? ' ч/б' : '') . '.jpg',
        'size' => (int) filesize($src),
        'type' => 'image/jpeg',
        'uploadedAt' => gmdate('c'),
        'url' => $url,
        'photoSize' => $size,
        'fileCopies' => (int) ($dp['copies'] ?? $doc['copies']),
        'printColor' => ($dp['color'] ?? '') === 'bw' ? 'bw' : 'color',
    ]];
    db()->prepare('UPDATE orders SET files = ? WHERE id = ?')
        ->execute([json_encode($files, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $order['id']]);
    return $files;
}

/** Подпись ссылки на файл — та же, что в files.php (ключ в .sever18-private/files.php). */
function doc_photo_sign(string $path, int $exp): string
{
    $file = SITE_DIR . '/../.sever18-private/files.php';
    $cfg = is_readable($file) ? (require $file) : [];
    $secret = is_array($cfg) ? (string) ($cfg['link_secret'] ?? '') : '';
    return hash_hmac('sha256', $path . '|' . $exp, $secret);
}
