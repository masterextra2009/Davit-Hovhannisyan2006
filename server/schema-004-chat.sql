-- Чат на своём сервере: докладка к schema.sql (таблица chat_messages там уже есть).
--
-- Зачем нужна отдельная таблица удалений: сайт и приложение теперь узнают о
-- новых сообщениях опросом «что изменилось с такого-то времени» (api/v2/chat.php
-- ?action=list&since=…). Удалённую строку такой опрос увидеть не может — её
-- в таблице уже нет. Поэтому факт удаления записываем отдельно, ровно как для
-- заказов (order_deletions в schema-003-orders.sql), и отдаём в ответе поле
-- deletedIds. Записи чистятся сами: всё старше 30 дней удаляется при опросе.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS chat_deletions (
  message_id  VARCHAR(64) NOT NULL,
  user_id     VARCHAR(64) NOT NULL,           -- чей это был диалог
  deleted_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (message_id),
  KEY ix_chat_del_time (deleted_at),
  KEY ix_chat_del_user (user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
