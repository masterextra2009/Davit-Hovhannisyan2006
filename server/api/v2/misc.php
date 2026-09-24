<?php
declare(strict_types=1);

// Три небольшие вещи, которым не нужен отдельный файл каждой
// (api/v2/misc.php?action=…): витрина услуг, отзывы и счётчик посещений.
//
// Витрина услуг (коллекция services):
//   GET  services                      — всем вошедшим: только показываемые
//   GET  services&all=1                — админу: все, включая скрытые
//   POST service-save   {service}      — админ
//   POST service-delete {id}           — админ
//
// Отзывы и сообщения «Заметили ошибку?» (коллекция feedback):
//   POST feedback       {message, isBugReport?, screenshotUrl?}  — клиент о себе
//   GET  feedback-list                 — админ
//   POST feedback-delete {id}          — админ
//
// Счётчик посещений сайта (stats/visits):
//   POST visit                         — без входа, раз в сессию браузера
//   GET  visits                        — админ: всего и по дням
//
// Права повторяют firestore.rules: услуги читают вошедшие, правит админ;
// отзыв заводит клиент о себе, читает и удаляет только админ.

require __DIR__ . '/_bootstrap.php';

const VISITS_HISTORY_DAYS = 400;

$action = $_GET['action'] ?? '';

// Счётчик посещений — единственное место без входа: его вызывает и гость,
// который ещё ничего не нажимал.
if ($action === 'visit') {
    require_method('POST');
    count_visit();
}

$user = require_user();
$isAdmin = $user['role'] === 'admin';

switch ($action) {
    case 'services':
        require_method('GET');
        list_services($isAdmin);
    case 'service-save':
        require_method('POST');
        require_admin($isAdmin);
        save_service();
    case 'service-delete':
        require_method('POST');
        require_admin($isAdmin);
        db()->prepare('DELETE FROM services WHERE id = ?')->execute([str_field('id', 64)]);
        respond(['ok' => true]);
    case 'feedback':
        require_method('POST');
        send_feedback($user);
    case 'feedback-list':
        require_method('GET');
        require_admin($isAdmin);
        list_feedback();
    case 'feedback-delete':
        require_method('POST');
        require_admin($isAdmin);
        db()->prepare('DELETE FROM feedback WHERE id = ?')->execute([str_field('id', 64)]);
        respond(['ok' => true]);
    case 'visits':
        require_method('GET');
        require_admin($isAdmin);
        show_visits();
    default:
        fail('Неизвестное действие', 404);
}

// ─────────────────────────── Витрина услуг ───────────────────────────

function list_services(bool $isAdmin)
{
    $all = $isAdmin && ($_GET['all'] ?? '') !== '';
    $sql = 'SELECT * FROM services' . ($all ? '' : ' WHERE is_active = 1') . ' ORDER BY sort_order ASC LIMIT 500';
    respond(['ok' => true, 'services' => array_map('service_public', db()->query($sql)->fetchAll())]);
}

function service_public(array $s): array
{
    $extra = $s['extra'] ? (json_decode($s['extra'], true) ?: []) : [];
    $out = [
        'id' => $s['id'],
        'title' => $s['title'],
        'description' => $s['description'],
        'price' => $s['price'],
        'emoji' => $s['emoji'],
        'category' => $s['category'],
        'isActive' => (bool) $s['is_active'],
        'order' => (int) $s['sort_order'],
    ];
    foreach (['imageUrl', 'imageScale', 'iconUrl', 'ask', 'askText', 'askChoiceTitle', 'askChoices'] as $k) {
        if (isset($extra[$k]) && $extra[$k] !== '' && $extra[$k] !== null) {
            $out[$k] = $extra[$k];
        }
    }
    return $out;
}

/** Варианты выбора для клиента: до 6 непустых строк по 60 символов. */
function service_choices($raw): array
{
    if (!is_array($raw)) {
        return [];
    }
    $out = [];
    foreach ($raw as $c) {
        $c = mb_substr(trim((string) $c), 0, 60);
        if ($c !== '' && count($out) < 6) {
            $out[] = $c;
        }
    }
    return $out;
}

