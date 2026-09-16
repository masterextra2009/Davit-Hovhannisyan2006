<?php
declare(strict_types=1);

// Новости и акции (api/v2/promos.php?action=…) — вместо коллекции Firestore
// promos. Давид пишет новость в админке, клиенты видят её лентой на Главной
// в приложении.
//
// Опроса «что нового с такого-то времени» здесь нет намеренно: новостей
// единицы, проще каждый раз отдавать весь список — тогда и снятая с показа
// новость исчезает сама, без отдельной таблицы удалений.
//
// Любой вошедший:
//   GET  list                → {promos, serverTime}   только показываемые сейчас
// Админ:
//   GET  list&all=1          → все, включая снятые с показа
//   POST save   {promo}      → {promo}   создать или изменить
//   POST toggle {id, active} — галочка «показывать»
//   POST delete {id}
//
// Права повторяют firestore.rules: читают все вошедшие, пишет только админ.

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/_push.php';

const PROMO_MEDIA_TYPES = ['image', 'video'];
const MAX_PROMOS = 200;

$action = $_GET['action'] ?? '';
$user = require_user();
$isAdmin = $user['role'] === 'admin';

switch ($action) {
    case 'list':
        require_method('GET');
        list_promos($isAdmin);
    case 'save':
        require_method('POST');
        require_admin($isAdmin);
        save_promo();
    case 'toggle':
        require_method('POST');
        require_admin($isAdmin);
        toggle_promo();
    case 'delete':
        require_method('POST');
        require_admin($isAdmin);
        delete_promo();
    default:
        fail('Неизвестное действие', 404);
}

// ─────────────────────────── Чтение ───────────────────────────

function list_promos(bool $isAdmin)
{
    $all = $isAdmin && ($_GET['all'] ?? '') !== '';
    $sql = 'SELECT * FROM promos';
    if (!$all) {
        // Снятые с показа клиенту не отдаём вовсе. Срок «по» — включительно до
        // конца дня: акция «до 20 сентября» должна быть видна двадцатого весь
        // день, а не пропадать утром (то же правило уже в приложении).
        //
        // Дни сравниваем по московскому времени (+3 к UTC): «с 20 сентября»
        // должно включаться в полночь по Москве, а не в три часа ночи, и так же
        // заканчиваться. База живёт в UTC, поэтому сдвигаем сравнение.
        $sql .= ' WHERE active = 1
                  AND (show_from IS NULL OR show_from <= UTC_TIMESTAMP(3) + INTERVAL 3 HOUR)
                  AND (show_to IS NULL OR show_to + INTERVAL 1 DAY > UTC_TIMESTAMP(3) + INTERVAL 3 HOUR)';
    }
    $sql .= ' ORDER BY created_at DESC LIMIT ' . MAX_PROMOS;

    $rows = db()->query($sql)->fetchAll();
    respond(['ok' => true, 'promos' => array_map('promo_public', $rows), 'serverTime' => iso(now_utc())]);
}

/** Новость в том виде, в каком её ждут сайт и приложение (src/types.ts Promo). */
function promo_public(array $p): array
{
    $extra = $p['extra'] ? (json_decode($p['extra'], true) ?: []) : [];
    $out = [
        'id' => $p['id'],
        'title' => $p['title'],
        'body' => $p['body'],
        'active' => (bool) $p['active'],
        'createdAt' => iso($p['created_at']),
    ];
    // Даты показа приложение ждёт днями (ГГГГ-ММ-ДД), а не временем.
    if ($p['show_from'] !== null) {
        $out['from'] = substr($p['show_from'], 0, 10);
    }
    if ($p['show_to'] !== null) {
        $out['to'] = substr($p['show_to'], 0, 10);
    }
    foreach (['imageUrl', 'mediaType', 'mediaWidth', 'mediaHeight', 'linkUrl'] as $k) {
        if (isset($extra[$k]) && $extra[$k] !== '' && $extra[$k] !== null) {
            $out[$k] = $extra[$k];
        }
    }
    return $out;
}

// ─────────────────────────── Запись (только админ) ───────────────────────────

