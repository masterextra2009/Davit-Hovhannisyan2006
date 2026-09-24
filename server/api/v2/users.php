<?php
declare(strict_types=1);

// Профили (api/v2/users.php?action=…) — вместо коллекции Firestore users.
//
//   GET  list          — клиенту свой профиль, админу все
//   POST save {user}   — сохранить профиль
//   POST delete {id}   — админ удаляет клиента (обезличивание, см. _erase.php)
//
// Сайт привык писать профиль целиком (setDoc(users/{id}, user)), поэтому и
// здесь принимается весь объект. Но сохраняются только разрешённые поля, и
// набор их разный:
//   • себе можно менять имя, телефон, фото, настройку Telegram-уведомлений и
//     отметку «подарок уже показали»;
//   • админу — плюс подарочный промокод клиента, отметку о награде за
//     приглашение и «Администратор печатает».
// Роль, почта, «гость ли», код приглашения и id не меняются НИКОГДА и ни
// кем: иначе любой клиент мог бы прислать себе role=admin.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_erase.php';

const MAX_USERS = 5000;

$user = require_user();
$isAdmin = $user['role'] === 'admin';

switch ($_GET['action'] ?? '') {
    case 'list':
        require_method('GET');
        list_users($user, $isAdmin);
    case 'save':
        require_method('POST');
        save_user($user, $isAdmin);
    case 'delete':
        require_method('POST');
        require_admin($isAdmin);
        admin_delete_user($user);
    default:
        fail('Неизвестное действие', 404);
}

/** Админ удаляет клиента из клиентской базы. Админов и себя так не удалить. */
function admin_delete_user(array $me)
{
    $id = str_field('id', 64);
    if ($id === '' || $id === $me['id']) {
        fail('Этот аккаунт так не удалить', 400);
    }
    $st = db()->prepare('SELECT role FROM users WHERE id = ? AND deleted_at IS NULL');
    $st->execute([$id]);
    $role = $st->fetchColumn();
    if ($role === false) {
        respond(['ok' => true]); // уже удалён
    }
    if ($role === 'admin') {
        fail('Администратора удалить нельзя', 403);
    }
    erase_user($id);
    respond(['ok' => true]);
}

function list_users(array $user, bool $isAdmin)
{
    if (!$isAdmin) {
        respond(['ok' => true, 'users' => [user_public($user)]]);
    }
    $rows = db()->query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ' . MAX_USERS)->fetchAll();
    respond(['ok' => true, 'users' => array_map('user_public', $rows)]);
}

function save_user(array $me, bool $isAdmin)
{
    $u = body()['user'] ?? null;
    if (!is_array($u)) {
        fail('Нет данных профиля');
    }
    $id = (string) ($u['id'] ?? '');
    if ($id === '') {
        fail('Не указан профиль');
    }
    if (!$isAdmin && $id !== $me['id']) {
        fail('Нет доступа к чужому профилю', 403);
    }

    $pdo = db();
    $st = $pdo->prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL');
    $st->execute([$id]);
    $current = $st->fetch();
    if (!$current) {
        fail('Профиль не найден', 404);
    }

    $set = [];
    $args = [];
    $put = function (string $column, $value) use (&$set, &$args) {
        $set[] = "$column = ?";
        $args[] = $value;
    };

    if (array_key_exists('fullName', $u)) {
        $put('full_name', mb_substr(trim((string) $u['fullName']), 0, 255));
    }
    if (array_key_exists('phone', $u)) {
        $phone = mb_substr(trim((string) $u['phone']), 0, 32);
        $put('phone', $phone !== '' ? $phone : null);
    }
    if (array_key_exists('avatarUrl', $u)) {
        $avatar = mb_substr(trim((string) $u['avatarUrl']), 0, 1024);
        $put('avatar_url', $avatar !== '' ? $avatar : null);
    }
    if (array_key_exists('telegramNotificationsEnabled', $u)) {
        $put('telegram_notifications_enabled', $u['telegramNotificationsEnabled'] ? 1 : 0);
    }
    // Согласие на новости и акции. Каждое включение и выключение
    // записывается в историю согласий: по закону надо уметь показать,
    // когда человек согласился и когда отозвал (152-ФЗ, 38-ФЗ).
    if (array_key_exists('marketingConsent', $u)) {
        $wants = $u['marketingConsent'] ? 1 : 0;
        $put('marketing_consent', $wants);
        if ((int) ($current['marketing_consent'] ?? 0) !== $wants) {
            $pdo->prepare(
                'INSERT INTO consents (user_id, kind, granted, doc_version, source, ip)
                 VALUES (?, ?, ?, ?, ?, ?)'
            )->execute([
                $id,
                'marketing',
                $wants,
                str_field('consentVersion', 32),
                str_field('source', 8) === 'app' ? 'app' : 'site',
                client_ip(),
            ]);
        }
    }
    if (array_key_exists('promoGiftedSeen', $u)) {
        $put('promo_gifted_seen', $u['promoGiftedSeen'] ? 1 : 0);
    }

    if ($isAdmin) {
        // Подарок промокода из админки.
        if (array_key_exists('promoCode', $u)) {
            $code = mb_substr(trim((string) $u['promoCode']), 0, 64);
            $put('promo_code', $code !== '' ? $code : null);
        }
        if (array_key_exists('promoDiscount', $u)) {
            $discount = (int) $u['promoDiscount'];
            $put('promo_discount', ($discount > 0 && $discount <= 100) ? $discount : null);
        }
        if (array_key_exists('promoExpiresAt', $u)) {
            $put('promo_expires_at', parse_iso((string) $u['promoExpiresAt']));
        }
        if (array_key_exists('referralRewardGranted', $u)) {
            $put('referral_reward_granted', $u['referralRewardGranted'] ? 1 : 0);
        }
        // «Администратор печатает»: пустая строка — погасить.
        if (array_key_exists('adminTypingAt', $u)) {
            $put('admin_typing_at', parse_iso((string) $u['adminTypingAt']));
        }
    }

    if ($set) {
        $args[] = $id;
        $pdo->prepare('UPDATE users SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($args);
    }

    $st->execute([$id]);
    respond(['ok' => true, 'user' => user_public($st->fetch())]);
}
