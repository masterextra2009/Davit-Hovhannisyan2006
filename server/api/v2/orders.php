<?php
declare(strict_types=1);

// Заказы на своём сервере (api/v2/orders.php?action=…) — вместо коллекций
// Firestore orders и counters/orders.
//
// Клиент (Authorization: Bearer <token>):
//   POST reserve                          → {orderId}   номер до загрузки файлов
//   POST create  {order}                  → {order}     заказ по своей брони
//   GET  list    [&since=ISO]             → {orders, deletedIds, serverTime}
//   GET  get     &id=ORD-…                → {order}
//   POST rate    {id, rating, ratingComment}
//   POST cancel  {id}                     — свой, не оплаченный, не взятый в работу
// Админ:
//   GET  list / get                       — все заказы
//   POST save    {order}                  — сохранить заказ целиком
//   POST delete  {id}
//
// Права повторяют firestore.rules: клиент сам не ставит «оплачено», не меняет
// статус и не трогает чужие заказы. Номер, дату, статус, оплату и «гость ли»
// при создании ставит сервер, а не присланные данные.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_pricing.php';
require __DIR__ . '/_referrals.php';
require __DIR__ . '/_push.php';
require __DIR__ . '/_telegram.php';

const ORDER_STATUSES = ['pending', 'approved', 'printing', 'ready', 'printed'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'failed'];
const RESERVATION_HOURS = 6;
const MAX_OPEN_RESERVATIONS = 20;
const MAX_FILES = 300;
const MAX_FILES_JSON = 2000000;
/** Поля файла заказа (src/types.ts PrintFile). Всё прочее, включая base64 в content, отбрасывается. */
const FILE_KEYS = [
    'id', 'name', 'size', 'type', 'uploadedAt', 'simplifiedDocsMode', 'formatGroup', 'pageCount',
    'url', 'previewUrl', 'paperType', 'format', 'printColor', 'fileCopies', 'photoSize', 'photoBorder',
    'a3Kind', 'a3PaperWeight', 'a3PhotoFinish', 'bindingKind', 'colorFillPercent', 'colorTier',
    'imagePixelWidth', 'imagePixelHeight', 'collageCount', 'collagePaper', 'bundleFixedPrice', 'bundleFileCount',
];
/** Файлы новых заказов клиентов — только с сервера мастерской (152-ФЗ: данные в РФ). */
const CLIENT_FILE_HOST = '#^https://(www\.)?sever-18\.ru/#';

$action = $_GET['action'] ?? '';
if (in_array($action, ['reserve', 'create', 'cancel', 'rate'], true)) {
    $RATE_LIMIT_MAX = 40;
    $RATE_LIMIT_WINDOW = 300;
    require __DIR__ . '/../rate-limit.php';
}

$user = require_user();
$isAdmin = $user['role'] === 'admin';

switch ($action) {
    case 'reserve':
        require_method('POST');
        reserve($user);
    case 'create':
        require_method('POST');
        create($user);
    case 'list':
        require_method('GET');
        list_orders($user, $isAdmin);
    case 'get':
        require_method('GET');
        respond(['ok' => true, 'order' => order_public(load_order((string) ($_GET['id'] ?? ''), $user, $isAdmin))]);
    case 'rate':
        require_method('POST');
        rate($user);
    case 'cancel':
        require_method('POST');
        cancel($user);
    case 'save':
        require_method('POST');
        require_admin($isAdmin);
        admin_save();
    case 'delete':
        require_method('POST');
        require_admin($isAdmin);
        admin_delete();
    default:
        fail('Неизвестное действие', 404);
}

// ─────────────────────────── Клиент ───────────────────────────

