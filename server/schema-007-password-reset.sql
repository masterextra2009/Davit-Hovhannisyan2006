-- Восстановление пароля: докладка к schema.sql.
--
-- Зачем: до сих пор кнопка «Забыли пароль?» на сайте только показывала
-- «инструкции отправлены», а письма не было вовсе. Пароли клиентов лежат в
-- Google Firebase, и после его отключения забывший пароль остался бы без
-- входа навсегда.
--
-- Храним не саму ссылку, а её отпечаток (sha256): если кто-то доберётся до
-- базы, войти по нему всё равно не выйдет. Ссылка живёт час и срабатывает
-- один раз.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  CHAR(64)    NOT NULL,
  user_id     VARCHAR(64) NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  used_at     DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_hash),
  KEY ix_reset_user (user_id, expires_at),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
