<?php
declare(strict_types=1);

// Онлайн-оплата заказов через ЮKassa (api/v2/payments.php?action=…).
//
//   POST create  {orderId}        (вход обязателен) → {paymentUrl, paymentId} или {paid: true}
//   GET  status  &orderId=ORD-…   (вход обязателен) → {paymentStatus}
//   POST webhook                  уведомление ЮKassa; адрес указывается в её кабинете:
//                                 https://sever-18.ru/api/v2/payments.php?action=webhook
//
// Сумма платежа — только из заказа в базе: её посчитал сервер при создании
// заказа (_pricing.php). «Оплачено» ставит только сервер и только после того,
// как сам переспросил у ЮKassa, что платёж настоящий, относится к этому заказу
// и сумма совпадает. Уведомлению самому по себе не верим — его может прислать
// кто угодно.
//
// Чек (54-ФЗ) ЮKassa отправляет клиенту на почту или телефон — без контакта
// платёж не создаётся. Ставка НДС в чеке — «без НДС» (vat_code 1), как было;
// уточнить у бухгалтера при смене налогового режима.
//
// Ключи магазина — в .sever18-private/yookassa.php, в код не копируются.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_telegram.php';

const PAYMENT_RETURN_URL = 'https://sever-18.ru/?payment=success&order=';
const YOOKASSA_API = 'https://api.yookassa.ru/v3/payments';
const PAYMENT_METHOD_ONLINE = 'ЮKassa';

$action = $_GET['action'] ?? '';
switch ($action) {
    case 'create':
        require_method('POST');
        $RATE_LIMIT_MAX = 20;
        $RATE_LIMIT_WINDOW = 300;
        require __DIR__ . '/../rate-limit.php';
        create_payment(require_user());
    case 'status':
        require_method('GET');
        payment_status(require_user());
    case 'webhook':
        require_method('POST');
        webhook();
    default:
        fail('Неизвестное действие', 404);
}

function create_payment(array $user)
{
    $order = own_order(str_field('orderId', 64), $user);
    if ($order['payment_status'] === 'paid') {
        respond(['ok' => true, 'paid' => true]);
    }
    if ((int) $order['rejected'] === 1) {
        fail('Заказ отклонён мастерской — оплата недоступна', 409);
    }
    $amount = (float) $order['total_cost'];
    if ($amount <= 0) {
        fail('Сумма заказа не определена — оплатите при получении', 400);
    }
    $cfg = yookassa_config();
    if ($cfg === null) {
        fail('Онлайн-оплата временно недоступна. Заказ можно оплатить при получении.', 503);
    }

    // Платёж по заказу уже начат — не создаём второй: либо он уже прошёл,
    // либо клиент просто вернулся к оплате.
    if ($order['transaction_id'] !== null) {
        $existing = yookassa($cfg, 'GET', YOOKASSA_API . '/' . rawurlencode($order['transaction_id']));
        if ($existing !== null) {
            if (($existing['status'] ?? '') === 'succeeded') {
                $result = apply_payment($order, $existing, false);
                respond(['ok' => true, 'paid' => $result === 'paid' || $result === 'already_paid', 'status' => $result]);
            }
            $url = $existing['confirmation']['confirmation_url'] ?? '';
            if (($existing['status'] ?? '') === 'pending' && $url !== '' && same_amount($existing, $amount)) {
                respond(['ok' => true, 'paymentId' => $existing['id'], 'paymentUrl' => $url]);
            }
        }
    }

    $customer = receipt_customer($user, $order);
    if ($customer === null) {
        fail('Для электронного чека нужна почта или телефон. Укажите их в профиле и попробуйте снова.', 400);
    }
    $value = number_format($amount, 2, '.', '');
    $payment = yookassa($cfg, 'POST', YOOKASSA_API, [
        'amount' => ['value' => $value, 'currency' => 'RUB'],
        'confirmation' => ['type' => 'redirect', 'return_url' => PAYMENT_RETURN_URL . rawurlencode($order['id'])],
        'capture' => true,
        'description' => 'Заказ №' . $order['id'] . ' — Фото-Север',
        'metadata' => ['order_id' => $order['id']],
        'receipt' => [
            'customer' => $customer,
            'items' => [[
                'description' => 'Услуги печати — заказ №' . $order['id'],
                'quantity' => '1.00',
                'amount' => ['value' => $value, 'currency' => 'RUB'],
                'vat_code' => 1,
                'payment_mode' => 'full_payment',
                'payment_subject' => 'service',
            ]],
        ],
    ], 'order-' . $order['id'] . '-' . bin2hex(random_bytes(8)));

    $url = $payment['confirmation']['confirmation_url'] ?? '';
    if ($payment === null || $url === '' || empty($payment['id'])) {
        fail('Не удалось создать платёж. Попробуйте ещё раз или оплатите при получении.', 502);
    }
    db()->prepare('UPDATE orders SET transaction_id = ?, payment_method = ? WHERE id = ?')
        ->execute([$payment['id'], PAYMENT_METHOD_ONLINE, $order['id']]);
    respond(['ok' => true, 'paymentId' => $payment['id'], 'paymentUrl' => $url]);
}

