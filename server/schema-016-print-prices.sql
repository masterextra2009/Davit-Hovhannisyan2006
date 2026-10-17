-- Цены печати из админки (misc.php?action=prices / prices-save), 17.10.2026.
-- Таблицу misc.php создаёт и сам при первом сохранении цен; файл — для записи.
-- Пока записи print_prices нет, сервер считает по ценам из _pricing.php.
CREATE TABLE IF NOT EXISTS app_settings (
  name       VARCHAR(64) NOT NULL,
  value      MEDIUMTEXT  NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
