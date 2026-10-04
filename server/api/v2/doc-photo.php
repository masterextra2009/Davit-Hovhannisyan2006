<?php
declare(strict_types=1);

/**
 * Фото на документы в приложении (api/v2/doc-photo.php?action=…), 03.10.2026.
 *
 * Клиент выбирает документ (паспорт, виза, военный билет…), загружает своё
 * фото, нейросеть (polza.ai) делает из него фото на документы с белым фоном,
 * сервер режет точно в размер документа (300 dpi) и показывает результат С
 * ВОДЯНЫМ ЗНАКОМ. Чистое фото клиент не получает: печатаем в мастерской.
 *
 * Правило Давида: первая попытка бесплатно (одна на аккаунт), дальше — заказ
 * за 250 ₽: 3 попытки на выбор + печать (3,5×4,5 — 4 шт, 3×4 — 6, 9×12 — 1).
 *
 *   GET  catalog                                    → документы, ретушь, цена, сколько осталось
 *   POST consent                                    → согласие на обработку фото нейросетью
 *   POST make     (multipart: file, docId, color, retouch, orderId?) → {attemptId, previewUrl, beforeUrl?, …}
 *   POST order    {attemptId?, docId, color}        → заказ 250 ₽ (оплата — обычный payments.php)
 *   POST choose   {orderId, attemptId}              → какую попытку печатать (оплаченный заказ)
 *   GET  attempts &orderId=…                        → попытки заказа с превью
 */

require __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_doc_photo.php';

/**
 * Модель — Nano Banana Pro в разрешении 2K: Давид 03.10.2026 «самое главное —
 * очень высокое качество». Проверено: отдаёт 1792×2400 (3:4) с порами кожи и
 * отдельными волосками, ~13,5 ₽ за попытку (Flash дешевле, но мягче).
 */
const DP_MODEL = 'google/gemini-3-pro-image-preview';
const DP_RESOLUTION = '2K';
const DP_TIMEOUT = 180;
const DP_MAX_UPLOAD = 15 * 1024 * 1024;
/** Сколько всего обработок в сутки на всю мастерскую — защита баланса polza. */
const DP_DAILY_LIMIT = 300;
/** Не чаще раза в 20 секунд от одного клиента (двойное нажатие, скрипты). */
const DP_MIN_INTERVAL = 20;
// 1.1: в тексте честно названы Polza.ai и Google Gemini (в 1.0 было «не передаётся третьим лицам» — неверно).
const DP_CONSENT_VERSION = '1.1 от 03.10.2026';
/** Файл для печати: 600 dpi для маленьких фото, 300 dpi для 9×12 (исходника 2K на 600 не хватит). */
const DP_DPI_SMALL = 600;
const DP_DPI_LARGE = 300;
/**
 * Окно ретуши «Сканер» (04.10.2026): клиент видит, как было и как стало, —
 * для этого его снимок накладывается на результат точно по глазам. Глаза ищет
 * дешёвая модель в два прохода (весь снимок → вырезка вокруг лица); проверено:
 * ошибка 1–4 px, ~0,1 ₽ на фото. Первый проход идёт одновременно с ретушью.
 */
const DP_EYES_MODEL = 'google/gemini-3.1-flash-lite';

$user = require_user();
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'catalog':
        require_method('GET');
        dp_catalog($user);
    case 'consent':
        require_method('POST');
        dp_consent($user);
    case 'make':
        require_method('POST');
        dp_make($user);
    case 'order':
        require_method('POST');
        dp_order($user);
    case 'choose':
        require_method('POST');
        dp_choose($user);
    case 'attempts':
        require_method('GET');
        dp_attempts($user);
    default:
        fail('Неизвестное действие', 404);
}

// ─────────────────────────── Каталог и согласие ───────────────────────────

function dp_catalog(array $user)
{
    respond([
        'ok' => true,
        'price' => DOC_PHOTO_PRICE,
        'paidAttempts' => DOC_PHOTO_PAID_ATTEMPTS,
        'docs' => array_map(fn($d) => [
            'id' => $d['id'], 'group' => $d['group'], 'name' => $d['name'],
            'w' => $d['w'], 'h' => $d['h'], 'copies' => $d['copies'],
            'bw' => $d['bw'], 'bg' => $d['bg'], 'rules' => $d['rules'],
        ], doc_photo_catalog()),
        'retouch' => array_map(fn($r) => ['id' => $r['id'], 'name' => $r['name'], 'default' => $r['default']], doc_photo_retouch()),
        'freeLeft' => dp_free_used($user['id']) ? 0 : 1,
        'guest' => (int) $user['is_guest'] === 1,
        'consent' => dp_has_consent($user['id']),
        'consentVersion' => DP_CONSENT_VERSION,
    ]);
}

