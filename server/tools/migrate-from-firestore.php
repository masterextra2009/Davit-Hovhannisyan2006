<?php
declare(strict_types=1);

// Перенос данных из Google Firestore в нашу базу MySQL (152-ФЗ: данные
// граждан РФ должны храниться в России).
//
// Запускается вручную на сервере:
//   php ~/migrate-from-firestore.php            — только посчитать, ничего не менять
//   php ~/migrate-from-firestore.php --write    — перенести
//
// Запускать можно сколько угодно раз: записи с теми же номерами
// перезаписываются, новые добавляются. Ничего не удаляется — ни в Firebase,
// ни у нас.
//
// Пароли НЕ переносятся: они лежат не в Firestore, а в Firebase Auth. У
// перенесённого клиента пароль остаётся пустым, и при первом входе auth.php
// один раз сверяет его со старым Firebase, после чего запоминает у нас.
//
// Доступ к Firestore берём тот же, которым пользовался старый api/payment-create.php
// (служебный ключ проекта), — отдельный ключ заводить не нужно, а этот всё
// равно доживает последние дни вместе с Firebase.

const HOME = __DIR__;
const SITE = '/sever-18.ru/public_html';

$write = in_array('--write', $argv, true);
$only = null;
foreach ($argv as $a) {
    if (str_starts_with($a, '--only=')) {
        $only = substr($a, 7);
    }
}

// ─────────────────────────── Доступ к Firestore ───────────────────────────

$paymentFile = getenv('HOME') . SITE . '/api/payment-create.php';
$src = @file_get_contents($paymentFile);
if ($src === false) {
    exit("Не нашёл старый api/payment-create.php — из него берутся ключи доступа к Firebase\n");
}
preg_match("/define\('FIREBASE_PROJECT_ID',\s*'([^']+)'/", $src, $m1);
preg_match("/define\('FIREBASE_DATABASE_ID',\s*'([^']+)'/", $src, $m2);
preg_match("/define\('FIREBASE_SA_EMAIL',\s*'([^']+)'/", $src, $m3);
preg_match('/\$FIREBASE_SA_KEY_B64_PARTS\s*=\s*\[(.*?)\];/s', $src, $m4);
if (!$m1 || !$m3 || !$m4) {
    exit("Не разобрал ключи Firebase из payment-create.php\n");
}
$projectId = $m1[1];
$databaseId = $m2[1] ?? '(default)';
$saEmail = $m3[1];
preg_match_all("/'([^']+)'/", $m4[1], $parts);
$privateKey = base64_decode(implode('', $parts[1]));

function access_token(string $email, string $privateKey): string
{
    $now = time();
    $enc = fn(array $a) => rtrim(strtr(base64_encode(json_encode($a)), '+/', '-_'), '=');
    $unsigned = $enc(['alg' => 'RS256', 'typ' => 'JWT']) . '.' . $enc([
        'iss' => $email,
        'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud' => 'https://oauth2.googleapis.com/token',
        'exp' => $now + 3600,
        'iat' => $now,
    ]);
    $signature = '';
    if (!openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
        exit("Не удалось подписать запрос к Google\n");
    }
    $jwt = $unsigned . '.' . rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]),
    ]);
    $answer = json_decode((string) curl_exec($ch), true);
    curl_close($ch);
    if (empty($answer['access_token'])) {
        exit("Google не выдал доступ: " . json_encode($answer, JSON_UNESCAPED_UNICODE) . "\n");
    }
    return (string) $answer['access_token'];
}

$token = access_token($saEmail, $privateKey);
echo "Доступ к Firebase получен. Проект: $projectId, база: $databaseId\n";
echo $write ? "Режим: ПЕРЕНОС (данные будут записаны)\n\n" : "Режим: только подсчёт, ничего не меняю\n\n";

