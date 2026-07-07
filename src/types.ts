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

export interface DatabaseState {
  users: User[];
  orders: Order[];
  chatMessages: ChatMessage[];
  notifications: Notification[];
  paymentConfig?: PaymentConfig;
  siteVisits?: number;
  siteVisitsHistory?: { date: string; count: number }[];
}