/**
 * Состояние оплаты. Если уведомление ЮKassa задержалось, а клиент уже
 * вернулся с оплаты — сервер сам переспросит ЮKassa.
 */
function payment_status(array $user)
{
    $order = own_order((string) ($_GET['orderId'] ?? ''), $user);
    if ($order['payment_status'] !== 'paid' && $order['transaction_id'] !== null && ($cfg = yookassa_config()) !== null) {
        $payment = yookassa($cfg, 'GET', YOOKASSA_API . '/' . rawurlencode($order['transaction_id']));
        if ($payment !== null && ($payment['status'] ?? '') === 'succeeded') {
            apply_payment($order, $payment, false);
            $order = own_order($order['id'], $user);
        }
    }
    respond(['ok' => true, 'orderId' => $order['id'], 'paymentStatus' => $order['payment_status']]);
}

function webhook()
{
    $event = body();
    $paymentId = (string) ($event['object']['id'] ?? '');
    if (($event['event'] ?? '') !== 'payment.succeeded' || !preg_match('/^[0-9a-f-]{20,64}$/', $paymentId)) {
        respond(['status' => 'ignored']);
    }
    $cfg = yookassa_config();
    if ($cfg === null) {
        // Не 200: ЮKassa повторит уведомление, когда ключи будут вписаны.
        error_log('api/v2 payments webhook: yookassa is not configured');
        respond(['status' => 'not_configured'], 503);
    }
    $payment = yookassa($cfg, 'GET', YOOKASSA_API . '/' . rawurlencode($paymentId));
    if ($payment === null) {
        respond(['status' => 'verify_failed'], 502);
    }
    if (($payment['status'] ?? '') !== 'succeeded') {
        respond(['status' => 'not_succeeded']);
    }

    $orderId = (string) ($payment['metadata']['order_id'] ?? '');
    $st = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $st->execute([$orderId]);
    $order = $st->fetch();
    if (!$order) {
        notify_admin("⚠️ <b>Оплата без заказа</b>\n\n"
            . '💳 ' . tg_escape((string) ($payment['amount']['value'] ?? '?')) . " ₽\n"
            . '📋 Заказ: <b>' . tg_escape($orderId) . "</b> — в базе его нет\n"
            . '🆔 Платёж ЮKassa: <code>' . tg_escape($paymentId) . "</code>\n\n"
            . 'Деньги списаны — проверьте в кабинете ЮKassa.');
        respond(['status' => 'order_not_found']);
    }
    respond(['status' => apply_payment($order, $payment, true)]);
}

/**
 * Отмечает заказ оплаченным, если платёж относится к нему и сумма совпала.
 * Сообщение админу уходит один раз — ровно при смене «не оплачен» → «оплачен».
 */