/** Читает всю коллекцию Firestore постранично. */
function fetch_collection(string $projectId, string $databaseId, string $token, string $name): array
{
    $docs = [];
    $pageToken = '';
    do {
        $url = 'https://firestore.googleapis.com/v1/projects/' . $projectId
            . '/databases/' . rawurlencode($databaseId) . '/documents/' . $name
            . '?pageSize=300' . ($pageToken !== '' ? '&pageToken=' . rawurlencode($pageToken) : '');
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200) {
            echo "  ! Firestore ответил $code на коллекцию $name\n";
            return $docs;
        }
        $answer = json_decode((string) $raw, true);
        foreach ($answer['documents'] ?? [] as $doc) {
            $id = basename((string) $doc['name']);
            $docs[$id] = decode_fields($doc['fields'] ?? []);
        }
        $pageToken = (string) ($answer['nextPageToken'] ?? '');
    } while ($pageToken !== '');
    return $docs;
}

/** Значения Firestore приходят в обёртках вида {"stringValue": "..."} — разворачиваем. */
function decode_fields(array $fields): array
{
    $out = [];
    foreach ($fields as $key => $value) {
        $out[$key] = decode_value($value);
    }
    return $out;
}

function decode_value(array $v)
{
    if (array_key_exists('nullValue', $v)) return null;
    if (isset($v['stringValue'])) return $v['stringValue'];
    if (isset($v['booleanValue'])) return (bool) $v['booleanValue'];
    if (isset($v['integerValue'])) return (int) $v['integerValue'];
    if (isset($v['doubleValue'])) return (float) $v['doubleValue'];
    if (isset($v['timestampValue'])) return $v['timestampValue'];
    if (isset($v['mapValue'])) return decode_fields($v['mapValue']['fields'] ?? []);
    if (isset($v['arrayValue'])) {
        return array_map('decode_value', $v['arrayValue']['values'] ?? []);
    }
    return null;
}

// ─────────────────────────── Наша база ───────────────────────────

