<?php
declare(strict_types=1);

// Цена заказа на сервере — одна для сайта, приложения и оплаты.
//
// Правила повторяют сайт (Dashboard.tsx: handlePlaceOrder, a3FilePrice,
// bindingFeePerCopy, collagePriceFor, getActiveDiscountPercent) и приложение
// (orders.ts). Сумму, присланную сайтом или приложением, сервер не берёт —
// считает сам: иначе заказ за 1000 ₽ можно было бы оформить и оплатить как
// заказ за 1 ₽. Сайт и приложение цену только показывают.
//
// Цветная страница А4 — 25 ₽ (заливка до 20%) или 65 ₽: среднего тарифа
// 40 ₽ нет с 10.09.2026 (решение Давида, см. orders.ts в приложении).
//
// Цены печати Давид меняет в админке (17.10.2026): они лежат в базе
// (app_settings, запись print_prices) и отдаются сайту и приложению через
// misc.php?action=prices. Здесь — цены по умолчанию: ими считаем, если в
// базе ещё ничего не сохранено или база не ответила, — заказы не встают.
// Без базы (db() не подключён) файл по-прежнему можно проверить отдельно.

const PRINT_PRICES_DEFAULT = [
    'photo_10x15' => 20,
    'photo_polaroid' => 30,
    'photo_13x18' => 50,
    'photo_15x21' => 70,
    'photo_20x30' => 100,
    'photo_30x40' => 250,
    'collage_plain' => 65,
    'collage_photo' => 100,
    'a4_bw' => 20,
    'a4_color_light' => 25,
    'a4_color_full' => 65,
    'a3_photo' => 250,
    'a3_bw_80' => 70,
    'a3_bw_200' => 100,
    'a3_color_80' => 100,
    'a3_color_200' => 150,
    'staple' => 15,
    'file_a4' => 5,
    'file_a3' => 10,
    'spring_metal_50' => 350,
    'spring_metal_more' => 450,
    'spring_plastic_50' => 250,
    'spring_plastic_90' => 350,
    'spring_plastic_more' => 450,
    'hard_cover' => 450,
];
/** Заливка цветом, %, до которой страница считается «немного цвета». */
const COLOR_FILL_THRESHOLD = 20;

/**
 * Присланные цены → только известные ключи, целые рубли 0…100 000.
 * Неизвестное и испорченное отбрасываем — вместо него цена по умолчанию.
 */
function clean_print_prices($raw): array
{
    $out = [];
    if (!is_array($raw)) {
        return $out;
    }
    foreach (PRINT_PRICES_DEFAULT as $key => $_) {
        $v = $raw[$key] ?? null;
        if (is_numeric($v) && (float) $v >= 0 && (float) $v <= 100000) {
            $out[$key] = (int) round((float) $v);
        }
    }
    return $out;
}

/** Действующие цены печати: из базы поверх цен по умолчанию. */
function print_prices(): array
{
    static $prices = null;
    if ($prices !== null) {
        return $prices;
    }
    $saved = [];
    if (function_exists('db')) {
        try {
            $st = db()->prepare("SELECT value FROM app_settings WHERE name = 'print_prices'");
            $st->execute();
            $json = $st->fetchColumn();
            $saved = $json === false ? [] : clean_print_prices(json_decode((string) $json, true));
        } catch (Throwable $e) {
            // Таблицы ещё нет или база не ответила — считаем по умолчанию.
            $saved = [];
        }
    }
    $prices = array_merge(PRINT_PRICES_DEFAULT, $saved);
    return $prices;
}

function print_price(string $key): int
{
    return print_prices()[$key];
}
/**
 * Архив из нескольких файлов: цену содержимого считает браузер клиента.
 * Проверить её сервер пока не может, но меньше 20 ₽ за файл внутри — самой
 * дешёвой печати — архив стоить не может ни при каких настройках.
 */
const BUNDLE_MIN_PER_FILE = 20;
/**
 * Общих промокодов нет: 16.09.2026 Давид убрал все (PROMO10, STUDENT15,
 * WELCOME5, FIRSTFREE, COPYMAX) — «даю только я лично». Скидку даёт только
 * личный код клиента из админки. Появится общий код — вписать сюда.
 */
const FIXED_PROMO_CODES = [];

/**
 * Отделка за одну копию. Файлик: 5 ₽ за А4, 10 ₽ за А3 — лист А3 кладут
 * в большой файл (решение Давида 24.09.2026).
 */
function binding_fee_per_copy(string $binding, int $pages, bool $a3 = false): int
{
    switch ($binding) {
        case 'staple':
            return print_price('staple');
        case 'file':
            return print_price($a3 ? 'file_a3' : 'file_a4');
        case 'spring_metal':
            return print_price($pages <= 50 ? 'spring_metal_50' : 'spring_metal_more');
        case 'spring_plastic':
            return print_price($pages <= 50 ? 'spring_plastic_50' : ($pages <= 90 ? 'spring_plastic_90' : 'spring_plastic_more'));
        case 'hard_cover':
            return print_price('hard_cover');
        default:
            return 0;
    }
}