function dp_has_consent(string $userId): bool
{
    // Согласие считается только на нынешний текст: после правки текста спрашиваем заново.
    $st = db()->prepare("SELECT granted FROM consents WHERE user_id = ? AND kind = 'ai_photo' AND doc_version = ? ORDER BY id DESC LIMIT 1");
    $st->execute([$userId, DP_CONSENT_VERSION]);
    return (int) $st->fetchColumn() === 1;
}

function dp_consent(array $user)
{
    db()->prepare("INSERT INTO consents (user_id, kind, granted, doc_version, source, ip, created_at) VALUES (?, 'ai_photo', 1, ?, 'app', ?, ?)")
        ->execute([$user['id'], DP_CONSENT_VERSION, client_ip(), now_utc()]);
    respond(['ok' => true]);
}

function dp_free_used(string $userId): bool
{
    $st = db()->prepare('SELECT 1 FROM doc_photo_attempts WHERE user_id = ? AND order_id IS NULL LIMIT 1');
    $st->execute([$userId]);
    return (bool) $st->fetchColumn();
}

// ─────────────────────────── Обработка фото ───────────────────────────

function dp_make(array $user)
{
    $pdo = db();
    if (!dp_has_consent($user['id'])) {
        fail('Сначала подтвердите согласие на обработку фото', 403);
    }
    $doc = doc_photo_find((string) ($_POST['docId'] ?? ''));
    if (!$doc) {
        fail('Выберите документ');
    }
    $color = ($_POST['color'] ?? '') === 'bw' && $doc['bw'] ? 'bw' : 'color';
    $retouchIds = array_values(array_filter(explode(',', (string) ($_POST['retouch'] ?? ''))));
    $orderId = trim((string) ($_POST['orderId'] ?? ''));

    // Чья попытка: бесплатная (одна на аккаунт) или из оплаченного заказа (3 шт.).
    if ($orderId === '') {
        if ((int) $user['is_guest'] === 1) {
            fail('Бесплатная попытка — для зарегистрированных. Войдите в аккаунт.', 403);
        }
        if (dp_free_used($user['id'])) {
            respond(['ok' => false, 'code' => 'free_used', 'error' => 'Бесплатная попытка уже использована. Дальше — 3 попытки и печать за ' . DOC_PHOTO_PRICE . ' ₽.'], 402);
        }
    } else {
        $order = dp_own_paid_order($orderId, $user);
        if (dp_order_attempts($orderId) >= DOC_PHOTO_PAID_ATTEMPTS) {
            respond(['ok' => false, 'code' => 'no_attempts', 'error' => 'Все ' . DOC_PHOTO_PAID_ATTEMPTS . ' попытки этого заказа использованы. Выберите лучшую.'], 402);
        }
    }
    $last = $pdo->prepare('SELECT MAX(created_at) FROM doc_photo_attempts WHERE user_id = ?');
    $last->execute([$user['id']]);
    $lastAt = $last->fetchColumn();
    if ($lastAt && strtotime($lastAt . ' UTC') > time() - DP_MIN_INTERVAL) {
        fail('Подождите немного — предыдущее фото только что обработано', 429);
    }
    $day = (int) $pdo->query('SELECT COUNT(*) FROM doc_photo_attempts WHERE created_at > UTC_TIMESTAMP(3) - INTERVAL 1 DAY')->fetchColumn();
    if ($day >= DP_DAILY_LIMIT) {
        fail('Сегодня слишком много обработок. Попробуйте завтра или приходите в мастерскую.', 429);
    }

    $src = dp_read_upload();
    $srcJpeg = dp_jpeg($src, 95);
    $prompt = dp_prompt($doc, $retouchIds);
    // Ретушь и поиск глаз на снимке клиента — одновременно, чтобы не ждать дольше.
    $done = dp_curl_parallel([
        'edit' => dp_polza_edit_request($srcJpeg, $prompt, dp_aspect($doc)),
        'eyes' => dp_eyes_request($srcJpeg),
    ]);
    $raw = dp_polza_edit_result($done['edit']);
    $result = dp_fit_to_doc($raw, $doc, $color);
    $before = dp_make_before($src, $done['eyes'], $result);
    imagedestroy($src);
    // нейросеть думала полминуты и больше — база за это время закрыла соединение
    $pdo = db(true);

    $attemptId = new_id(20);
    $privateDir = DOC_PHOTO_PRIVATE_DIR . '/' . $user['id'];
    if (!is_dir($privateDir) && !mkdir($privateDir, 0700, true) && !is_dir($privateDir)) {
        error_log('doc-photo: не удалось создать закрытую папку');
        fail('Не удалось сохранить фото', 500);
    }
    imagejpeg($result, doc_photo_private_path($user['id'], $attemptId), 100);
    $previewPath = dp_save_preview($result, $user['id'], $attemptId);
    imagedestroy($result);
    $beforePath = $before ? dp_save_before($before, $user['id'], $attemptId) : null;

    $pdo->prepare('INSERT INTO doc_photo_attempts (id, user_id, order_id, doc_id, color, retouch, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$attemptId, $user['id'], $orderId === '' ? null : $orderId, $doc['id'], $color, implode(',', $retouchIds), now_utc()]);

    $left = $orderId === '' ? 0 : DOC_PHOTO_PAID_ATTEMPTS - dp_order_attempts($orderId);
    respond([
        'ok' => true,
        'attemptId' => $attemptId,
        'previewUrl' => dp_signed($previewPath, 24 * 7),
        'beforeUrl' => $beforePath ? dp_signed($beforePath, 24 * 7) : null,
        'attemptsLeft' => $left,
        'free' => $orderId === '',
    ], 201);
}

/** Загруженное фото → GD-картинка, повернутая по EXIF, не больше 2048 px. */
function dp_read_upload()
{
    $f = $_FILES['file'] ?? null;
    if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail('Фото не получено');
    }
    if ((int) $f['size'] > DP_MAX_UPLOAD) {
        fail('Фото слишком большое — до 15 МБ', 413);
    }
    $info = @getimagesize($f['tmp_name']);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
        fail('Нужна фотография в формате JPG, PNG или WEBP');
    }
    $img = @imagecreatefromstring((string) file_get_contents($f['tmp_name']));
    if (!$img) {
        fail('Не удалось прочитать фото');
    }
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $exif = @exif_read_data($f['tmp_name']);
        $rot = [3 => 180, 6 => -90, 8 => 90][(int) ($exif['Orientation'] ?? 1)] ?? 0;
        if ($rot) {
            $img = imagerotate($img, $rot, 0);
        }
    }
    $w = imagesx($img);
    $h = imagesy($img);
    $scale = min(1, 2048 / max($w, $h));
    if ($scale < 1) {
        $img = imagescale($img, (int) round($w * $scale), (int) round($h * $scale), IMG_BICUBIC);
    }
    return $img;
}

