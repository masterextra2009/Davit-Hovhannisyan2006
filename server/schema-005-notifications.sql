-- Уведомления на своём сервере: докладка к schema.sql (таблица notifications
-- там уже есть).
--
-- Зачем отдельная таблица удалений — ровно то же, что и в чате
-- (schema-004-chat.sql): опрос «что нового с такого-то времени» удалённую
-- строку увидеть не может, её уже нет. Удаление по кнопке записываем сюда и
-- отдаём в ответе полем deletedIds.
--
-- Удаление «по старости» (уведомления старше 48 часов) сюда НЕ пишется: этот
-- же срок знает и сам сайт с приложением, они прячут старые уведомления
-- самостоятельно, и гонять через базу сотни записей об этом незачем.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS notification_deletions (
  notification_id VARCHAR(64) NOT NULL,
  user_id         VARCHAR(64) NOT NULL,
  deleted_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (notification_id),
  KEY ix_notif_del_time (deleted_at),
  KEY ix_notif_del_user (user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
