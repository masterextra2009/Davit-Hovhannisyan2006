-- Заказы на своём сервере (api/v2/orders.php). Применяется после schema.sql.
-- Повторный запуск безопасен.

SET NAMES utf8mb4;

-- Номер заказа выдаётся ДО загрузки файлов (файлы называются по номеру).
-- Бронь живёт 6 часов; заказ создаётся только по своей брони.
CREATE TABLE IF NOT EXISTS order_reservations (
  order_id   VARCHAR(64) NOT NULL,
  user_id    VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (order_id),
  KEY ix_reservations_user (user_id),
  KEY ix_reservations_expires (expires_at),
  CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Какие заказы удалены (отмена клиентом, удаление админом). Нужна, чтобы
-- сайт и приложение, опрашивающие «что изменилось», убрали заказ у себя.
-- Хранится 30 дней.
CREATE TABLE IF NOT EXISTS order_deletions (
  order_id   VARCHAR(64) NOT NULL,
  user_id    VARCHAR(64) NOT NULL,
  deleted_at DATETIME(3) NOT NULL,
  PRIMARY KEY (order_id, deleted_at),
  KEY ix_deletions_time (deleted_at),
  KEY ix_deletions_user (user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Счётчик номеров. При переезде выставляется в значение из Firestore
-- (counters/orders.next), чтобы номера не повторились.
INSERT IGNORE INTO counters (name, next) VALUES ('orders', 1000);
