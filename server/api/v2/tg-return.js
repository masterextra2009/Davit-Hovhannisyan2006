// Возврат из Telegram: данные входа приходят после «#tgAuthResult=…», а
// серверу эта часть адреса не отправляется. Перекладываем её в обычные
// параметры адреса и перезагружаем страницу — дальше проверяет oauth.php.
(function () {
  var box = document.getElementById('msg');
  var m = location.hash.match(/tgAuthResult=([A-Za-z0-9_\-+/=%]+)/);
  if (!m) {
    box.textContent = 'Вход через Telegram отменён. Закройте это окно и попробуйте ещё раз.';
    return;
  }
  try {
    var s = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var data = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!data || typeof data !== 'object' || !data.hash) {
      box.textContent = 'Вход через Telegram отменён. Закройте это окно и попробуйте ещё раз.';
      return;
    }
    var q = new URLSearchParams(location.search);
    Object.keys(data).forEach(function (k) { q.set(k, String(data[k])); });
    location.replace(location.pathname + '?' + q.toString());
  } catch (e) {
    box.textContent = 'Не удалось прочитать ответ Telegram. Попробуйте ещё раз.';
  }
})();
