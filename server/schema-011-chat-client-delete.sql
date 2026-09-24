-- Клиент удаляет сообщение только у себя (Давид 25.09.2026: «если клиент в
-- чате удаляет — в админке остаётся, пока сам админ не удалит»). Переписка
-- сохраняется у мастерской на случай претензии.
--
-- client_deleted_at — когда клиент убрал сообщение из своей переписки.
-- chat_deletions.client_only = 1 — «удалено» уходит только клиенту, админ
-- продолжает видеть сообщение (с пометкой «удалено клиентом»).

ALTER TABLE chat_messages ADD COLUMN client_deleted_at DATETIME(3) NULL DEFAULT NULL;
ALTER TABLE chat_deletions ADD COLUMN client_only TINYINT(1) NOT NULL DEFAULT 0;
