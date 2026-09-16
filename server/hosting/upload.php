<?php
/**
 * upload.php
 *
 * Принимает файл от клиента личного кабинета "Печать 24" и сохраняет
 * его прямо на сервере Beget — вместо Firebase Storage (который теперь
 * требует платный план Blaze даже для бесплатного использования).
 *
 * Файлы сохраняются в папку /uploads/{userId}/ в корне сайта.
 * Эта папка НЕ входит в Git-репозиторий и не затирается при деплое
 * (см. .github/workflows/deploy.yml — флаг --exclude-glob uploads/).
 */

$allowedOrigins = ['https://sever-18.ru', 'https://www.sever-18.ru'];
$requestOrigin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (in_array($requestOrigin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: *');
header('Access-Control-Allow-Credentials: false');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function fail($message, $code = 400) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('Метод не поддерживается', 405);
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $errCode = isset($_FILES['file']) ? $_FILES['file']['error'] : -1;
    $errMessages = [
        UPLOAD_ERR_INI_SIZE   => 'Файл превышает upload_max_filesize в php.ini',
        UPLOAD_ERR_FORM_SIZE  => 'Файл превышает MAX_FILE_SIZE в форме',
        UPLOAD_ERR_PARTIAL    => 'Файл загружен частично',
        UPLOAD_ERR_NO_FILE    => 'Файл не был загружен',
        UPLOAD_ERR_NO_TMP_DIR => 'Отсутствует временная папка',
        UPLOAD_ERR_CANT_WRITE => 'Не удалось записать файл на диск',
        UPLOAD_ERR_EXTENSION  => 'Загрузка остановлена расширением PHP',
    ];
    $errMsg = $errMessages[$errCode] ?? "Неизвестная ошибка (код $errCode)";
    fail($errMsg);
}

// userId передаётся с фронтенда — это id пользователя из Firebase Auth
$userId = isset($_POST['userId']) ? $_POST['userId'] : '';
$userId = preg_replace('/[^a-zA-Z0-9_-]/', '', $userId);
if ($userId === '') {
    fail('Не указан идентификатор пользователя');
}

// Максимальный размер одного файла — 50 МБ
$maxSize = 50 * 1024 * 1024;
if ($_FILES['file']['size'] > $maxSize) {
    fail('Файл слишком большой. Максимальный размер — 50 МБ');
}

// Очищаем имя файла от опасных символов, но оставляем кириллицу и расширение
$originalName = $_FILES['file']['name'];
$safeName = preg_replace('/[^a-zA-Zа-яА-ЯёЁ0-9_.\- ]/u', '_', $originalName);
$safeName = trim($safeName, '_ ');
if ($safeName === '') {
    $safeName = 'file';
}

// Запрещаем загружать исполняемые файлы (на всякий случай, для безопасности)
$forbiddenExt = ['php', 'phtml', 'php3', 'php4', 'php5', 'pl', 'py', 'cgi', 'asp', 'aspx', 'sh', 'exe', 'js'];
$ext = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));
if (in_array($ext, $forbiddenExt, true)) {
    fail('Этот тип файла не поддерживается');
}

$uniqueName = time() . '_' . mt_rand(1000, 9999) . '_' . $safeName;

$baseDir = __DIR__ . '/../uploads';

// Отладочный журнал убран 16.09.2026: он лежал внутри публичной папки
// uploads/ и открывался по прямой ссылке — имена всех присланных клиентами
// файлов (справки, заявления) мог прочитать кто угодно. Сбои видно в
// журнале ошибок сервера.


if (!is_dir($baseDir)) {
    if (!mkdir($baseDir, 0755, true) && !is_dir($baseDir)) {
        fail('Не удалось создать папку для файлов на сервере', 500);
    }
}

// Всегда обновляем .htaccess в папке uploads.
// Убрали Header set / SetEnvIf (требуют mod_headers, который может быть отключён на Beget
// и тогда весь .htaccess ломается с 503). CORS для скачивания не нужен — файлы открываются
// прямой ссылкой через <a href>, а не через fetch().
$htaccessContent = "Options -Indexes\n\n" .
    "<FilesMatch \"\\.(php|phtml|php3|php4|php5|pl|py|cgi|asp|aspx|sh|exe)$\">\n" .
    "  Order allow,deny\n" .
    "  Deny from all\n" .
    "</FilesMatch>\n";
file_put_contents($baseDir . '/.htaccess', $htaccessContent);

$userDir = $baseDir . '/' . $userId;
if (!is_dir($userDir)) {
    if (!mkdir($userDir, 0755, true) && !is_dir($userDir)) {
        fail('Не удалось создать папку пользователя на сервере', 500);
    }
}

$targetPath = $userDir . '/' . $uniqueName;

if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
    error_log('upload.php: не удалось сохранить файл');
    fail('Не удалось сохранить файл на сервере', 500);
}


$publicUrl = 'https://www.sever-18.ru/uploads/' . rawurlencode($userId) . '/' . rawurlencode($uniqueName);

echo json_encode([
    'success' => true,
    'url' => $publicUrl,
], JSON_UNESCAPED_UNICODE);
