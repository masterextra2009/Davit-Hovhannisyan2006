-- Схема базы MySQL для переезда данных Фото-Севера из Google Firebase в РФ.
--
-- Зачем: закон о персональных данных требует записывать и хранить данные
-- граждан РФ в базах на территории России (152-ФЗ, ст. 18 ч. 5). База живёт
-- на хостинге Beget (mastesu6_sever), рядом с сайтом sever-18.ru.
--
-- Таблицы повторяют коллекции Firestore (src/types.ts), чтобы сайт и
-- приложение переезжали без смены смысла полей. Редкие и меняющиеся поля
-- (параметры печати файла, оформление акции) лежат в JSON-колонках — так же,
-- как сейчас лежат во вложенных объектах Firestore.
--
-- Время храним в UTC как DATETIME(3); строки ISO из Firestore переводятся
-- при переносе.
--
-- MySQL 8.4, кодировка utf8mb4 (эмодзи в чате и в услугах).

SET NAMES utf8mb4;

-- ─────────────────────────── Клиенты и администраторы ───────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(64)  NOT NULL,            -- тот же id, что в Firebase Auth
  email           VARCHAR(255) NULL,
  full_name       VARCHAR(255) NOT NULL DEFAULT '',
  role            ENUM('client','admin') NOT NULL DEFAULT 'client',
  phone           VARCHAR(32)  NULL,
  avatar_url      VARCHAR(1024) NULL,
  -- Пароль: bcrypt/argon2 после переноса. Пока клиент не вошёл после
  -- переезда — NULL, и пароль один раз сверяется с Firebase при первом входе.
  password_hash   VARCHAR(255) NULL,
  auth_provider   ENUM('password','google','telegram','guest') NOT NULL DEFAULT 'password',
  is_guest        TINYINT(1)   NOT NULL DEFAULT 0,
  telegram_chat_id   VARCHAR(64)  NULL,
  telegram_username  VARCHAR(64)  NULL,
  telegram_notifications_enabled TINYINT(1) NOT NULL DEFAULT 0,
  expo_push_token VARCHAR(255) NULL,
  -- Согласие на новости и акции (38-ФЗ, ст. 18): по умолчанию НЕТ. История
  -- согласий и отзывов — в таблице consents, здесь текущее состояние.
  marketing_consent TINYINT(1) NOT NULL DEFAULT 0,
  -- Персональный промокод-подарок
  promo_code      VARCHAR(64)  NULL,
  promo_discount  INT          NULL,
  promo_expires_at DATETIME(3) NULL,
  promo_gifted_seen TINYINT(1) NOT NULL DEFAULT 0,
  -- Приглашения
  referral_code   VARCHAR(32)  NULL,
  referred_by     VARCHAR(64)  NULL,
  referral_reward_granted TINYINT(1) NOT NULL DEFAULT 0,
  -- «Печатает…» в чате (ставит админка)
  admin_typing_at DATETIME(3)  NULL,
  typing_chat_at  DATETIME(3)  NULL,
  last_active_at  DATETIME(3)  NULL,
  doc_check_free_used INT      NOT NULL DEFAULT 0,
  extra           JSON         NULL,                -- прочие редкие поля Firestore
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3)  NULL,                -- удаление аккаунта: данные стираются в течение 30 дней
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_referral (referral_code),
  KEY ix_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Сессии входа (вместо токенов Firebase Auth)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   CHAR(64)    NOT NULL,                -- sha256 от токена; сам токен хранится только у клиента
  user_id      VARCHAR(64) NOT NULL,
  device       VARCHAR(32) NOT NULL DEFAULT 'web',  -- web / app
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at   DATETIME(3) NOT NULL,
  PRIMARY KEY (token_hash),
  KEY ix_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────── Согласия (152-ФЗ, 38-ФЗ) ───────────────────────────
