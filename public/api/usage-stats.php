<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
date_default_timezone_set('Europe/Moscow');
$file = __DIR__ . '/usage-counters.json';
$data = [];
if (file_exists($file)) {
    $decoded = json_decode(file_get_contents($file), true);
    if (is_array($decoded)) $data = $decoded;
}

// Схема до 2026-08-16 хранила плоские ключи без деления "сегодня"/"всего" —
// читаем их как total, чтобы уже накопленные числа не терялись, пока
// usage-counter.php не сделает первую запись в новой схеме.
$total = is_array($data['total'] ?? null) ? $data['total'] : [
    'ai_chat' => $data['ai_chat'] ?? 0,
    'voice' => $data['voice'] ?? 0,
    'photo_check' => $data['photo_check'] ?? 0,
];
$todayData = is_array($data['today'] ?? null) ? $data['today'] : [];
$isToday = ($todayData['date'] ?? '') === date('Y-m-d');

echo json_encode([
    'ai_chat_today' => $isToday ? ($todayData['ai_chat'] ?? 0) : 0,
    'ai_chat_total' => $total['ai_chat'] ?? 0,
    'voice_today' => $isToday ? ($todayData['voice'] ?? 0) : 0,
    'voice_total' => $total['voice'] ?? 0,
    'photo_check_today' => $isToday ? ($todayData['photo_check'] ?? 0) : 0,
    'photo_check_total' => $total['photo_check'] ?? 0,
]);