function dp_prompt(array $doc, array $retouchIds): string
{
    $mm = fn($v) => rtrim(rtrim(number_format($v / 10, 1, ',', ''), '0'), ',');
    $size = $mm($doc['w']) . '×' . $mm($doc['h']) . ' см';
    $bg = $doc['bg'] === 'lightgray'
        ? 'однотонный СВЕТЛО-СЕРЫЙ (#E6E6E6), без теней, складок и градиента'
        : 'однотонный ЧИСТО БЕЛЫЙ (#FFFFFF), без теней, складок, виньетки и градиента';
    $retouch = [];
    foreach (doc_photo_retouch() as $r) {
        if (in_array($r['id'], $retouchIds, true)) {
            $retouch[] = $r['prompt'];
        }
    }
    return implode(' ', [
        "Сделай фото на документ «{$doc['name']}» размером {$size} — кадр с пропорцией {$doc['w']}:{$doc['h']}.",
        "Фон {$bg}.",
        'Человек строго анфас, голова прямо (если повёрнута или наклонена — выровняй), глаза открыты, взгляд в камеру, рот закрыт, без улыбки.',
        "Кадрирование: высота головы от подбородка до макушки {$doc['head'][0]}–{$doc['head'][1]} мм из {$doc['h']} мм высоты кадра, "
            . "над макушкой {$doc['top'][0]}–{$doc['top'][1]} мм, голова по центру по горизонтали, видны плечи.",
        'Освещение ровное, мягкое, как в фотостудии, без резких теней на лице.',
        $retouch ? 'Ретушь: ' . implode('; ', $retouch) . '.' : 'Без ретуши кожи.',
        'Не меняй черты лица, форму головы, цвет глаз, возраст, причёску и выражение лица. Убери других людей и посторонние предметы.',
        'Результат — фотореалистичный, резкий, без эффекта рисунка и без надписей.',
    ]);
}

