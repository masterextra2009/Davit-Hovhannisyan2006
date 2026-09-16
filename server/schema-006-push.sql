-- Push-уведомления: докладка к schema.sql. Выполняется один раз (MySQL 8.4 не
-- умеет ADD COLUMN IF NOT EXISTS — при повторном запуске будет ошибка
-- «Duplicate column name», и это нормально).
--
-- expo_push_token (адрес телефона с приложением) в users уже есть. Добавляем
-- два поля:
--   push_subscription — подписка браузера на уведомления сайта. Сейчас её
--     кладёт в Firestore сама страница; после переезда она будет храниться
--     здесь. Отправкой в браузер займёмся отдельным шагом: там, в отличие от
--     Expo, письмо нужно подписывать и шифровать ключами (VAPID).
--   is_online — «человек прямо сейчас на сайте». Push шлём только тому, кого
--     на сайте нет: иначе он и так видит всё живьём на экране. Раньше это
--     поле было в Firestore, а без него мы бы слали уведомление человеку,
--     который смотрит на тот же чат.

SET NAMES utf8mb4;

ALTER TABLE users
  ADD COLUMN push_subscription JSON NULL AFTER expo_push_token,
  ADD COLUMN is_online TINYINT(1) NOT NULL DEFAULT 0 AFTER last_active_at;
