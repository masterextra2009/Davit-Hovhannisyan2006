<?php
// Образец ключей входа через соцсети. На хостинге файл лежит в
// ~/sever-18.ru/.sever18-private/oauth.php (выше public_html, из интернета
// не открывается). Настоящие ключи в git НЕ кладутся.
//
// Адрес возврата, который нужно указать в кабинете каждой соцсети:
//   https://sever-18.ru/api/v2/oauth.php
//
// Пока поле пустое — кнопка этой соцсети отвечает «вход пока не настроен».
return [
    // Google Cloud Console → APIs & Services → Credentials → OAuth client (Web)
    'google' => ['client_id' => '', 'client_secret' => ''],
    // oauth.yandex.ru → Создать приложение (веб-сервисы), доступ: почта, имя, аватар
    'yandex' => ['client_id' => '', 'client_secret' => ''],
    // id.vk.com/business → приложение VK ID (веб), нужен только ID приложения
    'vk' => ['client_id' => ''],
    // Бот @photosever_bot: токен берётся из api/config.php, здесь не нужен
    'telegram' => ['bot_id' => '8854566946'],
];
