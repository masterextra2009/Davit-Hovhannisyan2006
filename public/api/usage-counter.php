<?php
// Файловый счётчик обращений к платным ИИ-функциям (без Firebase) — хранит
// числа в usage-counters.json рядом. Раздельно считает "total" (с самого
// начала, никогда не обнуляется) и "today" (обнуляется каждый день по
// московскому времени — тому же поясу, что у бизнеса и клиентов). Обе
// цифры нужны разом: total — сколько всего потрачено с момента запуска
// счётчика, today — сколько было сегодня.
date_default_timezone_set('Europe/Moscow');

function bump_usage_counter($key) {
    $file = __DIR__ . '/usage-counters.json';
    $data = [];
    $fp = @fopen($file, 'c+');
    if (!$fp) return;
    flock($fp, LOCK_EX);
    $size = filesize($file);
    if ($size > 0) {
        $raw = fread($fp, $size);
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $data = $decoded;
    }

    // Схема до 2026-08-16 хранила плоские ключи без деления на
    // "сегодня"/"всего" — переносим их в total один раз, чтобы уже
    // накопленные числа не обнулились в момент перехода на новую схему.
    if (!isset($data['total']) || !is_array($data['total'])) {
        $data['total'] = [
            'ai_chat' => $data['ai_chat'] ?? 0,
            'voice' => $data['voice'] ?? 0,
            'photo_check' => $data['photo_check'] ?? 0,
        ];
    }
    unset($data['ai_chat'], $data['voice'], $data['photo_check'], $data['date']);

    $today = date('Y-m-d');
    if (!isset($data['today']) || !is_array($data['today']) || ($data['today']['date'] ?? '') !== $today) {
        $data['today'] = ['date' => $today];
    }

    $data['total'][$key] = ($data['total'][$key] ?? 0) + 1;
    $data['today'][$key] = ($data['today'][$key] ?? 0) + 1;

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data));
    flock($fp, LOCK_UN);
    fclose($fp);
}
