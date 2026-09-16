<?php
declare(strict_types=1);

// Приглашения: что показывать клиенту в карточке «Пригласите друга»
// (api/v2/referrals.php?action=…). Сама механика — в _referrals.php.
//
//   GET info → {code, link, invitedCount, rewardedCount}
//
// Код заводится здесь же, если его почему-то нет: так было и на сайте —
// клиентам, зарегистрированным до появления программы, код досоздавался при
// первом заходе в кабинет. Гостю код не нужен: бонусу некуда лечь без
// постоянного профиля.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_referrals.php';

$user = require_user();

switch ($_GET['action'] ?? '') {
    case 'info':
        require_method('GET');
        info($user);
    default:
        fail('Неизвестное действие', 404);
}

function info(array $user)
{
    $pdo = db();
    $code = (string) ($user['referral_code'] ?? '');
    if ($code === '' && (int) $user['is_guest'] !== 1) {
        $code = register_referral_code($pdo, $user['id']);
    }

    // Сколько друзей пришло по коду и скольким из них уже зачли награду.
    $st = $pdo->prepare('SELECT COUNT(*) AS invited, SUM(referral_reward_granted) AS rewarded
                         FROM users WHERE referred_by = ? AND deleted_at IS NULL');
    $st->execute([$user['id']]);
    $row = $st->fetch() ?: ['invited' => 0, 'rewarded' => 0];

    respond([
        'ok' => true,
        'code' => $code,
        'link' => $code !== '' ? 'https://sever-18.ru/?ref=' . $code : '',
        'invitedCount' => (int) $row['invited'],
        'rewardedCount' => (int) ($row['rewarded'] ?? 0),
    ]);
}