/** Ближайшая к документу пропорция из тех, что умеет нейросеть: меньше обрезки — больше деталей. */
function dp_aspect(array $doc): string
{
    $ratio = $doc['w'] / $doc['h'];
    $best = '3:4';
    $diff = 9.0;
    foreach (['1:1' => 1.0, '4:5' => 0.8, '3:4' => 0.75, '2:3' => 2 / 3, '9:16' => 0.5625] as $name => $r) {
        if (abs($r - $ratio) < $diff) {
            $diff = abs($r - $ratio);
            $best = $name;
        }
    }
    return $best;
}

/** Запрос к нейросети polza.ai (Media API) — curl-ручка, запускается через dp_curl_parallel. */
function dp_polza_edit_request(string $jpeg, string $prompt, string $aspect)
{
    $payload = json_encode([
        'model' => DP_MODEL,
        'input' => [
            'prompt' => $prompt,
            'images' => [['type' => 'base64', 'data' => 'data:image/jpeg;base64,' . base64_encode($jpeg)]],
            'aspect_ratio' => $aspect,
            'image_resolution' => DP_RESOLUTION,
        ],
        'async' => false,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return dp_polza_post('/api/v1/media', $payload, DP_TIMEOUT);
}

/** Ответ нейросети → GD-картинка (или понятная ошибка клиенту). */
function dp_polza_edit_result(array $r)
{
    [$raw, $code, $err] = [$r['raw'], $r['code'], $r['err']];
    if ($raw === false) {
        error_log('doc-photo: связь с polza.ai: ' . $err);
        fail('Не получилось обработать фото. Попробуйте ещё раз.', 502);
    }
    $data = json_decode((string) $raw, true);
    if ($code === 402 || stripos((string) ($data['error']['message'] ?? ''), 'balance') !== false) {
        error_log('doc-photo: на счету polza.ai нет денег');
        fail('Обработка временно недоступна. Приходите в мастерскую — сделаем на месте.', 503);
    }
    $url = $data['data'][0]['url'] ?? ($data['data'][0] ?? null);
    if ($code < 200 || $code >= 300 || ($data['status'] ?? '') === 'failed' || !is_string($url) || $url === '') {
        error_log('doc-photo: polza ответил ' . $code . ': ' . mb_substr((string) $raw, 0, 300));
        fail('Нейросеть не справилась с этим фото. Попробуйте другое — светлее и анфас.', 502);
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_FOLLOWLOCATION => true]);
    $bytes = curl_exec($ch);
    curl_close($ch);
    $out = $bytes ? @imagecreatefromstring((string) $bytes) : false;
    if (!$out) {
        fail('Не удалось получить обработанное фото. Попробуйте ещё раз.', 502);
    }
    return $out;
}

/** Точная пропорция документа и размер в пикселях для печати 300 dpi, ч/б по желанию. */
function dp_fit_to_doc($img, array $doc, string $color)
{
    $dpi = max($doc['w'], $doc['h']) <= 60 ? DP_DPI_SMALL : DP_DPI_LARGE;
    $W = (int) round($doc['w'] / 25.4 * $dpi);
    $H = (int) round($doc['h'] / 25.4 * $dpi);
    $target = $W / $H;
    $sw = imagesx($img);
    $sh = imagesy($img);
    $sx = 0;
    $sy = 0;
    if ($sw / $sh > $target) {
        $nw = (int) round($sh * $target);
        $sx = (int) round(($sw - $nw) / 2);
        $sw = $nw;
    } else {
        $nh = (int) round($sw / $target);
        $sy = (int) round(($sh - $nh) * 0.35); // лишнее больше снизу — не срезать макушку
        $sh = $nh;
    }
    $out = imagecreatetruecolor($W, $H);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $img, 0, 0, $sx, $sy, $W, $H, $sw, $sh);
    imagedestroy($img);
    if ($color === 'bw') {
        imagefilter($out, IMG_FILTER_GRAYSCALE);
    }
    // В файл записываем настоящее разрешение — иначе программа печати увидит
    // «96 dpi» и напечатает фото не того размера.
    imageresolution($out, $dpi, $dpi);
    return $out;
}