function apply_payment(array $order, array $payment, bool $fromWebhook): string
{
    if (($payment['metadata']['order_id'] ?? '') !== $order['id'] || ($payment['status'] ?? '') !== 'succeeded') {
        return 'wrong_payment';
    }
    if ($order['payment_status'] === 'paid') {
        return 'already_paid';
    }
    $pdo = db();
    $expected = (float) $order['total_cost'];
    if (!same_amount($payment, $expected)) {
        $pdo->prepare('UPDATE orders SET transaction_id = ? WHERE id = ?')->execute([$payment['id'], $order['id']]);
        if ($fromWebhook) {
            notify_admin("⚠️ <b>Сумма платежа не совпала с ценой заказа</b>\n\n"
                . '📋 Заказ: <b>' . tg_escape($order['id']) . "</b>\n"
                . '👤 Клиент: <b>' . tg_escape($order['user_name']) . "</b>\n"
                . '💳 Оплачено: <b>' . tg_escape((string) ($payment['amount']['value'] ?? '?')) . " ₽</b>\n"
                . '🧾 Цена заказа: <b>' . tg_escape(number_format($expected, 2, '.', '')) . " ₽</b>\n"
                . '🆔 Платёж ЮKassa: <code>' . tg_escape((string) $payment['id']) . "</code>\n\n"
                . 'Заказ НЕ отмечен оплаченным. Деньги списаны — проверьте и зачтите оплату в админке.');
        }
        return 'amount_mismatch';
    }
    $upd = $pdo->prepare("UPDATE orders SET payment_status = 'paid', transaction_id = ?, payment_method = ? WHERE id = ? AND payment_status <> 'paid'");
    $upd->execute([$payment['id'], PAYMENT_METHOD_ONLINE, $order['id']]);
    if ($upd->rowCount() === 1) {
        $files = json_decode((string) $order['files'], true) ?: [];
        notify_admin("🔔 <b>Новый оплаченный заказ!</b>\n\n"
            . '📋 Заказ: <b>' . tg_escape($order['id']) . "</b>\n"
            . '👤 Клиент: <b>' . tg_escape($order['user_name']) . "</b>\n"
            . '📁 Файлов: <b>' . count($files) . "</b>\n"
            . '💰 Сумма: <b>' . tg_escape(number_format($expected, 0, '.', ' ')) . " ₽</b>\n\n"
            . '🖨 <a href="https://sever-18.ru">Открыть админку</a>');
        return 'paid';
    }
    return 'already_paid';
}

// ─────────────────────────── Служебное ───────────────────────────

function own_order(string $id, array $user): array
{
    $st = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $st->execute([$id]);
    $order = $st->fetch();
    if (!$order || $order['user_id'] !== $user['id']) {
        fail('Заказ не найден', 404);
    }
    return $order;
}

function same_amount(array $payment, float $expected): bool
{
    return ($payment['amount']['currency'] ?? '') === 'RUB'
        && abs((float) ($payment['amount']['value'] ?? -1) - $expected) < 0.01;
}

/** Куда ЮKassa отправит чек: почта клиента, иначе телефон. */
function receipt_customer(array $user, array $order): ?array
{
    foreach ([$user['email'] ?? null, $order['user_email'] ?? null] as $email) {
        if (is_string($email) && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['email' => $email];
        }
    }
    foreach ([$user['phone'] ?? null, $order['user_phone'] ?? null] as $phone) {
        $digits = preg_replace('/\D/', '', (string) $phone);
        if (strlen($digits) === 11 && ($digits[0] === '7' || $digits[0] === '8')) {
            return ['phone' => '7' . substr($digits, 1)];
        }
        if (strlen($digits) === 10 && $digits[0] === '9') {
            return ['phone' => '7' . $digits];
        }
    }
    return null;
}

function yookassa_config(): ?array
{
    static $cfg = false;
    if ($cfg === false) {
        $file = SITE_DIR . '/../.sever18-private/yookassa.php';
        $c = is_readable($file) ? (require $file) : null;
        $cfg = is_array($c) && !empty($c['shop_id']) && !empty($c['secret_key']) ? $c : null;
    }
    return $cfg;
}

function yookassa(array $cfg, string $method, string $url, ?array $payload = null, ?string $idempotenceKey = null): ?array
{
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($idempotenceKey !== null) {
        $headers[] = 'Idempotence-Key: ' . $idempotenceKey;
    }
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_USERPWD => $cfg['shop_id'] . ':' . $cfg['secret_key'],
        CURLOPT_HTTPHEADER => $headers,
    ];
    if ($method === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if ($code !== 200 || !is_array($data)) {
        error_log('api/v2 yookassa ' . $method . ' HTTP ' . $code . ' ' . mb_substr((string) ($data['description'] ?? ''), 0, 200));
        return null;
    }
    return $data;
}
