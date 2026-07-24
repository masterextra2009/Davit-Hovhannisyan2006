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
  format?: 'a4' | 'a3';
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
}

export interface DatabaseState {
  users: User[];
  orders: Order[];
  chatMessages: ChatMessage[];
  notifications: Notification[];
  services?: Service[];
  siteVisits?: number;
  siteVisitsHistory?: { date: string; count: number }[];
  feedback?: Feedback[];
}
