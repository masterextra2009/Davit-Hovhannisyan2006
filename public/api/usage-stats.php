<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
$file = __DIR__ . '/usage-counters.json';
$data = [];
if (file_exists($file)) {
    $decoded = json_decode(file_get_contents($file), true);
    if (is_array($decoded)) $data = $decoded;
}
echo json_encode([
    'ai_chat' => $data['ai_chat'] ?? 0,
    'voice' => $data['voice'] ?? 0,
    'photo_check' => $data['photo_check'] ?? 0,
]);