$cfgFile = getenv('HOME') . '/sever-18.ru/.sever18-private/sever18-db.php';
$c = require $cfgFile;
$pdo = new PDO(
    "mysql:host={$c['host']};dbname={$c['database']};charset={$c['charset']}",
    $c['user'],
    $c['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
$pdo->exec("SET time_zone = '+00:00'");

/** ISO-время из Firestore → время MySQL в UTC. */
function t(?string $iso): ?string
{
    if (!$iso) return null;
    try {
        return (new DateTimeImmutable($iso))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    } catch (Throwable $e) {
        return null;
    }
}

function s($v, int $max = 255): ?string
{
    if ($v === null || $v === '') return null;
    return mb_substr((string) $v, 0, $max);
}

function b($v): int
{
    return $v === true || $v === 1 || $v === '1' ? 1 : 0;
}

/** Поля, которые мы разложили по колонкам; всё остальное складываем в extra. */
function extra_of(array $doc, array $known): ?string
{
    $rest = array_diff_key($doc, array_flip($known));
    unset($rest['id']);
    return $rest ? json_encode($rest, JSON_UNESCAPED_UNICODE) : null;
}

function insert(PDO $pdo, string $table, array $row, bool $write): void
{
    if (!$write) return;
    $cols = array_keys($row);
    $sql = 'INSERT INTO ' . $table . ' (' . implode(', ', $cols) . ') VALUES ('
        . implode(', ', array_fill(0, count($cols), '?')) . ') AS new ON DUPLICATE KEY UPDATE '
        . implode(', ', array_map(fn($c2) => "$c2 = new.$c2", array_slice($cols, 1)));
    $pdo->prepare($sql)->execute(array_values($row));
}

$report = [];
$want = fn(string $name) => $only === null || $only === $name;

// ─────────────────────────── 1. Клиенты ───────────────────────────

if ($want('users')) {
    $users = fetch_collection($projectId, $databaseId, $token, 'users');
    $known = ['id', 'email', 'fullName', 'role', 'phone', 'avatarUrl', 'createdAt', 'isGuest', 'telegramChatId',
        'telegramUsername', 'telegramNotificationsEnabled', 'expoPushToken', 'pushSubscription', 'promoCode',
        'promoDiscount', 'promoExpiresAt', 'promoGiftedSeen', 'referralCode', 'referredBy', 'referralRewardGranted',
        'adminTypingAt', 'lastActiveAt', 'isOnline', 'docCheckFreeUsed'];
    foreach ($users as $id => $u) {
        insert($pdo, 'users', [
            'id' => $id,
            'email' => s($u['email'] ?? null),
            'full_name' => (string) s($u['fullName'] ?? '', 255) ?? '',
            'role' => ($u['role'] ?? 'client') === 'admin' ? 'admin' : 'client',
            'phone' => s($u['phone'] ?? null, 32),
            'avatar_url' => s($u['avatarUrl'] ?? null, 1024),
            'auth_provider' => b($u['isGuest'] ?? false) ? 'guest' : 'password',
            'is_guest' => b($u['isGuest'] ?? false),
            'telegram_chat_id' => s($u['telegramChatId'] ?? null, 64),
            'telegram_username' => s($u['telegramUsername'] ?? null, 64),
            'telegram_notifications_enabled' => b($u['telegramNotificationsEnabled'] ?? false),
            'expo_push_token' => s($u['expoPushToken'] ?? null),
            'push_subscription' => isset($u['pushSubscription']) && is_array($u['pushSubscription'])
                ? json_encode($u['pushSubscription'], JSON_UNESCAPED_SLASHES) : null,
            'promo_code' => s($u['promoCode'] ?? null, 64),
            'promo_discount' => isset($u['promoDiscount']) ? (int) $u['promoDiscount'] : null,
            'promo_expires_at' => t($u['promoExpiresAt'] ?? null),
            'promo_gifted_seen' => b($u['promoGiftedSeen'] ?? false),
            'referral_code' => s($u['referralCode'] ?? null, 32),
            'referred_by' => s($u['referredBy'] ?? null, 64),
            'referral_reward_granted' => b($u['referralRewardGranted'] ?? false),
            'admin_typing_at' => t($u['adminTypingAt'] ?? null),
            'last_active_at' => t($u['lastActiveAt'] ?? null),
            'is_online' => b($u['isOnline'] ?? false),
            'doc_check_free_used' => (int) ($u['docCheckFreeUsed'] ?? 0),
            'extra' => extra_of($u, $known),
            'created_at' => t($u['createdAt'] ?? null) ?? gmdate('Y-m-d H:i:s.000'),
        ], $write);
    }
    $report['клиенты'] = count($users);
}

// ─────────────────────────── 2. Заказы ───────────────────────────

if ($want('orders')) {
    $orders = fetch_collection($projectId, $databaseId, $token, 'orders');
    $known = ['id', 'userId', 'userName', 'userEmail', 'userPhone', 'isGuestOrder', 'files', 'orderDate', 'status',
        'totalCost', 'paymentStatus', 'paymentMethod', 'transactionId', 'notes', 'paperType', 'paperDensity',
        'photoSize', 'printColor', 'copies', 'binding', 'promoCode', 'promoDiscount', 'serviceId', 'rejected',
        'rejectionReason', 'rejectedAt', 'rating', 'ratingComment', 'readyAt', 'readyReminderSent', 'completedAt'];
    $skipped = 0;
    foreach ($orders as $id => $o) {
        $userId = (string) ($o['userId'] ?? '');
        if ($userId === '') { $skipped++; continue; }
        // Заказ ссылается на клиента: если его профиль не переехал (удалён в
        // Firebase), заказ пропускаем — иначе база не примет ссылку в никуда.
        if ($write) {
            $check = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
            $check->execute([$userId]);
            if (!$check->fetchColumn()) { $skipped++; continue; }
        }
        insert($pdo, 'orders', [
            'id' => $id,
            'user_id' => $userId,
            'user_name' => (string) (s($o['userName'] ?? '', 255) ?? ''),
            'user_email' => (string) (s($o['userEmail'] ?? '', 255) ?? ''),
            'user_phone' => s($o['userPhone'] ?? null, 32),
            'is_guest_order' => b($o['isGuestOrder'] ?? false),
            'files' => json_encode($o['files'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'order_date' => t($o['orderDate'] ?? null) ?? gmdate('Y-m-d H:i:s.000'),
            'status' => in_array($o['status'] ?? '', ['pending', 'approved', 'printing', 'ready', 'printed'], true)
                ? $o['status'] : 'pending',
            'total_cost' => number_format((float) ($o['totalCost'] ?? 0), 2, '.', ''),
            'payment_status' => s($o['paymentStatus'] ?? 'unpaid', 16) ?? 'unpaid',
            'payment_method' => s($o['paymentMethod'] ?? null, 64),
            'transaction_id' => s($o['transactionId'] ?? null, 128),
            'notes' => s($o['notes'] ?? null, 4000),
            'paper_type' => s($o['paperType'] ?? null, 32),
            'paper_density' => s($o['paperDensity'] ?? null, 32),
            'photo_size' => s($o['photoSize'] ?? null, 32),
            'print_color' => s($o['printColor'] ?? null, 16),
            'copies' => max(1, (int) ($o['copies'] ?? 1)),
            'binding' => s($o['binding'] ?? null, 32),
            'promo_code' => s($o['promoCode'] ?? null, 64),
            'promo_discount' => isset($o['promoDiscount']) ? (int) $o['promoDiscount'] : null,
            'service_id' => s($o['serviceId'] ?? null, 64),
            'rejected' => b($o['rejected'] ?? false),
            'rejection_reason' => s($o['rejectionReason'] ?? null, 2000),
            'rejected_at' => t($o['rejectedAt'] ?? null),
            'rating' => isset($o['rating']) ? (int) $o['rating'] : null,
            'rating_comment' => s($o['ratingComment'] ?? null, 1000),
            'ready_at' => t($o['readyAt'] ?? null),
            'ready_reminder_sent' => b($o['readyReminderSent'] ?? false),
            'completed_at' => t($o['completedAt'] ?? null),
            'extra' => extra_of($o, $known),
        ], $write);
    }
    $report['заказы'] = count($orders) . ($skipped ? " (пропущено без клиента: $skipped)" : '');
}

// ─────────────────────────── 3. Чат ───────────────────────────

if ($want('chat')) {
    $chats = fetch_collection($projectId, $databaseId, $token, 'chatMessages');
    $skipped = 0;
    foreach ($chats as $id => $m) {
        $userId = (string) ($m['userId'] ?? '');
        if ($userId === '') { $skipped++; continue; }
        if ($write) {
            $check = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
            $check->execute([$userId]);
            if (!$check->fetchColumn()) { $skipped++; continue; }
        }
        insert($pdo, 'chat_messages', [
            'id' => $id,
            'user_id' => $userId,
            'sender_id' => (string) (s($m['senderId'] ?? $userId, 64) ?? $userId),
            'sender_role' => ($m['senderRole'] ?? 'client') === 'admin' ? 'admin' : 'client',
            'sender_name' => (string) (s($m['senderName'] ?? '', 255) ?? ''),
            'message' => (string) ($m['message'] ?? ''),
            'created_at' => t($m['timestamp'] ?? null) ?? gmdate('Y-m-d H:i:s.000'),
            'read_by_admin' => b($m['readByAdmin'] ?? false),
            'read_by_client' => b($m['readByClient'] ?? false),
        ], $write);
    }
    $report['сообщения чата'] = count($chats) . ($skipped ? " (пропущено: $skipped)" : '');
}

// ─────────────────────────── 4. Уведомления ───────────────────────────

if ($want('notifications')) {
    $alerts = fetch_collection($projectId, $databaseId, $token, 'notifications');
    $skipped = 0;
    foreach ($alerts as $id => $n) {
        $userId = (string) ($n['userId'] ?? '');
        if ($userId === '') { $skipped++; continue; }
        if ($write) {
            $check = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
            $check->execute([$userId]);
            if (!$check->fetchColumn()) { $skipped++; continue; }
        }
        insert($pdo, 'notifications', [
            'id' => $id,
            'user_id' => $userId,
            'title' => (string) (s($n['title'] ?? '', 255) ?? ''),
            'body' => (string) ($n['body'] ?? ''),
            'type' => in_array($n['type'] ?? '', ['order_status', 'chat', 'payment', 'profile'], true)
                ? $n['type'] : 'profile',
            'is_read' => b($n['read'] ?? false),
            'created_at' => t($n['timestamp'] ?? null) ?? gmdate('Y-m-d H:i:s.000'),
        ], $write);
    }
    $report['уведомления'] = count($alerts) . ($skipped ? " (пропущено: $skipped)" : '');
}

// ─────────────────────────── 5. Отзывы ───────────────────────────

if ($want('feedback')) {
    $items = fetch_collection($projectId, $databaseId, $token, 'feedback');
    foreach ($items as $id => $f) {
        insert($pdo, 'feedback', [
            'id' => $id,
            'user_id' => (string) (s($f['userId'] ?? '', 64) ?? ''),
            'user_name' => (string) (s($f['userName'] ?? '', 255) ?? ''),
            'user_email' => (string) (s($f['userEmail'] ?? '', 255) ?? ''),
            'message' => (string) ($f['message'] ?? ''),
            'is_bug_report' => b($f['isBugReport'] ?? false),
            'screenshot_url' => s($f['screenshotUrl'] ?? null, 1024),
            'created_at' => t($f['timestamp'] ?? null) ?? gmdate('Y-m-d H:i:s.000'),
        ], $write);
    }
    $report['отзывы'] = count($items);
}

// ─────────────────────────── 6. Услуги ───────────────────────────

if ($want('services')) {
    $items = fetch_collection($projectId, $databaseId, $token, 'services');
    foreach ($items as $id => $sv) {
        $extra = array_filter([
            'imageUrl' => $sv['imageUrl'] ?? null,
            'imageScale' => $sv['imageScale'] ?? null,
            'iconUrl' => $sv['iconUrl'] ?? null,
        ], fn($v) => $v !== null && $v !== '');
        insert($pdo, 'services', [
            'id' => $id,
            'title' => (string) (s($sv['title'] ?? '', 255) ?? ''),
            'description' => (string) ($sv['description'] ?? ''),
            'price' => (string) (s($sv['price'] ?? '', 64) ?? ''),
            'emoji' => (string) (s($sv['emoji'] ?? '', 16) ?? ''),
            'category' => (string) (s($sv['category'] ?? '', 64) ?? ''),
            'is_active' => b($sv['isActive'] ?? true),
            'sort_order' => (int) ($sv['order'] ?? 0),
            'extra' => $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : null,
        ], $write);
    }
    $report['услуги'] = count($items);
}

// ─────────────────────────── 7. Новости и акции ───────────────────────────

if ($want('promos')) {
    $items = fetch_collection($projectId, $databaseId, $token, 'promos');
    foreach ($items as $id => $p) {
        $extra = array_filter([
            'imageUrl' => $p['imageUrl'] ?? null,
            'mediaType' => $p['mediaType'] ?? null,
            'mediaWidth' => isset($p['mediaWidth']) ? (int) $p['mediaWidth'] : null,
            'mediaHeight' => isset($p['mediaHeight']) ? (int) $p['mediaHeight'] : null,
            'linkUrl' => $p['linkUrl'] ?? null,
        ], fn($v) => $v !== null && $v !== '');
        $day = fn($d) => (is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) ? $d . ' 00:00:00.000' : null;
        insert($pdo, 'promos', [
            'id' => $id,
            'title' => (string) (s($p['title'] ?? '', 255) ?? ''),
            'body' => (string) ($p['body'] ?? ''),
            'active' => b($p['active'] ?? true),
            'show_from' => $day($p['from'] ?? null),
            'show_to' => $day($p['to'] ?? null),
            'extra' => $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : null,
            'created_at' => t($p['createdAt'] ?? null) ?? gmdate('Y-m-d H:i:s.000'),
        ], $write);
    }
    $report['новости'] = count($items);
}

// ─────────────────────────── 8. Коды приглашений ───────────────────────────

if ($want('referrals')) {
    $items = fetch_collection($projectId, $databaseId, $token, 'referralCodes');
    $skipped = 0;
    foreach ($items as $code => $r) {
        $userId = (string) ($r['userId'] ?? '');
        if ($userId === '') { $skipped++; continue; }
        if ($write) {
            $check = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
            $check->execute([$userId]);
            if (!$check->fetchColumn()) { $skipped++; continue; }
        }
        insert($pdo, 'referral_codes', ['code' => mb_substr($code, 0, 32), 'user_id' => $userId], $write);
    }
    $report['коды приглашений'] = count($items) . ($skipped ? " (пропущено: $skipped)" : '');
}

// ─────────────────────────── 9. Счётчик номеров заказов ───────────────────────────

if ($want('counters')) {
    // ВАЖНО: без этого новые заказы начнут нумероваться с 1000 и наложатся на
    // старые. Берём следующий номер из Firestore как есть.
    $counters = fetch_collection($projectId, $databaseId, $token, 'counters');
    $next = (int) ($counters['orders']['next'] ?? 0);
    if ($next > 0) {
        insert($pdo, 'counters', ['name' => 'orders', 'next' => $next], $write);
        $report['следующий номер заказа'] = $next;
    } else {
        $report['следующий номер заказа'] = 'не найден в Firestore (!)';
    }
}

// ─────────────────────── 9б. Привязки Telegram ───────────────────────

if ($want('telegram')) {
    // Кто подключил бота, хранится НЕ в Firestore, а в отдельном файле старого
    // сайта (api/telegram_chatids.json): номер клиента → номер чата в Telegram.
    // Без этого переноса клиент перестал бы получать уведомления о заказе.
    $file = getenv('HOME') . SITE . '/api/telegram_chatids.json';
    $links = is_readable($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
    $moved = 0;
    foreach ($links as $userId => $chatId) {
        if ($write) {
            $st = $pdo->prepare('UPDATE users SET telegram_chat_id = ?, telegram_notifications_enabled = 1
                                 WHERE id = ? AND deleted_at IS NULL');
            $st->execute([(string) $chatId, (string) $userId]);
            $moved += $st->rowCount();
        } else {
            $check = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
            $check->execute([(string) $userId]);
            $moved += $check->fetchColumn() ? 1 : 0;
        }
    }
    $report['привязки Telegram'] = count($links) . ' (перенесено: ' . $moved . ')';
}

// ─────────────────────────── 10. Посещения ───────────────────────────

if ($want('stats')) {
    $stats = fetch_collection($projectId, $databaseId, $token, 'stats');
    $visits = $stats['visits'] ?? null;
    if (is_array($visits)) {
        insert($pdo, 'stats', [
            'name' => 'visits',
            'data' => json_encode([
                'total' => (int) ($visits['total'] ?? 0),
                'history' => $visits['history'] ?? new stdClass(),
            ], JSON_UNESCAPED_UNICODE),
        ], $write);
        $report['посещения всего'] = (int) ($visits['total'] ?? 0);
    }
}

// ─────────────────────────── Итог ───────────────────────────

echo "Что нашлось в Firebase:\n";
foreach ($report as $k => $v) {
    echo '  ' . $k . ': ' . $v . "\n";
}
if (!$write) {
    echo "\nНичего не записано. Чтобы перенести: php " . basename(__FILE__) . " --write\n";
} else {
    echo "\nПеренос завершён. Проверьте счётчики в базе.\n";
}
