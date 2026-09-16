-- Вход через Google, Telegram, Яндекс ID и VK ID (api/v2/oauth.php).
-- Применяется после schema.sql. Повторный запуск безопасен.

SET NAMES utf8mb4;

ALTER TABLE users MODIFY auth_provider
  ENUM('password','google','telegram','yandex','vk','guest') NOT NULL DEFAULT 'password';

-- Какими соцсетями клиент входит. Один клиент может привязать несколько.
CREATE TABLE IF NOT EXISTS user_identities (
  provider      ENUM('google','telegram','yandex','vk') NOT NULL,
  provider_uid  VARCHAR(128) NOT NULL,              -- id клиента в соцсети
  user_id       VARCHAR(64)  NOT NULL,
  email         VARCHAR(255) NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3)  NULL,
  PRIMARY KEY (provider, provider_uid),
  KEY ix_identities_user (user_id),
  CONSTRAINT fk_identities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Одноразовая метка «этот вход начали у нас» (защита от подмены входа).
-- Живёт 15 минут.
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash    CHAR(64)     NOT NULL,
  provider      ENUM('google','telegram','yandex','vk') NOT NULL,
  source        ENUM('site','app') NOT NULL,
  code_verifier VARCHAR(128) NULL,                  -- PKCE
  expires_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (state_hash),
  KEY ix_oauth_states_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Одноразовый билет, с которым сайт или приложение забирают вход после
-- возврата из соцсети. Для нового клиента в билете лежат имя и почта из
-- соцсети — пока он не дал согласие на обработку данных, аккаунт не
-- создаётся. Живёт 15 минут, просроченные удаляются.
CREATE TABLE IF NOT EXISTS auth_tickets (
  ticket_hash   CHAR(64)     NOT NULL,
  user_id       VARCHAR(64)  NULL,                  -- известный клиент
  profile       JSON         NULL,                  -- новый клиент, ждёт согласия
  source        ENUM('site','app') NOT NULL,
  expires_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (ticket_hash),
  KEY ix_auth_tickets_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