/** Превью для клиента: уменьшенное, с повторяющимся водяным знаком. Лежит в uploads/ клиента. */
function dp_save_preview($img, string $userId, string $attemptId): string
{
    $h = 900;
    $w = (int) round(imagesx($img) * $h / imagesy($img));
    $p = imagescale($img, $w, $h, IMG_BICUBIC);
    // Водяной знак: ровные строки «кирпичиком» на прозрачном холсте, потом
    // холст целиком поворачивается — так буквы не наезжают друг на друга.
    $font = __DIR__ . '/_fonts/Oswald-Bold.ttf';
    $text = 'ФОТО-СЕВЕР · ОБРАЗЕЦ';
    $size = max(16, (int) round($w / 16));
    $box = imagettfbbox($size, 0, $font, $text);
    $tw = abs($box[2] - $box[0]);
    $side = (int) ceil(sqrt($w * $w + $h * $h));
    $layer = imagecreatetruecolor($side, $side);
    imagesavealpha($layer, true);
    imagealphablending($layer, false);
    imagefill($layer, 0, 0, imagecolorallocatealpha($layer, 0, 0, 0, 127));
    imagealphablending($layer, true);
    $ink = imagecolorallocatealpha($layer, 110, 110, 110, 85);
    $stepX = $tw + $size * 2;
    $stepY = (int) round($size * 3);
    for ($row = 0, $y = $size; $y < $side + $size; $row++, $y += $stepY) {
        for ($x = ($row % 2 ? -intdiv($stepX, 2) : 0); $x < $side; $x += $stepX) {
            imagettftext($layer, $size, 0, $x, $y, $ink, $font, $text);
        }
    }
    $rot = imagerotate($layer, 30, imagecolorallocatealpha($layer, 0, 0, 0, 127));
    imagedestroy($layer);
    imagealphablending($p, true);
    imagecopy($p, $rot, 0, 0, intdiv(imagesx($rot) - $w, 2), intdiv(imagesy($rot) - $h, 2), $w, $h);
    imagedestroy($rot);
    $dir = SITE_DIR . '/uploads/' . $userId;
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        fail('Не удалось сохранить фото', 500);
    }
    $name = 'docphoto_preview_' . $attemptId . '.jpg';
    imagejpeg($p, $dir . '/' . $name, 82);
    imagedestroy($p);
    return 'uploads/' . $userId . '/' . $name;
}

// ─────────────────────────── Заказ ───────────────────────────