-- Каждое согласие и каждый отзыв — отдельной строкой: так видно, когда, на
-- какую версию документа и откуда клиент согласился. Строки не удаляются
-- при отзыве — отзыв пишется новой строкой.
CREATE TABLE IF NOT EXISTS consents (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      VARCHAR(64)  NOT NULL,
  kind         ENUM('personal_data','marketing','offer') NOT NULL,
  granted      TINYINT(1)   NOT NULL,               -- 1 — дал согласие, 0 — отозвал
  doc_version  VARCHAR(32)  NOT NULL,               -- например «1.0 от 01.07.2026»
  source       ENUM('site','app') NOT NULL,
  ip           VARCHAR(45)  NULL,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_consents_user_kind (user_id, kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────── Заказы ───────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               VARCHAR(64)  NOT NULL,           -- номер заказа (как сейчас в Firestore)
  user_id          VARCHAR(64)  NOT NULL,
  user_name        VARCHAR(255) NOT NULL DEFAULT '',
  user_email       VARCHAR(255) NOT NULL DEFAULT '',
  user_phone       VARCHAR(32)  NULL,
  is_guest_order   TINYINT(1)   NOT NULL DEFAULT 0,
  files            JSON         NOT NULL,           -- PrintFile[] — ссылки на файлы на сервере мастерской
  order_date       DATETIME(3)  NOT NULL,
  status           ENUM('pending','approved','printing','ready','printed') NOT NULL DEFAULT 'pending',
  total_cost       DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_status   VARCHAR(16)  NOT NULL DEFAULT 'unpaid',
  payment_method   VARCHAR(64)  NULL,
  transaction_id   VARCHAR(128) NULL,
  notes            TEXT         NULL,
  paper_type       VARCHAR(32)  NULL,
  paper_density    VARCHAR(32)  NULL,
  photo_size       VARCHAR(32)  NULL,
  print_color      VARCHAR(16)  NULL,
  copies           INT          NOT NULL DEFAULT 1,
  binding          VARCHAR(32)  NULL,
  promo_code       VARCHAR(64)  NULL,
  promo_discount   INT          NULL,
  service_id       VARCHAR(64)  NULL,
  rejected         TINYINT(1)   NOT NULL DEFAULT 0,
  rejection_reason TEXT         NULL,
  rejected_at      DATETIME(3)  NULL,
  rating           TINYINT      NULL,
  rating_comment   TEXT         NULL,
  ready_at         DATETIME(3)  NULL,
  ready_reminder_sent TINYINT(1) NOT NULL DEFAULT 0,
  completed_at     DATETIME(3)  NULL,
  extra            JSON         NULL,
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_orders_user (user_id, order_date),
  KEY ix_orders_status (status),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Счётчики (номер следующего заказа — общий для сайта и приложения)
CREATE TABLE IF NOT EXISTS counters (
  name   VARCHAR(32) NOT NULL,
  next   BIGINT      NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────── Чат ───────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id            VARCHAR(64)  NOT NULL,
  user_id       VARCHAR(64)  NOT NULL,              -- чей это диалог (клиент)
  sender_id     VARCHAR(64)  NOT NULL,
  sender_role   ENUM('client','admin') NOT NULL,
  sender_name   VARCHAR(255) NOT NULL DEFAULT '',
  -- Текст или «[IMAGE]:ссылка», «[VOICE]:сек:ссылка», «[STICKER]:ссылка».
  -- После переезда фото и голосовые лежат файлами на сервере, а не внутри
  -- сообщения — поэтому MEDIUMTEXT хватает с запасом для старых сообщений.
  message       MEDIUMTEXT   NOT NULL,
  created_at    DATETIME(3)  NOT NULL,
  read_by_admin TINYINT(1)   NOT NULL DEFAULT 0,
  read_by_client TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_chat_user_time (user_id, created_at),
  CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────── Уведомления, отзывы ───────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          VARCHAR(64)  NOT NULL,
  user_id     VARCHAR(64)  NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT         NOT NULL,
  type        ENUM('order_status','chat','payment','profile') NOT NULL,
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_notifications_user (user_id, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feedback (
  id             VARCHAR(64)  NOT NULL,
  user_id        VARCHAR(64)  NOT NULL,
  user_name      VARCHAR(255) NOT NULL DEFAULT '',
  user_email     VARCHAR(255) NOT NULL DEFAULT '',
  message        TEXT         NOT NULL,
  is_bug_report  TINYINT(1)   NOT NULL DEFAULT 0,
  screenshot_url VARCHAR(1024) NULL,
  created_at     DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_feedback_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────── Витрина: услуги и акции ───────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id          VARCHAR(64)  NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT         NOT NULL,
  price       VARCHAR(64)  NOT NULL DEFAULT '',
  emoji       VARCHAR(16)  NOT NULL DEFAULT '',
  category    VARCHAR(64)  NOT NULL DEFAULT '',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          NOT NULL DEFAULT 0,
  extra       JSON         NULL,                    -- imageUrl, imageScale, iconUrl
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promos (
  id          VARCHAR(64)  NOT NULL,
  title       VARCHAR(255) NOT NULL DEFAULT '',
  body        TEXT         NOT NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  show_from   DATETIME(3)  NULL,
  show_to     DATETIME(3)  NULL,
  extra       JSON         NULL,                    -- imageUrl, mediaType, размеры, linkUrl
  created_at  DATETIME(3)  NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────── Прочее ───────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  code     VARCHAR(32) NOT NULL,
  user_id  VARCHAR(64) NOT NULL,
  PRIMARY KEY (code),
  CONSTRAINT fk_referral_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Статистика сайта (документы stats/* в Firestore) — как есть, JSON
CREATE TABLE IF NOT EXISTS stats (
  name     VARCHAR(64) NOT NULL,
  data     JSON        NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Номер следующего заказа: при переносе заменяется значением из Firestore counters/orders.
INSERT IGNORE INTO counters (name, next) VALUES ('orders', 1000);
