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
// Файл без обращения к базе: его можно проверить отдельно.

const PHOTO_SIZE_PRICES = ['10x15' => 20, 'polaroid' => 30, '13x18' => 50, '15x21' => 70, '20x30' => 100, '30x40' => 250];
const COLLAGE_PRICE_PLAIN = 65;
const COLLAGE_PRICE_PHOTO = 100;
const A4_BW = 20;
const A4_COLOR_LIGHT = 25;
const A4_COLOR_FULL = 65;
/** Заливка цветом, %, до которой страница считается «немного цвета». */
const COLOR_FILL_THRESHOLD = 20;
const A3_PHOTO = 250;
const A3_CHERTYOZH = ['bw' => ['80' => 70, '200' => 100], 'color' => ['80' => 100, '200' => 150]];
/**
 * Архив из нескольких файлов: цену содержимого считает браузер клиента.
 * Проверить её сервер пока не может, но меньше 20 ₽ за файл внутри — самой
 * дешёвой печати — архив стоить не может ни при каких настройках.
 */
const BUNDLE_MIN_PER_FILE = 20;
/** Общие промокоды, как на сайте. */
const FIXED_PROMO_CODES = ['PROMO10' => 10, 'STUDENT15' => 15, 'WELCOME5' => 5, 'FIRSTFREE' => 20, 'COPYMAX' => 50];

function binding_fee_per_copy(string $binding, int $pages): int
{
    switch ($binding) {
        case 'staple':
            return 15;
        case 'file':
            return 5;
        case 'spring_metal':
            return $pages <= 50 ? 350 : 450;
        case 'spring_plastic':
            return $pages <= 50 ? 250 : ($pages <= 90 ? 350 : 450);
        case 'hard_cover':
            return 450;
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
        return (($f['collagePaper'] ?? 'plain') === 'photo' ? COLLAGE_PRICE_PHOTO : COLLAGE_PRICE_PLAIN) * $copies;
    }
    if ($paper === 'photo') {
        $size = (string) ($f['photoSize'] ?? '10x15');
        return (PHOTO_SIZE_PRICES[$size] ?? PHOTO_SIZE_PRICES['10x15']) * $copies;
    }

    $format = $f['format'] ?? 'a4';
    if ($format === 'a3') {
        if (($f['a3Kind'] ?? '') === 'photo') {
            $perSheet = A3_PHOTO;
        } else {
            $color = ($f['printColor'] ?? 'bw') === 'color' ? 'color' : 'bw';
            $weight = ($f['a3PaperWeight'] ?? '80') === '200' ? '200' : '80';
            $perSheet = A3_CHERTYOZH[$color][$weight];
        }
        return $perSheet * $pages * $copies;
    }
    if ($format === 'binding') {
        return (empty($f['bindingKind']) ? 0 : binding_fee_per_copy((string) $f['bindingKind'], $pages)) * $copies;
    }

    // Документ А4
    if (($f['printColor'] ?? 'bw') === 'bw') {
        $perPage = A4_BW;
    } else {
        $tier = $f['colorTier'] ?? null; // приложение: клиент выбрал тариф словами
        if ($tier === 'color_light') {
            $perPage = A4_COLOR_LIGHT;
        } elseif ($tier === 'color_full') {
            $perPage = A4_COLOR_FULL;
        } else {
            $fill = is_numeric($f['colorFillPercent'] ?? null) ? (float) $f['colorFillPercent'] : 50;
            $perPage = $fill <= COLOR_FILL_THRESHOLD ? A4_COLOR_LIGHT : A4_COLOR_FULL;
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
    $subtotal = 0;
    $totalPages = 0;
    foreach ($files as $f) {
        $subtotal += file_price($f);
        $totalPages += max(1, (int) ($f['pageCount'] ?? 1));
    }
    if ($files && $binding !== null && $binding !== 'none') {
        $copies = max(1, (int) ($files[0]['fileCopies'] ?? 1));
        $subtotal += binding_fee_per_copy($binding, $totalPages) * $copies;
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