function save_promo()
{
    $title = str_field('title', 255);
    $body = str_field('body', 5000);
    $imageUrl = safe_url(str_field('imageUrl', 1024));
    // Как в админке: достаточно чего-то одного — подписи или файла. Новость
    // из одной афиши без заголовка — обычное дело.
    if ($title === '' && $imageUrl === '') {
        fail('Нужен заголовок или файл');
    }

    $mediaType = str_field('mediaType', 16);
    if ($mediaType !== '' && !in_array($mediaType, PROMO_MEDIA_TYPES, true)) {
        fail('Неизвестный вид файла');
    }
    $w = (int) (body()['mediaWidth'] ?? 0);
    $h = (int) (body()['mediaHeight'] ?? 0);

    $extra = array_filter([
        'imageUrl' => $imageUrl,
        'mediaType' => $mediaType,
        // Размеры пишем только парой: по одному числу пропорцию не восстановить,
        // и приложение вернётся к жёсткой полосе с обрезкой.
        'mediaWidth' => ($w > 0 && $h > 0) ? $w : null,
        'mediaHeight' => ($w > 0 && $h > 0) ? $h : null,
        // Ссылку записываем только годную: нажимаемая карточка, ведущая в
        // никуда, хуже ненажимаемой. Схемы вроде javascript: отсекает safe_url.
        'linkUrl' => safe_url(str_field('linkUrl', 1024)),
    ], fn($v) => $v !== null && $v !== '');

    $from = day_start(str_field('from', 10));
    $to = day_start(str_field('to', 10));
    $active = (body()['active'] ?? true) !== false;

    $id = str_field('id', 64);
    $pdo = db();
    if ($id === '') {
        $id = 'promo_' . new_id(16);
        $pdo->prepare('INSERT INTO promos (id, title, body, active, show_from, show_to, extra, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $title, $body, $active ? 1 : 0, $from, $to, json_encode($extra, JSON_UNESCAPED_UNICODE), now_utc()]);
        // Рассылка владельцам приложения — как раньше делала Cloud Function
        // notifyNewPromo. Скрытую новость (галочка снята) не рассылаем: её
        // завели «на потом».
        if ($active) {
            push_broadcast_clients(
                $title !== '' ? $title : 'Новость Фото-Север',
                $body !== '' ? $body : 'Загляните в приложение'
            );
        }
    } else {
        $st = $pdo->prepare('SELECT id FROM promos WHERE id = ?');
        $st->execute([$id]);
        if (!$st->fetch()) {
            fail('Новость не найдена', 404);
        }
        $pdo->prepare('UPDATE promos SET title = ?, body = ?, active = ?, show_from = ?, show_to = ?, extra = ? WHERE id = ?')
            ->execute([$title, $body, $active ? 1 : 0, $from, $to, json_encode($extra, JSON_UNESCAPED_UNICODE), $id]);
    }

    $st = $pdo->prepare('SELECT * FROM promos WHERE id = ?');
    $st->execute([$id]);
    respond(['ok' => true, 'promo' => promo_public($st->fetch())]);
}

function toggle_promo()
{
    $id = str_field('id', 64);
    if ($id === '') {
        fail('Не указана новость');
    }
    $active = (body()['active'] ?? true) !== false;
    $st = db()->prepare('UPDATE promos SET active = ? WHERE id = ?');
    $st->execute([$active ? 1 : 0, $id]);
    if ($st->rowCount() === 0) {
        $check = db()->prepare('SELECT id FROM promos WHERE id = ?');
        $check->execute([$id]);
        if (!$check->fetch()) {
            fail('Новость не найдена', 404);
        }
    }
    respond(['ok' => true]);
}

function delete_promo()
{
    $id = str_field('id', 64);
    if ($id === '') {
        fail('Не указана новость');
    }
    db()->prepare('DELETE FROM promos WHERE id = ?')->execute([$id]);
    respond(['ok' => true]);
}

/**
 * Ссылка, которую не стыдно открыть на телефоне клиента: только http/https.
 * Схемы вроде javascript: или intent: сюда попасть не должны.
 */
function safe_url(string $url): string
{
    if ($url === '') {
        return '';
    }
    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    if (!in_array($scheme, ['http', 'https'], true)) {
        return '';
    }
    return filter_var($url, FILTER_VALIDATE_URL) ? $url : '';
}

/** «ГГГГ-ММ-ДД» → начало этого дня для базы; пусто → NULL. */
function day_start(string $day): ?string
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        return null;
    }
    return $day . ' 00:00:00.000';
}
