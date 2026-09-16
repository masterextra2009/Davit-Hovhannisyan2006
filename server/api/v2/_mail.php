<?php
declare(strict_types=1);

// Отправка писем с адреса мастерской (info@sever-18.ru).
//
// Раньше этим занимался api/send-email.php, лежащий в открытой части сайта, с
// паролем от почтового ящика прямо в тексте файла. Здесь пароль лежит вне
// сайта — в .sever18-private/mail.php, а сама отправка доступна только нашему
// коду: письмо о восстановлении пароля и письмо клиенту из админки.

/** Настройки почтового ящика: адрес сервера, логин и пароль. */
function mail_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $file = SITE_DIR . '/../.sever18-private/mail.php';
        $cfg = is_readable($file) ? (require $file) : [];
        if (!is_array($cfg)) {
            $cfg = [];
        }
    }
    return $cfg;
}

/**
 * Отправляет письмо. Возвращает true, если почтовый сервер его принял.
 * Текст — обычный, без разметки: письма у нас короткие и служебные.
 */
function send_mail(string $to, string $subject, string $text): bool
{
    $cfg = mail_config();
    foreach (['host', 'port', 'user', 'password'] as $key) {
        if (empty($cfg[$key])) {
            error_log('api/v2 mail: почта не настроена (' . $cfg['host'] ?? '' . ')');
            return false;
        }
    }
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $from = (string) $cfg['user'];
    $fromName = (string) ($cfg['from_name'] ?? 'Фото-Север');
    // Имя отправителя и тема — не латиницей, поэтому по правилам почты их
    // кодируют (иначе в некоторых почтовых программах получится каша).
    $encode = fn(string $s) => '=?UTF-8?B?' . base64_encode($s) . '?=';

    $headers = implode("\r\n", [
        'From: ' . $encode($fromName) . ' <' . $from . '>',
        'To: <' . $to . '>',
        'Subject: ' . $encode($subject),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        'Date: ' . date('r'),
    ]);
    $body = chunk_split(base64_encode($text), 76, "\r\n");

    $conn = @stream_socket_client(
        'ssl://' . $cfg['host'] . ':' . $cfg['port'],
        $errno,
        $errstr,
        20,
        STREAM_CLIENT_CONNECT
    );
    if (!$conn) {
        error_log('api/v2 mail: не подключиться к почтовому серверу: ' . $errstr);
        return false;
    }

    $read = function ($conn): string {
        $data = '';
        while ($line = fgets($conn, 515)) {
            $data .= $line;
            if (substr($line, 3, 1) === ' ') {
                break;
            }
        }
        return $data;
    };
    $cmd = function (string $command, string $expect) use ($conn, $read): bool {
        fwrite($conn, $command . "\r\n");
        $answer = $read($conn);
        if (substr($answer, 0, 3) !== $expect) {
            error_log('api/v2 mail: почтовый сервер ответил «' . trim($answer) . '»');
            return false;
        }
        return true;
    };

    $ok = substr($read($conn), 0, 3) === '220'
        && $cmd('EHLO sever-18.ru', '250')
        && $cmd('AUTH LOGIN', '334')
        && $cmd(base64_encode((string) $cfg['user']), '334')
        && $cmd(base64_encode((string) $cfg['password']), '235')
        && $cmd('MAIL FROM:<' . $from . '>', '250')
        && $cmd('RCPT TO:<' . $to . '>', '250')
        && $cmd('DATA', '354');

    if ($ok) {
        fwrite($conn, $headers . "\r\n\r\n" . $body . "\r\n.\r\n");
        $ok = substr($read($conn), 0, 3) === '250';
    }
    fwrite($conn, "QUIT\r\n");
    fclose($conn);

    return $ok;
}
