/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'client' | 'admin';
  createdAt: string;
  phone?: string;
  avatarUrl?: string;
  isSocial?: boolean;
  // Аккаунт создан анонимно при клике "Загрузить файл" (без пароля/почты) —
  // см. signInAsGuest в firebaseUtils.ts. true, пока клиент не ввёл
  // имя+телефон на оформлении заказа или не завёл полноценный аккаунт.
  isGuest?: boolean;
  isOnline?: boolean;
  lastActiveAt?: string;
  pushSubscription?: PushSubscriptionJSON;
  telegramChatId?: string;
  telegramUsername?: string;
  telegramNotificationsEnabled?: boolean;
  promoExpiresAt?: string;
  promoCode?: string;
  promoDiscount?: number;
  promoGiftedSeen?: boolean;
  // Счётчик успешных бесплатных "Проверка фото на документы" — после
  // DOC_CHECK_FREE_LIMIT (см. Dashboard.tsx) дальнейшие проверки платные.
  docCheckFreeUsed?: number;
  // Реферальная программа. referralCode — свой код для приглашения других
  // (генерируется при регистрации, см. registerUserWithFirebase), referredBy
  // — id того, кто пригласил (если пришёл по чужому коду), referralRewardGranted
  // — награда пригласившему уже выдана после первого оплаченного заказа этого
  // пользователя (флаг именно на приглашённом — не даёт выдать награду дважды).
  referralCode?: string;
  referredBy?: string;
  referralRewardGranted?: boolean;
  // Метка времени последнего нажатия клавиши в поле чата (клиентом) —
  // используется в AdminPanel, чтобы показать «печатает…» пока метка свежая
  // (см. CHAT_TYPING_STALE_MS в AdminPanel.tsx).
  typingChatAt?: string;
}

export type FileFormatGroup = 'archive' | 'image' | 'document' | 'other';

export interface PrintFile {
  id: string;
  name: string;
  size: number;
  // Не заполняются для файлов внутри уже сохранённого заказа (там хранится
  // только то, что нужно для печати) — есть только сразу после загрузки,
  // до отправки заказа.
  type?: string;
  uploadedAt?: string;
  // Ставится только файлам, загруженным через плитку "Документы" на Главной —
  // прячет в модалке настройки печати "Формат" (А3) и переключатель "Бумага"
  // (Обычная/Фото), которые не нужны для обычного документа.
  simplifiedDocsMode?: boolean;
  content?: string; // base64 or description
  formatGroup: FileFormatGroup;
  pageCount?: number;
  url?: string; // File download URL from Firebase Storage
  previewUrl?: string;
  paperType?: 'plain' | 'thick' | 'photo' | 'collage';
  format?: 'a4' | 'a3' | 'binding';
  printColor?: 'bw' | 'color';
  fileCopies?: number;
  photoSize?: string;
  photoBorder?: 'bordered' | 'borderless';
  // Для формата А3 — клиент выбирает между "Чертёж" (офисная бумага, Ч/Б
  // или Цвет — см. printColor) и "Фото" (фотобумага, полноцветная печать)
  // в отдельной модалке, по образцу Полароида.
  a3Kind?: 'chertyozh' | 'photo';
  // Только для "Чертёж" — плотность офисной бумаги, влияет на цену
  // (см. a3FilePrice в Dashboard.tsx).
  a3PaperWeight?: '80' | '200';
  // Только для "Фото" — просто пожелание клиента для печати, на цену не
  // влияет (глянец/матовая стоят одинаково).
  a3PhotoFinish?: 'glossy' | 'matte';
  // Только для формата "binding" (плитка "Брошюровка" на Главной) — тип
  // пружины, выбирается в отдельной модалке по образцу Полароида/А3.
  // Цена — см. bindingFilePrice в Dashboard.tsx (та же ставка, что и у
  // "Отделки" на шаге оформления заказа).
  bindingKind?: 'spring_metal' | 'spring_plastic';
  colorFillPercent?: number;
  // Реальное разрешение картинки в пикселях (натуральный размер, не то, как
  // она отображается на экране) — заполняется асинхронно после загрузки,
  // используется только для предупреждения "фото маловато для этого размера
  // печати" (см. Важное.md, часть 2). Для документов/PDF не заполняется.
  imagePixelWidth?: number;
  imagePixelHeight?: number;
  // Коллаж из нескольких фото на одном листе А4 — collageCount хранится
  // только для отображения ("Коллаж А4 · 6 фото"), сама картинка уже
  // собрана в единое изображение и лежит в url/previewUrl как обычно.
  collageCount?: number;
  collagePaper?: 'plain' | 'photo';
  // Автособранный zip-архив (клиент разом загрузил больше 2 файлов) — один
  // PrintFile представляет весь архив, обычная per-file формула цены (по
  // paperType/photoSize/pageCount) для него не подходит, т.к. внутри могут
  // быть файлы разных типов. Цена вместо этого — просто сумма того, что
  // стоили бы отдельные файлы внутри по умолчанию (см. handleFiles).
  bundleFixedPrice?: number;
  bundleFileCount?: number;
}

export type OrderStatus = 'pending' | 'approved' | 'printing' | 'ready' | 'printed';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed';