/** Резервирует следующий номер заказа (ORD-1000, ORD-1001, …) — общий для сайта и приложения. */
function reserve(array $user)
{
    $pdo = db();
    $pdo->exec('DELETE FROM order_reservations WHERE expires_at < UTC_TIMESTAMP(3)');
    $open = $pdo->prepare('SELECT COUNT(*) FROM order_reservations WHERE user_id = ?');
    $open->execute([$user['id']]);
    if ((int) $open->fetchColumn() >= MAX_OPEN_RESERVATIONS) {
        fail('Слишком много начатых заказов. Завершите один из них или попробуйте позже.', 429);
    }

    $pdo->beginTransaction();
    try {
        $pdo->exec("INSERT IGNORE INTO counters (name, next) VALUES ('orders', 1000)");
        $number = (int) $pdo->query("SELECT next FROM counters WHERE name = 'orders' FOR UPDATE")->fetchColumn();
        $pdo->exec("UPDATE counters SET next = next + 1 WHERE name = 'orders'");
        $orderId = 'ORD-' . $number;
        $expires = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
            ->modify('+' . RESERVATION_HOURS . ' hours')->format('Y-m-d H:i:s.v');
        $pdo->prepare('INSERT INTO order_reservations (order_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
            ->execute([$orderId, $user['id'], now_utc(), $expires]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    respond(['ok' => true, 'orderId' => $orderId], 201);
}

function create(array $user)
{
    $o = body()['order'] ?? null;
    if (!is_array($o)) {
        fail('Нет данных заказа');
    }
    $id = (string) ($o['id'] ?? '');
    $pdo = db();

    // Один и тот же заказ может прилететь дважды: экран сохраняет его сам, а
    // следом это же делает общий механизм «отправить изменения на сервер».
    // Второй раз брони уже нет — она снимается при создании, — и клиент видел
    // пугающее «Номер заказа устарел», хотя заказ на самом деле оформлен.
    // Поэтому: заказ с этим номером уже есть и он наш — просто отдаём его.
    $already = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
    $already->execute([$id]);
    $existing = $already->fetch();
    if ($existing) {
        if ($existing['user_id'] !== $user['id']) {
            fail('Номер заказа занят — оформите заказ ещё раз', 409);
        }
        respond(['ok' => true, 'order' => order_public($existing)]);
    }

    $res = $pdo->prepare('SELECT user_id FROM order_reservations WHERE order_id = ? AND expires_at > UTC_TIMESTAMP(3)');
    $res->execute([$id]);
    if ($res->fetchColumn() !== $user['id']) {
        fail('Номер заказа устарел — оформите заказ ещё раз', 409);
    }

    $files = clean_files($o['files'] ?? [], true);
    $serviceId = str_or_null($o['serviceId'] ?? null, 64);
    if (!$files && $serviceId === null) {
        fail('В заказе нет файлов');
    }
    // Сумму считает сервер (_pricing.php) — присланную не берём. Неизвестный
    // или истёкший промокод просто не даёт скидки и в заказ не пишется.
    $promo = str_or_null($o['promoCode'] ?? null, 64);
    $promo = $promo === null ? null : mb_strtoupper($promo);
    $discount = promo_percent($promo, $user);
    if ($discount === 0) {
        $promo = null;
    }
    $serviceExtra = 0;
    if ($serviceId !== null) {
        $servicePrice = service_price($serviceId);
        if ($servicePrice === null) {
            fail('Эта услуга сейчас недоступна — обновите страницу', 409);
        }
        // Количество приходит только из приложения (витрина услуг, 24.09.2026);
        // сайт его не шлёт — у него, как и раньше, одна услуга.
        $serviceExtra = $servicePrice * (int_in($o['serviceQty'] ?? 1, 1, 1000) ?? 1);
    }
    $binding = str_or_null($o['binding'] ?? null, 32);
    $totalRub = order_price($files, $binding, $discount, $serviceExtra);
    $total = number_format($totalRub, 2, '.', '');
    $claimed = money($o['totalCost'] ?? null);

    $row = [
        'id' => $id,
        'user_id' => $user['id'],
        'user_name' => str_or_null($o['userName'] ?? null, 255) ?? $user['full_name'],
        // Почта — из аккаунта: в заказ не подставить чужую.
        'user_email' => (string) ($user['email'] ?? ''),
        'user_phone' => str_or_null($o['userPhone'] ?? null, 32),
        'is_guest_order' => ((int) $user['is_guest'] === 1 || ($o['isGuestOrder'] ?? false) === true) ? 1 : 0,
        'files' => json_encode($files, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'order_date' => now_utc(),
        'status' => 'pending',
        'total_cost' => $total,
        'payment_status' => 'unpaid',
        'payment_method' => str_or_null($o['paymentMethod'] ?? null, 64),
        'notes' => str_or_null($o['notes'] ?? null, 4000),
        'paper_type' => str_or_null($o['paperType'] ?? null, 32),
        'paper_density' => str_or_null($o['paperDensity'] ?? null, 32),
        'photo_size' => str_or_null($o['photoSize'] ?? null, 32),
        'print_color' => str_or_null($o['printColor'] ?? null, 16),
        'copies' => int_in($o['copies'] ?? 1, 1, 100000) ?? 1,
        'binding' => $binding,
        'promo_code' => $promo,
        'promo_discount' => $promo === null ? null : $discount,
        'service_id' => $serviceId,
    ];

    $pdo->beginTransaction();
    try {
        insert_row('orders', $row);
        $pdo->prepare('DELETE FROM order_reservations WHERE order_id = ?')->execute([$id]);
        // Персональный промокод одноразовый — гасим в той же записи, что и заказ.
        if ($promo !== null && $user['promo_code'] !== null && mb_strtoupper(trim($user['promo_code'])) === $promo) {
            $pdo->prepare('UPDATE users SET promo_code = NULL, promo_discount = NULL, promo_expires_at = NULL, promo_gifted_seen = 0 WHERE id = ?')
                ->execute([$user['id']]);
        }
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if ($e->getCode() === '23000') {
            fail('Такой заказ уже оформлен', 409);
        }
        throw $e;
    }
    // Заказ с оплатой при получении готов к работе сразу — сообщаем админу.
    // Заказ под оплату картой объявляется позже, когда оплата пройдёт
    // (payments.php): неоплаченный могут и бросить.
    if (str_starts_with((string) $row['payment_method'], 'При получении')) {
        announce_new_order($id, $row['user_name'], count($files), (float) $total, 'оплата при получении');
    }
    respond([
        'ok' => true,
        'order' => order_public(load_order($id, $user, false)),
        // Сайт или приложение показали клиенту другую сумму — пусть покажут эту.
        'priceChanged' => $claimed !== null && $claimed !== $total,
    ], 201);
}

/**
 * Один раз сообщить админу о новом заказе: окошко Windows (если админка
 * закрыта или свёрнута) и Telegram. Давид 24.09.2026: «пусть один раз
 * высветится, а то каждый раз надо заходить обновлять».
 * Ошибка уведомления заказ не ломает — он уже в базе.
 */
function announce_new_order(string $id, string $name, int $files, ?float $total, string $how): void
{
    $sum = $total === null ? '' : ' · ' . number_format($total, 0, '.', ' ') . ' ₽';
    try {
        push_to_admins('Новый заказ ' . $id, trim($name) . ' · файлов: ' . $files . $sum . ' · ' . $how);
    } catch (Throwable $e) {
        error_log('announce_new_order push: ' . $e->getMessage());
    }
    // Оплаченный картой в Telegram уже объявляет payments.php — не дублируем.
    if ($how !== 'оплачен картой') {
        notify_admin("🔔 <b>Новый заказ</b> ({$how})\n\n"
            . '📋 Заказ: <b>' . tg_escape($id) . "</b>\n"
            . '👤 Клиент: <b>' . tg_escape($name) . "</b>\n"
            . '📁 Файлов: <b>' . $files . "</b>\n"
            . ($total === null ? '' : '💰 Сумма: <b>' . number_format($total, 0, '.', ' ') . " ₽</b>\n")
            . "\n🖨 <a href=\"https://sever-18.ru\">Открыть админку</a>");
    }
}

/** Цена услуги из витрины в рублях (первое число в строке цены) или null, если услуги нет. */
function service_price(string $id): ?int
{
    $st = db()->prepare('SELECT price FROM services WHERE id = ? AND is_active = 1');
    $st->execute([$id]);
    $price = $st->fetchColumn();
    if ($price === false || !preg_match('/\d[\d\s]*/u', (string) $price, $m)) {
        return null;
    }
    return (int) preg_replace('/\s+/u', '', $m[0]);
}

/**
 * Без since — все заказы (клиенту свои). С since — только изменённые после
 * этого момента и номера удалённых: сайт и приложение опрашивают так вместо
 * живой подписки Firestore. serverTime — что передать в since в следующий раз.
 */
function list_orders(array $user, bool $isAdmin)
{
    $pdo = db();
    $serverTime = now_utc();
    $where = [];
    $args = [];
    if (!$isAdmin) {
        $where[] = 'user_id = ?';
        $args[] = $user['id'];
    }
    $since = null;
    if (($_GET['since'] ?? '') !== '') {
        $since = parse_iso((string) $_GET['since']);
        if ($since === null) {
            fail('Неверный параметр since');
        }
        // Запас 5 секунд на записи, которые шли одновременно с прошлым опросом.
        $since = (new DateTimeImmutable($since, new DateTimeZone('UTC')))->modify('-5 seconds')->format('Y-m-d H:i:s.v');
        $where[] = 'updated_at >= ?';
        $args[] = $since;
    }
    $st = $pdo->prepare('SELECT * FROM orders' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY order_date DESC LIMIT 5000');
    $st->execute($args);
    $orders = array_map('order_public', $st->fetchAll());

    $deletedIds = [];
    if ($since !== null) {
        $pdo->exec('DELETE FROM order_deletions WHERE deleted_at < UTC_TIMESTAMP(3) - INTERVAL 30 DAY');
        $d = $pdo->prepare('SELECT DISTINCT order_id FROM order_deletions WHERE deleted_at >= ?' . ($isAdmin ? '' : ' AND user_id = ?'));
        $d->execute($isAdmin ? [$since] : [$since, $user['id']]);
        $deletedIds = $d->fetchAll(PDO::FETCH_COLUMN);
    }
    respond(['ok' => true, 'orders' => $orders, 'deletedIds' => $deletedIds, 'serverTime' => iso($serverTime)]);
}

function rate(array $user)
{
    $order = load_order(str_field('id', 64), $user, false);
    if (!in_array($order['status'], ['ready', 'printed'], true)) {
        fail('Оценить заказ можно после того, как он готов', 409);
    }
    $rating = int_in(body()['rating'] ?? null, 1, 5);
    if ($rating === null) {
        fail('Оценка — от 1 до 5');
    }
    db()->prepare('UPDATE orders SET rating = ?, rating_comment = ? WHERE id = ?')
        ->execute([$rating, str_or_null(body()['ratingComment'] ?? null, 1000), $order['id']]);
    respond(['ok' => true, 'order' => order_public(load_order($order['id'], $user, false))]);
}

/** Отмена = удаление, как на сайте и в приложении: отдельного статуса «отменён» нет. */
function cancel(array $user)
{
    $order = load_order(str_field('id', 64), $user, false);
    if ($order['status'] !== 'pending' || $order['payment_status'] !== 'unpaid') {
        fail('Этот заказ уже взят в работу или оплачен — отменить его нельзя', 409);
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $del = $pdo->prepare("DELETE FROM orders WHERE id = ? AND user_id = ? AND status = 'pending' AND payment_status = 'unpaid'");
        $del->execute([$order['id'], $user['id']]);
        if ($del->rowCount() !== 1) {
            $pdo->rollBack();
            fail('Этот заказ уже взят в работу или оплачен — отменить его нельзя', 409);
        }
        log_deletion($order['id'], $order['user_id']);
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        throw $e;
    }
    respond(['ok' => true]);
}

// ─────────────────────────── Админ ───────────────────────────

/**
 * Сохраняет заказ целиком — так админка сейчас пишет в Firestore (статус,
 * оплата, брак, удаление файла с пересчётом суммы). Незнакомые поля не
 * теряются: складываются в extra.
 */
function admin_save()
{
    $o = body()['order'] ?? null;
    if (!is_array($o)) {
        fail('Нет данных заказа');
    }
    $id = (string) ($o['id'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
        fail('Неверный номер заказа');
    }
    $pdo = db();
    $st = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
    $st->execute([$id]);
    $old = $st->fetch() ?: null;

    $userId = (string) ($o['userId'] ?? ($old['user_id'] ?? ''));
    $u = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
    $u->execute([$userId]);
    if (!$u->fetchColumn()) {
        fail('Клиент заказа не найден');
    }

    $status = (string) ($o['status'] ?? ($old['status'] ?? 'pending'));
    $payment = (string) ($o['paymentStatus'] ?? ($old['payment_status'] ?? 'unpaid'));
    if (!in_array($status, ORDER_STATUSES, true) || !in_array($payment, PAYMENT_STATUSES, true)) {
        fail('Неверный статус заказа');
    }
    $total = money($o['totalCost'] ?? ($old['total_cost'] ?? null));
    if ($total === null) {
        fail('Неверная сумма заказа');
    }
    $rejected = ($o['rejected'] ?? false) === true;

    $becameReady = $status === 'ready' && ($old['status'] ?? null) !== 'ready';
    $readyAt = parse_iso((string) ($o['readyAt'] ?? '')) ?? ($becameReady ? now_utc() : ($old['ready_at'] ?? null));
    $completedAt = parse_iso((string) ($o['completedAt'] ?? ''))
        ?? ($old['completed_at'] ?? ($status === 'printed' ? now_utc() : null));

    $known = array_flip([
        'id', 'userId', 'userName', 'userEmail', 'userPhone', 'isGuestOrder', 'files', 'orderDate', 'status',
        'totalCost', 'paymentStatus', 'paymentMethod', 'transactionId', 'notes', 'paperType', 'paperDensity',
        'photoSize', 'printColor', 'copies', 'completedAt', 'binding', 'promoCode', 'promoDiscount', 'serviceId',
        'rejected', 'rejectionReason', 'rejectedAt', 'rating', 'ratingComment', 'readyAt', 'readyReminderSent',
    ]);
    $extra = array_diff_key($o, $known);

    $row = [
        'id' => $id,
        'user_id' => $userId,
        'user_name' => str_or_null($o['userName'] ?? null, 255) ?? ($old['user_name'] ?? ''),
        'user_email' => str_or_null($o['userEmail'] ?? null, 255) ?? ($old['user_email'] ?? ''),
        'user_phone' => str_or_null($o['userPhone'] ?? null, 32),
        'is_guest_order' => ($o['isGuestOrder'] ?? false) === true ? 1 : 0,
        'files' => json_encode(clean_files($o['files'] ?? [], false), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'order_date' => parse_iso((string) ($o['orderDate'] ?? '')) ?? ($old['order_date'] ?? now_utc()),
        'status' => $status,
        'total_cost' => $total,
        'payment_status' => $payment,
        'payment_method' => str_or_null($o['paymentMethod'] ?? null, 64),
        'transaction_id' => str_or_null($o['transactionId'] ?? null, 128),
        'notes' => str_or_null($o['notes'] ?? null, 4000),
        'paper_type' => str_or_null($o['paperType'] ?? null, 32),
        'paper_density' => str_or_null($o['paperDensity'] ?? null, 32),
        'photo_size' => str_or_null($o['photoSize'] ?? null, 32),
        'print_color' => str_or_null($o['printColor'] ?? null, 16),
        'copies' => int_in($o['copies'] ?? 1, 1, 100000) ?? 1,
        'binding' => str_or_null($o['binding'] ?? null, 32),
        'promo_code' => str_or_null($o['promoCode'] ?? null, 64),
        'promo_discount' => int_in($o['promoDiscount'] ?? null, 0, 100),
        'service_id' => str_or_null($o['serviceId'] ?? null, 64),
        'rejected' => $rejected ? 1 : 0,
        'rejection_reason' => $rejected ? str_or_null($o['rejectionReason'] ?? null, 2000) : null,
        'rejected_at' => $rejected ? (parse_iso((string) ($o['rejectedAt'] ?? '')) ?? ($old['rejected_at'] ?? now_utc())) : null,
        'rating' => int_in($o['rating'] ?? null, 1, 5),
        'rating_comment' => str_or_null($o['ratingComment'] ?? null, 1000),
        'ready_at' => $readyAt,
        // Напоминание «заказ ждёт» — заново, если заказ снова стал готов.
        'ready_reminder_sent' => $becameReady ? 0 : (($o['readyReminderSent'] ?? false) === true ? 1 : (int) ($old['ready_reminder_sent'] ?? 0)),
        'completed_at' => $completedAt,
        'extra' => $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
    ];
    if ($row['extra'] !== null && strlen($row['extra']) > 100000) {
        fail('Слишком много лишних данных в заказе');
    }

    $cols = array_keys($row);
    // Синтаксис «AS new» вместо устаревшего VALUES() (MySQL 8.0.19+).
    $updates = implode(', ', array_map(fn($c) => "$c = new.$c", array_diff($cols, ['id'])));
    $pdo->prepare('INSERT INTO orders (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')'
        . ' AS new ON DUPLICATE KEY UPDATE ' . $updates)
        ->execute(array_values($row));

    // Заказ только что стал оплаченным (в том числе «оплата при получении»,
    // которую отмечает админ) — если клиента кто-то пригласил, пригласившему
    // пора начислить награду. Раньше это считала открытая вкладка админки.
    $justPaid = $payment === 'paid' && ($old['payment_status'] ?? 'unpaid') !== 'paid';
    if ($justPaid) {
        grant_referral_reward($userId);
    }

    // Уведомление на телефон — как раньше делала Cloud Function
    // notifyOrderStatusChange. Тому, кто прямо сейчас на сайте, не шлём.
    // Только при настоящей смене: заведение нового заказа — это не «статус
    // изменился», клиент о нём и так знает.
    if ($old !== null && ($justPaid || $status !== $old['status'])) {
        push_order_status($userId, $id, $status, $justPaid);
    }

    // Telegram клиенту — смена статуса и «брак». Раньше это слала вкладка
    // админки через старый открытый api/telegram_notify.php; теперь сервер
    // сам, адрес чата — из базы (как в chat.php).
    $statusChanged = $old !== null && $status !== $old['status'];
    $justRejected = $rejected && (int) ($old['rejected'] ?? 0) !== 1;
    if ($statusChanged || $justRejected) {
        telegram_order_status($userId, $id, $statusChanged ? $status : null,
            $justRejected ? (string) $row['rejection_reason'] : null);
    }
    if ($justRejected) {
        push_to_user($userId, 'Заказ отклонён', 'Заказ ' . $id . ': ' . (string) $row['rejection_reason']);
    }

    $st->execute([$id]);
    respond(['ok' => true, 'order' => order_public($st->fetch())]);
}

/** Подписи статусов для Telegram — те же, что в админке (getStatusLabel в src/utils.ts). */
const TG_STATUS_LABELS = [
    'pending' => 'Ожидает проверки',
    'approved' => 'Одобрен к печати',
    'printing' => 'Печатается',
    'ready' => 'Готов к выдаче',
    'printed' => 'Выдан клиенту',
];

function telegram_order_status(string $userId, string $orderId, ?string $status, ?string $rejectReason): void
{
    $st = db()->prepare('SELECT telegram_chat_id, telegram_notifications_enabled FROM users WHERE id = ?');
    $st->execute([$userId]);
    $u = $st->fetch();
    if (!$u || (int) $u['telegram_notifications_enabled'] !== 1) {
        return;
    }
    if ($status !== null) {
        notify_user($u['telegram_chat_id'], "🖨 <b>Фото-Север</b>\n\nСтатус заказа " . tg_escape($orderId)
            . ' изменён: <b>' . tg_escape(TG_STATUS_LABELS[$status] ?? $status) . '</b>');
    }
    if ($rejectReason !== null) {
        notify_user($u['telegram_chat_id'], "⚠️ <b>Фото-Север</b>\n\nЗаказ " . tg_escape($orderId)
            . ' отклонён: <b>' . tg_escape($rejectReason) . '</b>');
    }
}

function admin_delete()
{
    $id = str_field('id', 64);
    $pdo = db();
    $st = $pdo->prepare('SELECT user_id FROM orders WHERE id = ?');
    $st->execute([$id]);
    $userId = $st->fetchColumn();
    if ($userId === false) {
        fail('Заказ не найден', 404);
    }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM orders WHERE id = ?')->execute([$id]);
        log_deletion($id, (string) $userId);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    respond(['ok' => true]);
}

// ─────────────────────────── Служебное ───────────────────────────

/** Заказ по номеру. Чужой заказ для клиента выглядит как несуществующий. */
function load_order(string $id, array $user, bool $isAdmin): array
{
    $st = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row || (!$isAdmin && $row['user_id'] !== $user['id'])) {
        fail('Заказ не найден', 404);
    }
    return $row;
}

function log_deletion(string $orderId, string $userId): void
{
    db()->prepare('INSERT INTO order_deletions (order_id, user_id, deleted_at) VALUES (?, ?, ?)')
        ->execute([$orderId, $userId, now_utc()]);
}

/** Заказ в том виде, в каком его ждут сайт и приложение (src/types.ts Order). */
function order_public(array $r): array
{
    $extra = $r['extra'] !== null ? (json_decode($r['extra'], true) ?: []) : [];
    $total = (float) $r['total_cost'];
    $out = array_filter([
        'id' => $r['id'],
        'userId' => $r['user_id'],
        'userName' => $r['user_name'],
        'userEmail' => $r['user_email'],
        'userPhone' => $r['user_phone'],
        'isGuestOrder' => (int) $r['is_guest_order'] === 1 ? true : null,
        'files' => json_decode($r['files'], true) ?: [],
        'orderDate' => iso($r['order_date']),
        'status' => $r['status'],
        'totalCost' => floor($total) === $total ? (int) $total : $total,
        'paymentStatus' => $r['payment_status'],
        'paymentMethod' => $r['payment_method'],
        'transactionId' => $r['transaction_id'],
        'notes' => $r['notes'],
        'paperType' => $r['paper_type'],
        'paperDensity' => $r['paper_density'],
        'photoSize' => $r['photo_size'],
        'printColor' => $r['print_color'],
        'copies' => (int) $r['copies'],
        'completedAt' => iso($r['completed_at']),
        'binding' => $r['binding'],
        'promoCode' => $r['promo_code'],
        'promoDiscount' => $r['promo_discount'] !== null ? (int) $r['promo_discount'] : null,
        'serviceId' => $r['service_id'],
        'rejected' => (int) $r['rejected'] === 1 ? true : null,
        'rejectionReason' => $r['rejection_reason'],
        'rejectedAt' => iso($r['rejected_at']),
        'rating' => $r['rating'] !== null ? (int) $r['rating'] : null,
        'ratingComment' => $r['rating_comment'],
        'readyAt' => iso($r['ready_at']),
        'readyReminderSent' => (int) $r['ready_reminder_sent'] === 1 ? true : null,
    ], fn($v) => $v !== null);
    return $out + $extra;
}

/** Оставляет у файлов только известные поля и проверяет ссылки. */
function clean_files($files, bool $fromClient): array
{
    if (!is_array($files)) {
        fail('Неверный список файлов');
    }
    if (count($files) > MAX_FILES) {
        fail('Слишком много файлов в одном заказе');
    }
    $keys = array_flip(FILE_KEYS);
    $out = [];
    foreach (array_values($files) as $f) {
        if (!is_array($f) || !isset($f['id'], $f['name']) || !is_string($f['id']) || !is_string($f['name'])) {
            fail('Неверный файл в заказе');
        }
        $clean = array_intersect_key($f, $keys);
        foreach (['url', 'previewUrl'] as $k) {
            if (!isset($clean[$k]) || $clean[$k] === '') {
                continue;
            }
            $ok = is_string($clean[$k]) && preg_match($fromClient ? CLIENT_FILE_HOST : '#^https://#', $clean[$k]);
            if (!$ok) {
                if ($k === 'previewUrl') {
                    unset($clean[$k]);
                    continue;
                }
                fail('Файл должен быть загружен на сервер мастерской');
            }
        }
        $out[] = $clean;
    }
    if (strlen(json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) > MAX_FILES_JSON) {
        fail('Слишком большой список файлов');
    }
    return $out;
}

function insert_row(string $table, array $row): void
{
    $cols = array_keys($row);
    db()->prepare('INSERT INTO ' . $table . ' (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')')
        ->execute(array_values($row));
}

function str_or_null($v, int $max): ?string
{
    if (!is_string($v) && !is_int($v) && !is_float($v)) {
        return null;
    }
    $s = mb_substr(trim((string) $v), 0, $max);
    return $s === '' ? null : $s;
}

function int_in($v, int $min, int $max): ?int
{
    if (is_string($v) && preg_match('/^-?\d+$/', $v)) {
        $v = (int) $v;
    }
    if (is_float($v) && floor($v) === $v) {
        $v = (int) $v;
    }
    return is_int($v) && $v >= $min && $v <= $max ? $v : null;
}

/** Сумма в рублях: число от 0 до 1 000 000, до копеек. */
function money($v): ?string
{
    if (is_string($v) && is_numeric($v)) {
        $v = (float) $v;
    }
    if (!is_int($v) && !is_float($v)) {
        return null;
    }
    if ($v < 0 || $v > 1000000 || is_nan((float) $v)) {
        return null;
    }
    return number_format((float) $v, 2, '.', '');
}

