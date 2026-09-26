<?php
declare(strict_types=1);

// Удаление аккаунта — одно на двоих: клиент удаляет себя сам (auth.php
// delete-account, 152-ФЗ ст. 14) и админ удаляет клиента из клиентской базы
// (users.php delete; Давид 24.09.2026: «в админке с клиентской базы не могу
// удалять»). Делают они одно и то же, поэтому и код один.
//
// Профиль помечается удалённым и обезличивается, входы обрываются, чат,
// уведомления и код приглашения удаляются. Заказы остаются: на них держится
// бухгалтерия и чеки ЮKassa — но без имени, почты и телефона. Файлы заказов
// чистит уборщик по сроку.

function erase_user(string $id): void
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE orders SET user_name = ?, user_email = ?, user_phone = NULL WHERE user_id = ?')
            ->execute(['Удалённый аккаунт', '', $id]);
        $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM push_devices WHERE user_id = ?')->execute([$id]);
        $pdo->prepare(
            "UPDATE users SET email = NULL, full_name = '', phone = NULL, avatar_url = NULL,
                    password_hash = NULL, telegram_chat_id = NULL, telegram_username = NULL,
                    telegram_notifications_enabled = 0, expo_push_token = NULL, push_subscription = NULL,
                    promo_code = NULL, promo_discount = NULL, promo_expires_at = NULL,
                    referral_code = NULL, deleted_at = ?
             WHERE id = ?"
        )->execute([now_utc(), $id]);
        // Отзыв оставляем админу, но без имени и почты — сам текст это уже не
        // персональные данные, а привязка к человеку — да.
        $pdo->prepare("UPDATE feedback SET user_name = 'Удалённый аккаунт', user_email = '' WHERE user_id = ?")
            ->execute([$id]);
        $pdo->prepare('DELETE FROM chat_messages WHERE user_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM notifications WHERE user_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM referral_codes WHERE user_id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_log('api/v2 erase_user: ' . $e->getMessage());
        fail('Не удалось удалить аккаунт. Попробуйте ещё раз.', 500);
    }
}