function save_service()
{
    $s = body()['service'] ?? null;
    if (!is_array($s)) {
        fail('Нет данных услуги');
    }
    $id = (string) ($s['id'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
        $id = 'srv_' . new_id(16);
    }
    $title = mb_substr(trim((string) ($s['title'] ?? '')), 0, 255);
    if ($title === '') {
        fail('У услуги должно быть название');
    }
    $extra = array_filter([
        'imageUrl' => mb_substr(trim((string) ($s['imageUrl'] ?? '')), 0, 1024),
        'imageScale' => isset($s['imageScale']) ? (float) $s['imageScale'] : null,
        'iconUrl' => mb_substr(trim((string) ($s['iconUrl'] ?? '')), 0, 1024),
        // Что спросить у клиента при заказе из приложения (решение Давида
        // 24.09.2026): ничего / файл для печати / фото. Не задано — приложение
        // решает по названию услуги.
        'ask' => in_array($s['ask'] ?? '', ['none', 'file', 'photo'], true) ? $s['ask'] : '',
        // Подпись поля для надписи («Надпись на кружке»). Пусто — поля нет.
        'askText' => mb_substr(trim((string) ($s['askText'] ?? '')), 0, 60),
        // Выбор из вариантов: заголовок («Траурная ленточка») и сами варианты.
        'askChoiceTitle' => mb_substr(trim((string) ($s['askChoiceTitle'] ?? '')), 0, 60),
        'askChoices' => service_choices($s['askChoices'] ?? null),
    ], fn($v) => $v !== null && $v !== '' && $v !== []);

    db()->prepare(
        'INSERT INTO services (id, title, description, price, emoji, category, is_active, sort_order, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE title = new.title, description = new.description, price = new.price,
             emoji = new.emoji, category = new.category, is_active = new.is_active,
             sort_order = new.sort_order, extra = new.extra'
    )->execute([
        $id,
        $title,
        mb_substr((string) ($s['description'] ?? ''), 0, 5000),
        mb_substr((string) ($s['price'] ?? ''), 0, 64),
        mb_substr((string) ($s['emoji'] ?? ''), 0, 16),
        mb_substr((string) ($s['category'] ?? ''), 0, 64),
        ($s['isActive'] ?? true) !== false ? 1 : 0,
        (int) ($s['order'] ?? 0),
        $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : null,
    ]);

    $st = db()->prepare('SELECT * FROM services WHERE id = ?');
    $st->execute([$id]);
    respond(['ok' => true, 'service' => service_public($st->fetch())]);
}

// ─────────────────────────── Отзывы ───────────────────────────

function send_feedback(array $user)
{
    $message = mb_substr(trim((string) (body()['message'] ?? '')), 0, 5000);
    if ($message === '') {
        fail('Напишите сообщение');
    }
    $id = 'fb_' . new_id(16);
    db()->prepare(
        'INSERT INTO feedback (id, user_id, user_name, user_email, message, is_bug_report, screenshot_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $user['id'],
        (string) $user['full_name'],
        (string) ($user['email'] ?? ''),
        $message,
        (body()['isBugReport'] ?? false) === true ? 1 : 0,
        mb_substr(trim((string) (body()['screenshotUrl'] ?? '')), 0, 1024) ?: null,
        now_utc(),
    ]);
    respond(['ok' => true, 'id' => $id]);
}

function list_feedback()
{
    $rows = db()->query('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 500')->fetchAll();
    $out = [];
    foreach ($rows as $f) {
        $item = [
            'id' => $f['id'],
            'userId' => $f['user_id'],
            'userName' => $f['user_name'],
            'userEmail' => $f['user_email'],
            'message' => $f['message'],
            'timestamp' => iso($f['created_at']),
            'isBugReport' => (bool) $f['is_bug_report'],
        ];
        if ($f['screenshot_url'] !== null) {
            $item['screenshotUrl'] = $f['screenshot_url'];
        }
        $out[] = $item;
    }
    respond(['ok' => true, 'feedback' => $out]);
}

// ─────────────────────────── Посещения ───────────────────────────

/**
 * Одно посещение = одна вкладка за сессию (так же считал сайт в Firestore:
 * ключ sever18_visit_tracked в sessionStorage). Здесь просто прибавляем
 * единицу к общему счёту и к сегодняшнему дню по московскому времени.
 */
function count_visit()
{
    $today = (new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow')))->format('Y-m-d');
    $pdo = db();
    $pdo->prepare(
        "INSERT INTO stats (name, data) VALUES ('visits', JSON_OBJECT('total', 1, 'history', JSON_OBJECT(?, 1))) AS new
         ON DUPLICATE KEY UPDATE data = JSON_SET(
            stats.data,
            '$.total', COALESCE(JSON_EXTRACT(stats.data, '$.total'), 0) + 1,
            CONCAT('$.history.\"', ?, '\"'), COALESCE(JSON_EXTRACT(stats.data, CONCAT('$.history.\"', ?, '\"')), 0) + 1
         )"
    )->execute([$today, $today, $today]);
    respond(['ok' => true]);
}

function show_visits()
{
    $st = db()->query("SELECT data FROM stats WHERE name = 'visits'");
    $data = json_decode((string) ($st->fetchColumn() ?: '{}'), true) ?: [];
    $history = is_array($data['history'] ?? null) ? $data['history'] : [];
    // Храним историю недолго: страница статистики показывает последние месяцы,
    // а не все годы сразу.
    krsort($history);
    $history = array_slice($history, 0, VISITS_HISTORY_DAYS, true);
    respond([
        'ok' => true,
        'total' => (int) ($data['total'] ?? 0),
        'history' => array_map(fn($d, $c) => ['date' => $d, 'count' => (int) $c], array_keys($history), $history),
    ]);
}
