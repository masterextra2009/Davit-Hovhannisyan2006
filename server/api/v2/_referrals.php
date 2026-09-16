<?php
declare(strict_types=1);

// Приглашения («Пригласите друга») на своём сервере — вместо коллекции
// Firestore referralCodes и подсчёта награды в браузере админки.
//
// Как это работает у клиента:
//   1. У каждого зарегистрированного есть свой код — первые 6 знаков его id
//      заглавными. Ссылка вида https://sever-18.ru/?ref=КОД.
//   2. Друг регистрируется с этим кодом и сразу получает скидку 10% на 30 дней.
//   3. Пригласивший получает такую же скидку, когда у друга появляется первый
//      ОПЛАЧЕННЫЙ заказ.
//
// Что изменилось по сравнению с Firebase: награду выдаёт сервер в момент
// оплаты. Раньше её начисляла открытая вкладка админки — пока Давид не зашёл
// в панель, приглашённый друг платил, а пригласивший скидки не видел.

const REFERRAL_PROMO_CODE = 'ДРУГ10';
const REFERRAL_PROMO_DISCOUNT = 10;
const REFERRAL_PROMO_DAYS = 30;

/** Свой код приглашения: первые 6 знаков id заглавными (как на сайте). */
function referral_code_for(string $userId): string
{
    return strtoupper(substr($userId, 0, 6));
}

/**
 * Записывает код в обратный указатель «код → кто пригласил». Отдельная
 * таблица, а не поиск по users: так же было в Firestore, и по коду нельзя
 * прочитать чужой профиль целиком.
 *
 * Совпадение кодов у двух разных людей крайне маловероятно (6 знаков из 62),
 * но если случится — второму выдаём код подлиннее, вместо того чтобы молча
 * отдать его приглашённых первому.
 */
function register_referral_code(PDO $pdo, string $userId): string
{
    for ($len = 6; $len <= 12; $len++) {
        $code = strtoupper(substr($userId, 0, $len));
        $st = $pdo->prepare('SELECT user_id FROM referral_codes WHERE code = ?');
        $st->execute([$code]);
        $owner = $st->fetchColumn();
        if ($owner === false) {
            $pdo->prepare('INSERT INTO referral_codes (code, user_id) VALUES (?, ?)')->execute([$code, $userId]);
            $pdo->prepare('UPDATE users SET referral_code = ? WHERE id = ?')->execute([$code, $userId]);
            return $code;
        }
        if ($owner === $userId) {
            $pdo->prepare('UPDATE users SET referral_code = ? WHERE id = ?')->execute([$code, $userId]);
            return $code;
        }
    }
    return '';
}

/**
 * Новичок пришёл по чужому коду: запоминаем, кто его позвал, и дарим скидку.
 * Возвращает поля подарка, чтобы их можно было показать сразу после входа.
 *
 * Свой собственный код не считается: иначе приглашение превращается в кнопку
 * «выдать себе скидку».
 */
function apply_invite(PDO $pdo, string $newUserId, string $codeInput): array
{
    $code = strtoupper(trim($codeInput));
    if ($code === '') {
        return [];
    }
    $st = $pdo->prepare('SELECT r.user_id FROM referral_codes r JOIN users u ON u.id = r.user_id
                         WHERE r.code = ? AND u.deleted_at IS NULL');
    $st->execute([$code]);
    $referrerId = $st->fetchColumn();
    if ($referrerId === false || $referrerId === $newUserId) {
        return [];
    }

    $expires = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify('+' . REFERRAL_PROMO_DAYS . ' days')->format('Y-m-d H:i:s.v');
    $pdo->prepare('UPDATE users SET referred_by = ?, promo_code = ?, promo_discount = ?, promo_expires_at = ?, promo_gifted_seen = 0
                   WHERE id = ?')
        ->execute([$referrerId, REFERRAL_PROMO_CODE, REFERRAL_PROMO_DISCOUNT, $expires, $newUserId]);

    return [
        'referredBy' => $referrerId,
        'promoCode' => REFERRAL_PROMO_CODE,
        'promoDiscount' => REFERRAL_PROMO_DISCOUNT,
        'promoExpiresAt' => iso($expires),
    ];
}

/**
 * У приглашённого появился первый оплаченный заказ — дарим скидку тому, кто
 * его позвал. Флаг стоит на приглашённом, поэтому второй оплаченный заказ
 * награду не повторит.
 *
 * Вызывается там, где заказ становится оплаченным: и при оплате картой
 * (payments.php), и когда оплату отмечает админ (orders.php).
 */
function grant_referral_reward(string $userId): void
{
    $pdo = db();
    $st = $pdo->prepare('SELECT referred_by, referral_reward_granted FROM users WHERE id = ?');
    $st->execute([$userId]);
    $row = $st->fetch();
    if (!$row || !$row['referred_by'] || (int) $row['referral_reward_granted'] === 1) {
        return;
    }

    // Флаг ставим сразу и только если он ещё не стоял: два одновременных
    // подтверждения оплаты не должны выдать награду дважды.
    $mark = $pdo->prepare('UPDATE users SET referral_reward_granted = 1 WHERE id = ? AND referral_reward_granted = 0');
    $mark->execute([$userId]);
    if ($mark->rowCount() !== 1) {
        return;
    }

    $expires = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify('+' . REFERRAL_PROMO_DAYS . ' days')->format('Y-m-d H:i:s.v');
    $pdo->prepare('UPDATE users SET promo_code = ?, promo_discount = ?, promo_expires_at = ?, promo_gifted_seen = 0
                   WHERE id = ? AND deleted_at IS NULL')
        ->execute([REFERRAL_PROMO_CODE, REFERRAL_PROMO_DISCOUNT, $expires, $row['referred_by']]);
}
