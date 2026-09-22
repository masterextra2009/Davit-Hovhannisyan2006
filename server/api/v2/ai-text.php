<?php
declare(strict_types=1);

/**
 * Помощник по тексту новости (api/v2/ai-text.php?action=improve).
 *
 * Давид пишет новости и акции сам, между делом, и просил «умного ИИ для
 * улучшения текстов и новостей». Здесь ИИ ничего не решает и никуда не
 * публикует: он только переписывает то, что уже набрано, а показать оба
 * варианта рядом и выбрать — дело админки.
 *
 * Почему polza.ai, а не Claude напрямую: так захотел Давид (23.09.2026), и у
 * него там уже есть счёт. Обращение устроено как у OpenAI, поэтому запрос
 * простой.
 *
 * Ключ лежит ВНЕ папки сайта — там же, где настройки базы
 * (~/sever-18.ru/.sever18-private/polza.php). В самом файле сайта ключей быть
 * не должно: ключ от Claude лежал прямо в api/ai-chat.php, и это ровно тот
 * случай, которого здесь избегаем.
 *
 *   POST improve  {title, body}  → {title, body}
 */

require __DIR__ . '/_bootstrap.php';

/**
 * Модель. Самая дешёвая из пригодных: одна правка новости — около копейки.
 * Поменять можно здесь одной строкой, список — на polza.ai/dashboard.
 */
const AI_MODEL = 'openai/gpt-6-luna';
/** Дальше этого не ждём: админка не должна висеть из-за чужого сервера. */
const AI_TIMEOUT = 45;
const AI_MAX_TITLE = 300;
const AI_MAX_BODY = 4000;

$user = require_user();
// Только мастерская: ИИ стоит денег, и тратить их может лишь хозяин.
require_admin($user['role'] === 'admin');

$action = $_GET['action'] ?? '';
if ($action !== 'improve') {
    fail('Неизвестное действие', 404);
}
require_method('POST');

$title = trim(str_field('title', AI_MAX_TITLE));
$body = trim(str_field('body', AI_MAX_BODY));
if ($title === '' && $body === '') {
    fail('Сначала напишите хоть что-нибудь — ИИ правит текст, а не придумывает с нуля');
}

$key = polza_key();

$system = <<<TXT
Ты редактор небольшой фотомастерской «Фото-Север» в подмосковном Раменском.
Печать фото и документов, фото на документы, сувениры.

Твоя работа — привести в порядок объявление, которое владелец набрал наспех:
исправить ошибки, сделать понятнее и приятнее. НИЧЕГО НЕ ВЫДУМЫВАЙ: ни скидок,
ни сроков, ни цен, ни услуг, которых нет в исходном тексте.

Как писать:
— по-русски, просто и по-человечески, без канцелярита и без рекламного крика;
— на «вы», уважительно: среди клиентов много людей старшего возраста;
— заголовок короткий, до 60 знаков, без точки в конце;
— текст — две-три короткие фразы, не длиннее исходного больше чем вдвое;
— никаких смайликов, если их не было в исходном тексте;
— если исходный текст уже хорош, верни его почти как есть.

Ответ — ТОЛЬКО json вида {"title": "...", "body": "..."}, без пояснений и без
разметки. Если заголовок или текст были пустыми, так и оставь их пустыми.
TXT;

$userMsg = "Заголовок: " . ($title === '' ? '(пусто)' : $title) . "\nТекст: " . ($body === '' ? '(пусто)' : $body);

$answer = ask_polza($key, $system, $userMsg);

// Модель просили отвечать чистым json, но подстрахуемся: иногда его
// заворачивают в ```json … ```.
$clean = trim($answer);
$clean = preg_replace('/^```[a-z]*\s*|\s*```$/i', '', $clean) ?? $clean;
$parsed = json_decode($clean, true);
if (!is_array($parsed)) {
    error_log('api/v2 ai-text: ответ не разобрался: ' . mb_substr($answer, 0, 300));
    fail('ИИ ответил непонятно. Попробуйте ещё раз.', 502);
}

respond([
    'ok' => true,
    'title' => mb_substr(trim((string) ($parsed['title'] ?? '')), 0, AI_MAX_TITLE),
    'body' => mb_substr(trim((string) ($parsed['body'] ?? '')), 0, AI_MAX_BODY),
]);

// ─────────────────────────── Ключ и запрос ───────────────────────────

/** Ключ polza.ai из закрытой папки — той же, где настройки базы. */
function polza_key(): string
{
    $candidates = [
        SITE_DIR . '/../.sever18-private/polza.php',
        HOME_DIR . '/private/polza.php',
    ];
    foreach ($candidates as $file) {
        if (is_readable($file)) {
            $c = require $file;
            if (is_array($c) && !empty($c['key'])) {
                return (string) $c['key'];
            }
        }
    }
    error_log('api/v2 ai-text: ключ polza не найден');
    fail('Помощник по тексту пока не настроен.', 503);
}

/** Один вопрос к polza.ai. Обращение такое же, как у OpenAI. */
function ask_polza(string $key, string $system, string $userMsg): string
{
    $payload = json_encode([
        'model' => AI_MODEL,
        'messages' => [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $userMsg],
        ],
        // Короткий ответ: это объявление на пару фраз, а не статья.
        'max_tokens' => 700,
        // Низкая температура: правим текст, а не сочиняем.
        'temperature' => 0.4,
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init('https://polza.ai/api/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => AI_TIMEOUT,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $key,
        ],
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        error_log('api/v2 ai-text: связь с polza.ai: ' . $err);
        fail('Не получилось связаться с помощником. Попробуйте ещё раз.', 502);
    }
    $data = json_decode((string) $raw, true);
    if ($code === 401 || $code === 403) {
        fail('Помощник не пускает: проверьте ключ polza.ai.', 502);
    }
    if ($code === 402 || (isset($data['error']['message']) && stripos((string) $data['error']['message'], 'balance') !== false)) {
        fail('На счету polza.ai закончились деньги.', 402);
    }
    if ($code < 200 || $code >= 300) {
        error_log('api/v2 ai-text: polza ответил ' . $code . ': ' . mb_substr((string) $raw, 0, 300));
        fail('Помощник сейчас недоступен. Попробуйте позже.', 502);
    }
    $text = $data['choices'][0]['message']['content'] ?? '';
    if (!is_string($text) || trim($text) === '') {
        fail('Помощник вернул пустой ответ. Попробуйте ещё раз.', 502);
    }
    return $text;
}
