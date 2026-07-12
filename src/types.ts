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
  avatarScale?: number;
  avatarX?: number;
  avatarY?: number;
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
}

export type FileFormatGroup = 'archive' | 'image' | 'document' | 'other';

export interface PrintFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
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
  colorFillPercent?: number;
  // Коллаж из нескольких фото на одном листе А4 — collageCount хранится
  // только для отображения ("Коллаж А4 · 6 фото"), сама картинка уже
  // собрана в единое изображение и лежит в url/previewUrl как обычно.
  collageCount?: number;
  collagePaper?: 'plain' | 'photo';
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
  // Брак / отказ — независим от основного статуса, т.к. заказ может быть
  // забракован на любой стадии, а не только в конце линейного процесса.
  rejected?: boolean;
  rejectionReason?: string;
  rejectedAt?: string;
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

export interface PaymentConfig {
  bankId: string;
  merchantId: string;
  apiKey: string;
  enableSbp: boolean;
  sbpPhone?: string;
  instructions?: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  price: string;
  emoji: string;
  imageUrl?: string;
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
  paymentConfig?: PaymentConfig;
  siteVisits?: number;
  siteVisitsHistory?: { date: string; count: number }[];
}
