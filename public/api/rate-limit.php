<?php
// Shared per-IP rate limiter for cost-sensitive API endpoints
// (ai-chat.php, photo-doc-check.php, payment-create.php all call real
// paid external services with no abuse protection before this).
//
// Require this at the very top of an endpoint, before any expensive
// work. Override the defaults by setting $RATE_LIMIT_MAX /
// $RATE_LIMIT_WINDOW (seconds) before the require.

$__rlMax = isset($RATE_LIMIT_MAX) ? $RATE_LIMIT_MAX : 10;
$__rlWindow = isset($RATE_LIMIT_WINDOW) ? $RATE_LIMIT_WINDOW : 60;

$__rlIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$__rlKey = basename($_SERVER['SCRIPT_NAME'] ?? 'unknown');
$__rlDir = __DIR__ . '/.ratelimit';
if (!is_dir($__rlDir)) {
    @mkdir($__rlDir, 0700);
}
$__rlFile = $__rlDir . '/' . md5($__rlKey . '_' . $__rlIp) . '.json';

$__rlNow = time();
$__rlFp = @fopen($__rlFile, 'c+');
if ($__rlFp) {
    flock($__rlFp, LOCK_EX);
    $__rlContent = stream_get_contents($__rlFp);
    $__rlTimestamps = $__rlContent ? (json_decode($__rlContent, true) ?: []) : [];

    // Drop anything outside the current window.
    $__rlTimestamps = array_values(array_filter($__rlTimestamps, function ($t) use ($__rlNow, $__rlWindow) {
        return ($__rlNow - $t) < $__rlWindow;
    }));

    if (count($__rlTimestamps) >= $__rlMax) {
        flock($__rlFp, LOCK_UN);
        fclose($__rlFp);
        http_response_code(429);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Слишком много запросов. Пожалуйста, подождите немного и попробуйте снова.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $__rlTimestamps[] = $__rlNow;
    ftruncate($__rlFp, 0);
    rewind($__rlFp);
    fwrite($__rlFp, json_encode($__rlTimestamps));
    flock($__rlFp, LOCK_UN);
    fclose($__rlFp);
}
// If the lock file couldn't be opened (permissions issue etc.), fail
// open rather than blocking legitimate traffic — this is a cost
// safety net, not a hard security boundary.