/** Заказ 250 ₽ на «фото на документы». Файл появится в заказе после оплаты (payments.php). */
function dp_order(array $user)
{
    $b = body();
    $doc = doc_photo_find((string) ($b['docId'] ?? ''));
    if (!$doc) {
        fail('Выберите документ');
    }
    $color = ($b['color'] ?? '') === 'bw' && $doc['bw'] ? 'bw' : 'color';
    $attemptId = (string) ($b['attemptId'] ?? '');
    if ($attemptId !== '') {
        $st = db()->prepare('SELECT * FROM doc_photo_attempts WHERE id = ? AND user_id = ?');
        $st->execute([$attemptId, $user['id']]);
        $a = $st->fetch();
        if (!$a) {
            fail('Фото не найдено — сделайте его ещё раз', 404);
        }
        $doc = doc_photo_find($a['doc_id']) ?? $doc;
        $color = $a['color'];
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->exec("INSERT IGNORE INTO counters (name, next) VALUES ('orders', 1000)");
        $number = (int) $pdo->query("SELECT next FROM counters WHERE name = 'orders' FOR UPDATE")->fetchColumn();
        $pdo->exec("UPDATE counters SET next = next + 1 WHERE name = 'orders'");
        $orderId = 'ORD-' . $number;
        $mm = fn($v) => rtrim(rtrim(number_format($v / 10, 1, ',', ''), '0'), ',');
        $size = $mm($doc['w']) . '×' . $mm($doc['h']);
        $notes = 'Фото на документы (ИИ): ' . $doc['name'] . ', ' . $size . ' см, ' . $doc['copies'] . ' шт., '
            . ($color === 'bw' ? 'ч/б' : 'цветное') . '. Клиент выбирает лучшую из ' . DOC_PHOTO_PAID_ATTEMPTS . ' попыток в приложении.';
        $extra = ['docPhoto' => ['docId' => $doc['id'], 'color' => $color, 'copies' => $doc['copies'], 'attemptId' => $attemptId]];
        $pdo->prepare('INSERT INTO orders (id, user_id, user_name, user_email, user_phone, is_guest_order, files, order_date, status,
                total_cost, payment_status, notes, photo_size, print_color, copies, service_id, extra)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'pending\', ?, \'unpaid\', ?, ?, ?, ?, ?, ?)')
            ->execute([
                $orderId, $user['id'], (string) $user['full_name'], (string) ($user['email'] ?? ''), $user['phone'] ?? null,
                (int) $user['is_guest'] === 1 ? 1 : 0, '[]', now_utc(),
                number_format(DOC_PHOTO_PRICE, 2, '.', ''), $notes, $size, $color, $doc['copies'], DOC_PHOTO_SERVICE_ID,
                json_encode($extra, JSON_UNESCAPED_UNICODE),
            ]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    respond(['ok' => true, 'orderId' => $orderId, 'total' => DOC_PHOTO_PRICE], 201);
}

/** Какую попытку печатать. Можно, пока заказ не ушёл в печать. */
function dp_choose(array $user)
{
    $b = body();
    $order = dp_own_paid_order((string) ($b['orderId'] ?? ''), $user);
    if ($order['status'] !== 'pending' && $order['status'] !== 'approved') {
        fail('Заказ уже печатается — фото поменять нельзя', 409);
    }
    $attemptId = (string) ($b['attemptId'] ?? '');
    $st = db()->prepare('SELECT * FROM doc_photo_attempts WHERE id = ? AND user_id = ?');
    $st->execute([$attemptId, $user['id']]);
    $a = $st->fetch();
    if (!$a || ($a['order_id'] !== null && $a['order_id'] !== $order['id'])) {
        fail('Фото не найдено', 404);
    }
    $extra = $order['extra'] ? (json_decode((string) $order['extra'], true) ?: []) : [];
    $extra['docPhoto'] = array_merge($extra['docPhoto'] ?? [], ['attemptId' => $attemptId, 'docId' => $a['doc_id'], 'color' => $a['color']]);
    db()->prepare('UPDATE orders SET extra = ? WHERE id = ?')->execute([json_encode($extra, JSON_UNESCAPED_UNICODE), $order['id']]);
    $order['extra'] = json_encode($extra);
    $files = doc_photo_attach($order);
    if ($files === null) {
        fail('Не удалось прикрепить фото к заказу', 500);
    }
    respond(['ok' => true]);
}

function dp_attempts(array $user)
{
    $orderId = (string) ($_GET['orderId'] ?? '');
    $order = dp_own_paid_order($orderId, $user);
    $dp = doc_photo_order_extra($order);
    $st = db()->prepare('SELECT * FROM doc_photo_attempts WHERE user_id = ? AND (order_id = ? OR id = ?) ORDER BY created_at');
    $st->execute([$user['id'], $orderId, (string) ($dp['attemptId'] ?? '')]);
    $list = array_map(fn($a) => [
        'attemptId' => $a['id'],
        'previewUrl' => dp_signed('uploads/' . $user['id'] . '/docphoto_preview_' . $a['id'] . '.jpg', 24 * 7),
        'beforeUrl' => is_file(SITE_DIR . '/uploads/' . $user['id'] . '/docphoto_before_' . $a['id'] . '.jpg')
            ? dp_signed('uploads/' . $user['id'] . '/docphoto_before_' . $a['id'] . '.jpg', 24 * 7) : null,
        'chosen' => $a['id'] === ($dp['attemptId'] ?? ''),
        'free' => $a['order_id'] === null,
    ], $st->fetchAll());
    respond(['ok' => true, 'attempts' => $list, 'attemptsLeft' => DOC_PHOTO_PAID_ATTEMPTS - dp_order_attempts($orderId), 'status' => $order['status']]);
}

// ─────────────────────────── Служебное ───────────────────────────

function dp_own_paid_order(string $orderId, array $user): array
{
    $st = db()->prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?');
    $st->execute([$orderId, $user['id']]);
    $order = $st->fetch();
    if (!$order || $order['service_id'] !== DOC_PHOTO_SERVICE_ID) {
        fail('Заказ не найден', 404);
    }
    if ($order['payment_status'] !== 'paid') {
        fail('Заказ ещё не оплачен', 402);
    }
    return $order;
}

function dp_order_attempts(string $orderId): int
{
    $st = db()->prepare('SELECT COUNT(*) FROM doc_photo_attempts WHERE order_id = ?');
    $st->execute([$orderId]);
    return (int) $st->fetchColumn();
}

function dp_signed(string $path, int $hours): string
{
    $exp = time() + $hours * 3600;
    return 'https://sever-18.ru/api/v2/files.php?action=get&path=' . rawurlencode($path)
        . '&exp=' . $exp . '&sig=' . doc_photo_sign($path, $exp);
}

function dp_jpeg($img, int $q): string
{
    ob_start();
    imagejpeg($img, null, $q);
    return (string) ob_get_clean();
}

function dp_polza_post(string $path, string $payload, int $timeout)
{
    $ch = curl_init('https://polza.ai' . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . dp_polza_key()],
    ]);
    return $ch;
}

