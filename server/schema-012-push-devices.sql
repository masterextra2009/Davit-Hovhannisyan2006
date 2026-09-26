-- Уведомления на ВСЕ телефоны аккаунта, а не только на последний
-- (Давид 26.09.2026: «да делай»). Раньше у клиента было одно поле
-- users.expo_push_token — второй телефон, где вошли под тем же аккаунтом,
-- перехватывал все уведомления, а первый замолкал без объяснений.
--
-- Один адрес Expo = один телефон с приложением. Телефон принадлежит одному
-- аккаунту: вошли на нём под другим — строка переезжает к новому владельцу.
-- users.expo_push_token остаётся как «последний телефон» для совместимости.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS push_devices (
  token        VARCHAR(255) NOT NULL,
  user_id      VARCHAR(64)  NOT NULL,
  created_at   DATETIME(3)  NOT NULL,
  last_seen_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (token),
  KEY idx_push_devices_user (user_id),
  CONSTRAINT fk_push_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Перенос уже известных телефонов.
INSERT IGNORE INTO push_devices (token, user_id, created_at, last_seen_at)
SELECT expo_push_token, id, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
  FROM users
 WHERE expo_push_token IS NOT NULL AND expo_push_token <> '' AND deleted_at IS NULL;