export interface Order {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  // Телефон клиента на момент заказа. Пишет мобильное приложение (там он
  // берётся из карточки клиента), чтобы в админке можно было позвонить прямо
  // из карточки заказа. У заказов с сайта и у старых заказов поля нет.
  userPhone?: string;
  // Оформлял ли заказ гость (человек без регистрации). Пишется В САМ ЗАКАЗ в
  // момент оформления, и вот почему: признак isGuest у пользователя через
  // мгновение стирается — оформление заодно дозаполняет профиль именем и
  // телефоном и ставит isGuest: false (см. handlePlaceOrder). Посчитать это
  // задним числом уже нельзя. Определять гостя по пустой почте тоже не выход:
  // почты нет и у входа через Telegram, и у сбойного профиля — пустое место
  // одинаково выглядит во всех трёх случаях. У старых заказов поля нет.
  isGuestOrder?: boolean;
  files: PrintFile[];
  orderDate: string;
  status: OrderStatus;
  totalCost: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  transactionId?: string;
  notes?: string;
  paperType: 'standard' | 'glossy' | 'matte' | 'kraft' | 'standard_a3' | 'bw_a3';
  paperDensity?: string;
  photoSize?: string;
  printColor: 'bw' | 'color' | 'color_full';
  copies: number;
  completedAt?: string;
  binding?: 'none' | 'staple' | 'file' | 'spring_plastic' | 'spring_metal' | 'hard_cover';
  promoCode?: string;
  promoDiscount?: number;
  // Заполняется только для заказов "только услуга" (из витрины услуг, без
  // загруженных файлов) — id услуги в коллекции services, чтобы сервер мог
  // сам проверить актуальную цену вместо доверия totalCost от клиента.
  serviceId?: string;
  // Брак / отказ — независим от основного статуса, т.к. заказ может быть
  // забракован на любой стадии, а не только в конце линейного процесса.
  rejected?: boolean;
  rejectionReason?: string;
  rejectedAt?: string;
  // Оценка клиента после выдачи заказа (см. RatingWidget/handleRate в Dashboard.tsx).
  rating?: 1 | 2 | 3 | 4 | 5;
  ratingComment?: string;
  // Момент, когда заказ перешёл в статус "ready" — нужен серверному напоминанию
  // (Важное.md, часть 3), чтобы посчитать "готов больше 2-3 дней". readyReminderSent
  // защищает от повторной отправки одного и того же напоминания.
  readyAt?: string;
  readyReminderSent?: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string; // client user ID
  senderId: string; // user ID who sent it
  senderRole: 'client' | 'admin';
  senderName: string;
  message: string;
  timestamp: string;
  readByAdmin: boolean;
  readByClient: boolean;
  /** Клиент убрал сообщение у себя; у админа оно остаётся с пометкой. */
  clientDeleted?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  type: 'order_status' | 'chat' | 'payment' | 'profile';
}

export interface Feedback {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  message: string;
  timestamp: string;
  // Заполняется только для сообщений из отдельной формы "Заметили ошибку?" —
  // отличает баг-репорт со скриншотом от обычного пожелания/благодарности.
  isBugReport?: boolean;
  screenshotUrl?: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  price: string;
  emoji: string;
  imageUrl?: string;
  imageScale?: number;
  iconUrl?: string;
  category: string;
  isActive: boolean;
  order: number;
  // Что спросить у клиента при заказе из приложения (витрина услуг, 24.09.2026).
  // Не задано — приложение решает по названию услуги.
  ask?: 'none' | 'file' | 'photo' | '';
  /** Подпись поля для надписи, например «Надпись на кружке». Пусто — поля нет. */
  askText?: string;
  /** Выбор из вариантов: заголовок («Траурная ленточка») и сами варианты. */
  askChoiceTitle?: string;
  askChoices?: string[];
}

// Новость или акция мастерской. Пишется здесь, в админке, и в ту же секунду
// видна клиентам в мобильном приложении — текст лежит в базе, а не в коде,
// поэтому новая акция не требует пересборки приложения.
export interface Promo {
  id: string;
  title: string;
  body: string;
  /** Ссылка на фото ИЛИ видео новости. Файл кладётся на сервер при создании. */
  imageUrl?: string;
  /** Что лежит по imageUrl. Пусто у старых новостей — считаем картинкой. */
  mediaType?: 'image' | 'video';
  /**
   * Настоящие размеры файла в пикселях, замеренные при загрузке в админке.
   * Нужны приложению, чтобы отвести под фото ровно столько места, сколько
   * требуют его пропорции. Без них снимок кладётся в жёсткую полосу и
   * обрезается — вертикальные афиши теряли и заголовок, и срок акции.
   * Пропорцию отдельным числом не храним: по двум размерам она считается,
   * а сами размеры ещё и показывают, не слишком ли мелкий файл загрузили.
   */
  mediaWidth?: number;
  mediaHeight?: number;
  /**
   * Куда ведёт нажатие на карточку. Пусто — карточка просто картинка.
   * Разрешаем только http/https: иначе в ссылку можно подсунуть схему вроде
   * javascript: или intent:, а открывается она уже на телефоне клиента.
   */
  linkUrl?: string;
  /** Снята с показа галочкой. */
  active: boolean;
  /** Показывать с этого дня (ГГГГ-ММ-ДД). Пусто — сразу. */
  from?: string;
  /** Показывать по этот день включительно. Пусто — бессрочно. */
  to?: string;
  createdAt: string;
}

export interface DatabaseState {
  users: User[];
  orders: Order[];
  chatMessages: ChatMessage[];
  notifications: Notification[];
  services?: Service[];
  promos?: Promo[];
  siteVisits?: number;
  siteVisitsHistory?: { date: string; count: number }[];
  feedback?: Feedback[];
}