/** Несколько запросов разом. → [ключ => ['raw' => ответ|false, 'code' => HTTP-код, 'err' => текст]] */
function dp_curl_parallel(array $handles): array
{
    $mh = curl_multi_init();
    foreach ($handles as $ch) {
        curl_multi_add_handle($mh, $ch);
    }
    do {
        $st = curl_multi_exec($mh, $running);
        if ($running) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running && $st === CURLM_OK);
    $out = [];
    foreach ($handles as $k => $ch) {
        $err = curl_error($ch);
        $out[$k] = [
            'raw' => $err === '' ? (string) curl_multi_getcontent($ch) : false,
            'code' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
            'err' => $err,
        ];
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    return $out;
}

// ─────────────────────────── «Как было» для окна ретуши ───────────────────────────

/** Запрос «где зрачки» к дешёвой модели. */
function dp_eyes_request(string $jpeg)
{
    $payload = json_encode([
        'model' => DP_EYES_MODEL,
        'temperature' => 0,
        'messages' => [['role' => 'user', 'content' => [
            ['type' => 'text', 'text' => 'Find the centers of the two pupils of the person. Answer ONLY JSON {"left":[y,x],"right":[y,x]} '
                . 'with coordinates normalized 0-1000 (y from top, x from left); "left" is the eye on the left side of the image.'],
            ['type' => 'image_url', 'image_url' => ['url' => 'data:image/jpeg;base64,' . base64_encode($jpeg)]],
        ]]],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return dp_polza_post('/api/v1/chat/completions', $payload, 40);
}

/** Ответ модели → [[x,y],[x,y]] в пикселях картинки w×h, или null, если ответ странный. */
function dp_eyes_parse(array $r, int $w, int $h): ?array
{
    if ($r['raw'] === false || $r['code'] < 200 || $r['code'] >= 300) {
        error_log('doc-photo: поиск глаз не ответил: ' . $r['code'] . ' ' . $r['err']);
        return null;
    }
    $text = (string) (json_decode((string) $r['raw'], true)['choices'][0]['message']['content'] ?? '');
    if (!preg_match('/\{.*\}/s', $text, $m) || !is_array($j = json_decode($m[0], true))) {
        return null;
    }
    $eyes = [];
    foreach (['left', 'right'] as $k) {
        $p = $j[$k] ?? null;
        if (!is_array($p) || count($p) !== 2 || !is_numeric($p[0]) || !is_numeric($p[1])) {
            return null;
        }
        $eyes[] = [(float) $p[1] / 1000 * $w, (float) $p[0] / 1000 * $h];
    }
    $d = hypot($eyes[1][0] - $eyes[0][0], $eyes[1][1] - $eyes[0][1]);
    // глаза слева направо и не слиплись в одну точку
    return $eyes[0][0] < $eyes[1][0] && $d > 0.02 * $w ? $eyes : null;
}

/**
 * Снимок клиента, повёрнутый и отмасштабированный так, чтобы глаза легли
 * точно на глаза результата, — того же размера, что результат. Не вышло — null:
 * окно ретуши тогда просто покажет готовое фото.
 */
function dp_make_before($src, array $eyesReply, $result)
{
    $sw = imagesx($src);
    $sh = imagesy($src);
    $a = dp_eyes_parse($eyesReply, $sw, $sh);
    if (!$a) {
        return null;
    }
    // второй проход — по вырезке вокруг лица: так точнее
    $d = hypot($a[1][0] - $a[0][0], $a[1][1] - $a[0][1]);
    $cx = ($a[0][0] + $a[1][0]) / 2;
    $cy = ($a[0][1] + $a[1][1]) / 2;
    $bx = (int) max(0, $cx - 2 * $d);
    $by = (int) max(0, $cy - 1.6 * $d);
    $bw = (int) min($sw - $bx, 4 * $d);
    $bh = (int) min($sh - $by, 4 * $d);
    $crop = imagecrop($src, ['x' => $bx, 'y' => $by, 'width' => $bw, 'height' => $bh]);
    // результат ищем по копии высотой 900 — модели этого хватает, а запрос легче
    $rw = imagesx($result);
    $rh = imagesy($result);
    $small = imagescale($result, (int) round($rw * 900 / $rh), 900, IMG_BICUBIC);
    $done = dp_curl_parallel([
        'crop' => dp_eyes_request(dp_jpeg($crop, 92)),
        'res' => dp_eyes_request(dp_jpeg($small, 90)),
    ]);
    $a2 = dp_eyes_parse($done['crop'], $bw, $bh);
    $b = dp_eyes_parse($done['res'], imagesx($small), 900);
    imagedestroy($crop);
    imagedestroy($small);
    if (!$b) {
        return null;
    }
    if ($a2) {
        $a = [[$a2[0][0] + $bx, $a2[0][1] + $by], [$a2[1][0] + $bx, $a2[1][1] + $by]];
    }
    $k = $rh / 900;
    $b = [[$b[0][0] * $k, $b[0][1] * $k], [$b[1][0] * $k, $b[1][1] * $k]];

    // поворот и масштаб: отрезок «глаз—глаз» снимка → такой же на результате
    $va = [$a[1][0] - $a[0][0], $a[1][1] - $a[0][1]];
    $vb = [$b[1][0] - $b[0][0], $b[1][1] - $b[0][1]];
    $scale = hypot($vb[0], $vb[1]) / hypot($va[0], $va[1]);
    $angle = atan2($vb[1], $vb[0]) - atan2($va[1], $va[0]);
    if ($scale < 0.05 || $scale > 20 || abs($angle) > deg2rad(35)) {
        return null; // явно ошибка модели
    }
    // imagerotate крутит против часовой; ось y у картинки вниз — отсюда минус
    $rot = abs($angle) > 0.002 ? imagerotate($src, -rad2deg($angle), imagecolorallocate($src, 255, 255, 255)) : $src;
    $nw = imagesx($rot);
    $nh = imagesy($rot);
    $c = cos($angle);
    $s = sin($angle);
    $ex = $a[0][0] - $sw / 2;
    $ey = $a[0][1] - $sh / 2;
    $ax = $c * $ex - $s * $ey + $nw / 2; // левый глаз на повёрнутом снимке
    $ay = $s * $ex + $c * $ey + $nh / 2;
    $tx = $b[0][0] - $scale * $ax;
    $ty = $b[0][1] - $scale * $ay;

    $out = imagecreatetruecolor($rw, $rh);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    // копируется только видимая часть повёрнутого снимка — без выхода за края
    $x0 = max(0.0, -$tx / $scale);
    $y0 = max(0.0, -$ty / $scale);
    $x1 = min((float) $nw, ($rw - $tx) / $scale);
    $y1 = min((float) $nh, ($rh - $ty) / $scale);
    if ($x1 - $x0 >= 2 && $y1 - $y0 >= 2) {
        imagecopyresampled($out, $rot,
            (int) round($tx + $x0 * $scale), (int) round($ty + $y0 * $scale), (int) $x0, (int) $y0,
            (int) round(($x1 - $x0) * $scale), (int) round(($y1 - $y0) * $scale), (int) ($x1 - $x0), (int) ($y1 - $y0));
    }
    if ($rot !== $src) {
        imagedestroy($rot);
    }
    return $out;
}

/** «Как было» — тем же размером, что превью, без водяного знака (это снимок самого клиента). */
function dp_save_before($img, string $userId, string $attemptId): string
{
    $h = 900;
    $p = imagescale($img, (int) round(imagesx($img) * $h / imagesy($img)), $h, IMG_BICUBIC);
    imagedestroy($img);
    $name = 'docphoto_before_' . $attemptId . '.jpg';
    imagejpeg($p, SITE_DIR . '/uploads/' . $userId . '/' . $name, 82);
    imagedestroy($p);
    return 'uploads/' . $userId . '/' . $name;
}

function dp_polza_key(): string
{
    foreach ([SITE_DIR . '/../.sever18-private/polza.php', HOME_DIR . '/private/polza.php'] as $file) {
        if (is_readable($file)) {
            $c = require $file;
            if (is_array($c) && !empty($c['key'])) {
                return (string) $c['key'];
            }
        }
    }
    error_log('doc-photo: ключ polza не найден');
    fail('Обработка фото пока не настроена.', 503);
}
