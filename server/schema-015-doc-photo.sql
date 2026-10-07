-- Фото на документы в приложении (api/v2/doc-photo.php), 03.10.2026.
-- Первая попытка бесплатно (одна на аккаунт), дальше — заказ за 250 ₽:
-- 3 попытки на выбор + печать в мастерской.

-- Каждая обработка фото нейросетью. order_id пуст у бесплатной попытки.
CREATE TABLE IF NOT EXISTS doc_photo_attempts (
  id            VARCHAR(32)  NOT NULL,
  user_id       VARCHAR(64)  NOT NULL,
  order_id      VARCHAR(64)  NULL,
  doc_id        VARCHAR(64)  NOT NULL,
  color         ENUM('color','bw') NOT NULL DEFAULT 'color',
  retouch       VARCHAR(255) NOT NULL DEFAULT '',
  created_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_dpa_user (user_id, created_at),
  KEY ix_dpa_order (order_id),
  KEY ix_dpa_day (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Согласие на обработку фото лица нейросетью (фото уходит в зарубежный сервис).
ALTER TABLE consents MODIFY kind ENUM('personal_data','marketing','offer','ai_photo') NOT NULL;

-- Услуга в витрине: цену берёт orders.php (service_price). В витрине приложения
-- её не показываем — у неё свой экран.
INSERT INTO services (id, title, description, price, is_active)
  VALUES ('doc-photo', 'Фото на документы (ИИ, 3 попытки + печать)', 'Заказ из экрана «Фото на документы» в приложении', '250', 1)
  ON DUPLICATE KEY UPDATE price = VALUES(price), is_active = 1;
