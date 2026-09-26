-- Привязка Telegram клиента к аккаунту на своём сервере (26.09.2026).
--
-- Раньше коды привязки лежали в api/telegram_codes.json, а связка
-- «клиент → чат» — в api/telegram_chatids.json. После переезда уведомления
-- шлёт api/v2 и берёт адрес из users.telegram_chat_id — туда старая
-- привязка не писала, и Telegram у новых клиентов молчал.
--
-- Одноразовый код живёт сутки: клиент нажал «Подключить Telegram» на сайте →
-- открыл бота → нажал «Отправить» (/start КОД).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code       VARCHAR(64) NOT NULL,
  user_id    VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (code),
  KEY idx_telegram_link_codes_user (user_id),
  CONSTRAINT fk_telegram_link_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