/** Цена одного файла заказа со всеми его копиями. */
function file_price(array $f): int
{
    $copies = max(1, (int) ($f['fileCopies'] ?? 1));
    $pages = max(1, (int) ($f['pageCount'] ?? 1));

    if (isset($f['bundleFixedPrice']) && is_numeric($f['bundleFixedPrice'])) {
        $count = max(1, (int) ($f['bundleFileCount'] ?? 1));
        return max((int) round((float) $f['bundleFixedPrice']), $count * BUNDLE_MIN_PER_FILE);
    }

    $paper = $f['paperType'] ?? 'plain';
    if ($paper === 'collage') {
        return print_price(($f['collagePaper'] ?? 'plain') === 'photo' ? 'collage_photo' : 'collage_plain') * $copies;
    }
    if ($paper === 'photo') {
        $size = (string) ($f['photoSize'] ?? '10x15');
        return (print_prices()['photo_' . $size] ?? print_price('photo_10x15')) * $copies;
    }

    $format = $f['format'] ?? 'a4';
    if ($format === 'a3') {
        if (($f['a3Kind'] ?? '') === 'photo') {
            $perSheet = print_price('a3_photo');
        } else {
            $color = ($f['printColor'] ?? 'bw') === 'color' ? 'color' : 'bw';
            $weight = ($f['a3PaperWeight'] ?? '80') === '200' ? '200' : '80';
            $perSheet = print_price("a3_{$color}_{$weight}");
        }
        return $perSheet * $pages * $copies;
    }
    if ($format === 'binding') {
        return (empty($f['bindingKind']) ? 0 : binding_fee_per_copy((string) $f['bindingKind'], $pages)) * $copies;
    }

    // Документ А4
    if (($f['printColor'] ?? 'bw') === 'bw') {
        $perPage = print_price('a4_bw');
    } else {
        $tier = $f['colorTier'] ?? null; // приложение: клиент выбрал тариф словами
        if ($tier === 'color_light') {
            $perPage = print_price('a4_color_light');
        } elseif ($tier === 'color_full') {
            $perPage = print_price('a4_color_full');
        } else {
            $fill = is_numeric($f['colorFillPercent'] ?? null) ? (float) $f['colorFillPercent'] : 50;
            $perPage = print_price($fill <= COLOR_FILL_THRESHOLD ? 'a4_color_light' : 'a4_color_full');
        }
    }
    return $perPage * $pages * $copies;
}

/**
 * Итог заказа в рублях: файлы + отделка на весь заказ, минус скидка по
 * промокоду, плюс услуга из витрины (на услугу скидка не действует — как на сайте).
 */
function order_price(array $files, ?string $binding, int $discountPercent, int $serviceExtra): int
{
    // Заказ на услугу из витрины: приложенный файл — это материал для неё
    // (картинка на кружку, макет), а не отдельная печать. Считать его ещё и
    // страницей А4 значит взять с человека дважды: 17.09.2026 так и вышло —
    // кружка 800 ₽ превратилась в 865 ₽ (заказ ORD-1067).
    if ($serviceExtra > 0) {
        return $serviceExtra;
    }

    $subtotal = 0;
    $totalPages = 0;
    foreach ($files as $f) {
        $subtotal += file_price($f);
        $totalPages += max(1, (int) ($f['pageCount'] ?? 1));
    }
    if ($files && $binding !== null && $binding !== 'none') {
        $copies = max(1, (int) ($files[0]['fileCopies'] ?? 1));
        $hasA3 = false;
        foreach ($files as $f) {
            if (($f['format'] ?? 'a4') === 'a3') {
                $hasA3 = true;
            }
        }
        $subtotal += binding_fee_per_copy($binding, $totalPages, $hasA3) * $copies;
    }
    $total = $discountPercent > 0 ? (int) round($subtotal * (1 - $discountPercent / 100)) : $subtotal;
    return max(0, $total) + max(0, $serviceExtra);
}

/** Скидка по промокоду, %: общий код или персональный код клиента (если не истёк). */
function promo_percent(?string $code, array $user): int
{
    if ($code === null || $code === '') {
        return 0;
    }
    $code = mb_strtoupper(trim($code));
    if (isset(FIXED_PROMO_CODES[$code])) {
        return FIXED_PROMO_CODES[$code];
    }
    $own = $user['promo_code'] ?? null;
    if ($own !== null && mb_strtoupper(trim((string) $own)) === $code) {
        $expires = $user['promo_expires_at'] ?? null;
        if ($expires !== null && strtotime($expires . ' UTC') < time()) {
            return 0;
        }
        $d = (int) ($user['promo_discount'] ?? 0);
        return $d >= 1 && $d <= 100 ? $d : 0;
    }
    return 0;
}

/**
 * Уровни клиента (решение Давида 27.09.2026): порог — сумма оплаченных
 * заказов в рублях, скидка — в процентах. Ниже первого порога уровня нет.
 * Эти же числа — в src/utils.ts сайта и в loyalty.ts приложения.
 */
const LOYALTY_TIERS = [
    ['code' => 'bronze',   'name' => 'Бронзовый',  'from' => 2000,  'percent' => 5],
    ['code' => 'silver',   'name' => 'Серебряный', 'from' => 10000, 'percent' => 10],
    ['code' => 'gold',     'name' => 'Золотой',    'from' => 25000, 'percent' => 15],
    ['code' => 'platinum', 'name' => 'Платиновый', 'from' => 50000, 'percent' => 20],
];

/** Уровень по оплаченной сумме; null — уровня ещё нет. */
function loyalty_tier(float $paidRub): ?array
{
    $tier = null;
    foreach (LOYALTY_TIERS as $t) {
        if ($paidRub >= $t['from']) {
            $tier = $t;
        }
    }
    return $tier;
}

/**
 * Какая скидка действует на заказ: промокод или уровень — бо́льшая из двух,
 * не сумма (иначе 20 % уровня + 20 % промокода увели бы печать в минус).
 * Возвращает [процент, источник: 'promo' | 'loyalty' | null].
 */
function best_discount(int $promoPercent, int $loyaltyPercent): array
{
    if ($promoPercent <= 0 && $loyaltyPercent <= 0) {
        return [0, null];
    }
    return $promoPercent >= $loyaltyPercent ? [$promoPercent, 'promo'] : [$loyaltyPercent, 'loyalty'];
}
