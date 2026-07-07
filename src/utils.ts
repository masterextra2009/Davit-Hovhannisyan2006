/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseState, User, Order, ChatMessage, Notification as AppNotification, FileFormatGroup, OrderStatus, PaymentStatus, PrintFile } from './types';

// Broadcaster to keep tabs in sync
const SYNC_CHANNEL_NAME = 'print_shop_sync_channel';
let syncChannel: BroadcastChannel | null = null;
try {
  syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
} catch (e) {
  console.warn('BroadcastChannel not supported', e);
}

// Initial Mock Seed Data
const SEED_USERS: User[] = [
  {
    id: 'u1',
    email: 'admin@print.ru',
    fullName: 'Дмитрий (Администратор)',
    role: 'admin',
    createdAt: '2026-05-01T10:00:00Z',
    phone: '+7 (900) 123-45-67',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'u2',
    email: 'ivan@mail.ru',
    fullName: 'Иван Иванов',
    role: 'client',
    createdAt: '2026-06-01T12:00:00Z',
    phone: '+7 (911) 222-33-44',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
  },
  {
    id: 'u3',
    email: 'anna@yandex.ru',
    fullName: 'Анна Смирнова',
    role: 'client',
    createdAt: '2026-06-03T15:30:00Z',
    phone: '+7 (922) 555-66-77',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
  }
];

const SEED_ORDERS: Order[] = [
  {
    id: 'ORD-1001',
    userId: 'u2',
    userName: 'Иван Иванов',
    userEmail: 'ivan@mail.ru',
    orderDate: '2026-06-05T14:20:00Z',
    status: 'printed',
    totalCost: 450,
    paymentStatus: 'paid',
    paymentMethod: 'СБП (Карта)',
    transactionId: 'TXN-772199827',
    copies: 2,
    paperType: 'standard',
    printColor: 'bw',
    notes: 'Распечатать с двух сторон для отчета в папку.',
    files: [
      {
        id: 'f101',
        name: 'Report_Final_Archive.zip',
        size: 15420100, // ~15.4MB
        type: 'application/zip',
        uploadedAt: '2026-06-05T14:15:00Z',
        formatGroup: 'archive',
      }
    ],
    completedAt: '2026-06-05T16:00:00Z',
  },
  {
    id: 'ORD-1002',
    userId: 'u3',
    userName: 'Анна Смирнова',
    userEmail: 'anna@yandex.ru',
    orderDate: '2026-06-06T11:10:00Z',
    status: 'printing',
    totalCost: 1250,
    paymentStatus: 'paid',
    paymentMethod: 'ЮKassa',
    transactionId: 'TXN-881920392',
    copies: 5,
    paperType: 'glossy',
    printColor: 'color',
    notes: 'Печать презентации в высоком разрешении. Сшивка на пружину.',
    files: [
      {
        id: 'f102',
        name: 'Presentation_Marketing.pdf',
        size: 4520900,
        type: 'application/pdf',
        uploadedAt: '2026-06-06T11:05:00Z',
        formatGroup: 'document',
      },
      {
        id: 'f103',
        name: 'Flyer_Header_Red.png',
        size: 2100800,
        type: 'image/png',
        uploadedAt: '2026-06-06T11:06:00Z',
        formatGroup: 'image',
      }
    ]
  },
  {
    id: 'ORD-1003',
    userId: 'u2',
    userName: 'Иван Иванов',
    userEmail: 'ivan@mail.ru',
    orderDate: '2026-06-07T07:45:00Z',
    status: 'pending',
    totalCost: 180,
    paymentStatus: 'unpaid',
    copies: 1,
    paperType: 'matte',
    printColor: 'bw',
    notes: 'Прошу выставить правильный счет.',
    files: [
      {
        id: 'f104',
        name: 'Contract_Draft.docx',
        size: 345000,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uploadedAt: '2026-06-07T07:42:00Z',
        formatGroup: 'document',
      }
    ]
  }
];

const SEED_CHATS: ChatMessage[] = [
  {
    id: 'c1',
    userId: 'u2',
    senderId: 'u2',
    senderRole: 'client',
    senderName: 'Иван Иванов',
    message: 'Привет! Загрузил архив с отчетом. Подскажите, успеете распечатать к 16:00?',
    timestamp: '2026-06-05T14:22:00Z',
    readByAdmin: true,
    readByClient: true,
  },
  {
    id: 'c2',
    userId: 'u2',
    senderId: 'u1',
    senderRole: 'admin',
    senderName: 'Дмитрий (Администратор)',
    message: 'Добрый день, Иван! Да, конечно. Файл принят в работу, распечатаем вовремя.',
    timestamp: '2026-06-05T14:25:00Z',
    readByAdmin: true,
    readByClient: true,
  },
  {
    id: 'c3',
    userId: 'u2',
    senderId: 'u1',
    senderRole: 'admin',
    senderName: 'Дмитрий (Администратор)',
    message: 'Ваш заказ ORD-1001 готов и ожидает вас!',
    timestamp: '2026-06-05T15:58:00Z',
    readByAdmin: true,
    readByClient: true,
  },
  {
    id: 'c4',
    userId: 'u3',
    senderId: 'u3',
    senderRole: 'client',
    senderName: 'Анна Смирнова',
    message: 'Здравствуйте! Мне очень важна цветопередача рекламных листовок. Бумага глянцевая.',
    timestamp: '2026-06-06T11:15:00Z',
    readByAdmin: true,
    readByClient: true,
  },
  {
    id: 'c5',
    userId: 'u3',
    senderId: 'u1',
    senderRole: 'admin',
    senderName: 'Дмитрий (Администратор)',
    message: 'Здравствуйте! Будет сделано в лучшем виде. Поставил на профессиональный плоттер Epson.',
    timestamp: '2026-06-06T11:20:00Z',
    readByAdmin: true,
    readByClient: true,
  }
];

const SEED_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    userId: 'u2',
    title: 'Заказ выполнен!',
    body: 'Ваш заказ ORD-1001 успешно распечатан и готов к выдаче.',
    timestamp: '2026-06-05T16:00:00Z',
    read: true,
    type: 'order_status',
  },
  {
    id: 'n2',
    userId: 'u3',
    title: 'Заказ оплачен',
    body: 'Оплата по заказу ORD-1002 успешно зачислена. Статус изменен на: Печатается.',
    timestamp: '2026-06-06T11:10:00Z',
    read: false,
    type: 'payment',
  },
  {
    id: 'n3',
    userId: 'u2',
    title: 'Новое сообщение',
    body: 'Администратор Дмитрий ответил на ваш вопрос в чате.',
    timestamp: '2026-06-05T14:25:00Z',
    read: true,
    type: 'chat',
  }
];

const DB_KEY = 'print_shop_database_state';

export function getInitialDatabase(): DatabaseState {
  const cached = localStorage.getItem(DB_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      console.error('Failed to parse database state from localStorage', e);
    }
  }

  // Seed default data
  const state: DatabaseState = {
    users: SEED_USERS,
    orders: SEED_ORDERS,
    chatMessages: SEED_CHATS,
    notifications: SEED_NOTIFICATIONS,
  };
  localStorage.setItem(DB_KEY, JSON.stringify(state));
  return state;
}

export function saveDatabase(state: DatabaseState) {
  localStorage.setItem(DB_KEY, JSON.stringify(state));
  // Notify other tabs
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type: 'SYNC_DB', state });
    } catch (e) {
      console.error('Error posting sync message', e);
    }
  }
}

// Subscribe to database changes (sync)
export function subscribeToDatabaseSync(callback: (state: DatabaseState) => void): () => void {
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === DB_KEY && e.newValue) {
      try {
        callback(JSON.parse(e.newValue));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleChannelMessage = (e: MessageEvent) => {
    if (e.data && e.data.type === 'SYNC_DB') {
      callback(e.data.state);
    }
  };

  window.addEventListener('storage', handleStorageChange);
  if (syncChannel) {
    syncChannel.addEventListener('message', handleChannelMessage);
  }

  return () => {
    window.removeEventListener('storage', handleStorageChange);
    if (syncChannel) {
      syncChannel.removeEventListener('message', handleChannelMessage);
    }
  };
}

// Authentication Helpers
export function getCurrentUser(): User | null {
  const userStr = localStorage.getItem('print_shop_current_user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

export function saveCurrentUser(user: User | null) {
  if (user) {
    localStorage.setItem('print_shop_current_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('print_shop_current_user');
  }
}

// Category extraction from file
export function getFileFormatGroup(fileName: string): FileFormatGroup {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension) return 'other';

  const docExts = ['doc', 'docx', 'xls', 'xlsx', 'pdf', 'txt', 'rtf', 'odt', 'ods', 'ppt', 'pptx'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'tiff', 'webp'];

  if (docExts.includes(extension)) return 'document';
  if (archiveExts.includes(extension)) return 'archive';
  if (imageExts.includes(extension)) return 'image';

  return 'other';
}

// Formatting helpers
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Cost calculator
export function calculateOrderCost(
  pagesOrFileCount: number,
  copies: number,
  paperType: 'standard' | 'glossy' | 'matte' | 'kraft' | 'standard_a3' | 'bw_a3',
  printColor: 'bw' | 'color' | 'color_full',
  paperDensity: string = 'regular',
  files?: PrintFile[],
  photoSize?: string,
  binding?: 'none' | 'staple' | 'file' | 'spring_plastic' | 'spring_metal' | 'hard_cover',
  promoCode?: string,
  customDiscountPercent?: number
): number {
  if (pagesOrFileCount === 0) return 0;

  let totalPages = pagesOrFileCount;
  if (files && files.length > 0) {
    totalPages = files.reduce((acc, f) => acc + (f.pageCount || 1), 0);
  }

  const isA3 = paperType === 'standard_a3' || paperType === 'bw_a3';
  let singlePageCost = 0;

  if (isA3) {
    // A3 paper structure
    const isPhotoPaper = paperType === 'bw_a3'; // bw_a3 is mapped visually and logically to A3 Photo paper
    if (isPhotoPaper) {
      singlePageCost = (printColor === 'bw') ? 200 : 250;
    } else {
      singlePageCost = (printColor === 'bw') ? 100 : 150;
    }
  } else {
    // A4 photo paper or standard (though standard A4 on UI is removed, we keep it for fallback)
    const isPhotoPaper = paperType === 'glossy' || paperType === 'matte';
    if (isPhotoPaper) {
      const sizeStr = photoSize || paperDensity;
      if (sizeStr === '13*18') {
        singlePageCost = 50;
      } else if (sizeStr === '15*20') {
        singlePageCost = 70;
      } else if (sizeStr === '20*30') {
        singlePageCost = 100;
      } else {
        singlePageCost = 20; // 10*15 is 20 rubs
      }
    } else {
      // Standard A4 paper structure
      let baseRate = 20; // Default Ч/Б А4 = 20 ₽
      if (printColor === 'color') {
        baseRate = 25; // Цветная А4 (RGB) = 25 ₽
      } else if (printColor === 'color_full') {
        baseRate = 65; // Цветная 100% заливка А4 = 65 ₽
      }

      // Density additions (only for regular A4 paper)
      const densityAddon = paperDensity === 'thick' ? 10 : 0;
      singlePageCost = baseRate + densityAddon;
    }
  }

  let subtotal = singlePageCost * totalPages * copies;

  // Binding additives per copy
  if (binding && binding !== 'none') {
    let bindingFee = 0;
    if (binding === 'staple') bindingFee = 15;
    else if (binding === 'file') bindingFee = 5;
    else if (binding === 'spring_metal') {
      bindingFee = totalPages <= 100 ? 250 : 350;
    }
    else if (binding === 'spring_plastic') bindingFee = 100;
    else if (binding === 'hard_cover') bindingFee = 450;
    subtotal += (bindingFee * copies);
  }

  // Promo discount calculations
  let discountPercent = 0;
  if (promoCode) {
    const cleanCode = promoCode.trim().toUpperCase();
    if (cleanCode === 'PROMO10') discountPercent = 10;
    else if (cleanCode === 'STUDENT15') discountPercent = 15;
    else if (cleanCode === 'FIRSTFREE') discountPercent = 20;
    else if (cleanCode === 'COPYMAX') discountPercent = 50;
    else if (customDiscountPercent) discountPercent = customDiscountPercent;
    else {
      const match = cleanCode.match(/^GIFT(\d+)$/);
      if (match) {
        discountPercent = parseInt(match[1], 10);
      }
    }
  }

  if (discountPercent > 0) {
    subtotal = subtotal * (1 - discountPercent / 100);
  }

  const grandTotal = Math.round(subtotal);

  // If a promo code is applied, allow the price to drop below 20 rubles (down to 1 ruble minimum)
  if (promoCode && discountPercent > 0) {
    return Math.max(grandTotal, 1);
  }

  return Math.max(grandTotal, 20); // minimum 20 rubles order as requested
}

// Status translators (Russian labels and colors)
export function getStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'pending': return 'Ожидает проверки';
    case 'approved': return 'Одобрен к печати';
    case 'printing': return 'Печатается';
    case 'ready': return 'Готов к выдаче';
    case 'printed': return 'Выдан клиенту';
  }
}

export function getStatusColor(status: OrderStatus): string {
  switch (status) {
    case 'pending': return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50';
    case 'approved': return 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200 dark:border-sky-900/50';
    case 'printing': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 animate-pulse';
    case 'ready': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50';
    case 'printed': return 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-800';
  }
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'unpaid': return 'Не оплачен';
    case 'paid': return 'Оплачен';
    case 'failed': return 'Сбой оплаты';
  }
}

export function getPaymentStatusColor(status: PaymentStatus): string {
  switch (status) {
    case 'unpaid': return 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50';
    case 'paid': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50';
    case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900/50';
  }
}

// EXPORT TO EXCEL (CSV implementation, opens cleanly in Excel)
export function exportToCSV(orders: Order[], title = 'Отчет_Заказов') {
  // Add columns header
  const headers = [
    'ID Заказа',
    'Имя Клиента',
    'Email Клиента',
    'Дата Заказа',
    'Статус Печати',
    'Сумма (₽)',
    'Статус Оплаты',
    'Способ Оплаты',
    'Копии',
    'Тип Бумаги',
    'Цветность',
    'Приоритет/Заметки',
    'Кол-во файлов'
  ];

  const rows = orders.map(ord => [
    ord.id,
    ord.userName,
    ord.userEmail,
    formatDateTime(ord.orderDate),
    getStatusLabel(ord.status),
    ord.totalCost,
    getPaymentStatusLabel(ord.paymentStatus),
    ord.paymentMethod || '—',
    ord.copies,
    ord.paperType === 'standard' ? 'Стандарт (А4)' : ord.paperType === 'glossy' ? 'Глянцевая' : ord.paperType === 'matte' ? 'Матовая' : ord.paperType === 'standard_a3' ? 'Обычная А3' : ord.paperType === 'bw_a3' ? 'Ч/Б А3' : 'Крафтовая',
    ord.paperDensity === 'thick' ? 'Плотная' : 'Обычная',
    ord.printColor === 'bw' ? 'Ч/Б' : 'Цветной',
    (ord.notes || '').replace(/"/g, '""'),
    ord.files.length
  ]);

  // Excel UTF-8 BOM indicator (\uFEFF) is strictly required for Excel Russian cyrillic characters to load properly.
  const csvContent = '\uFEFF' + [
    headers.join(';'),
    ...rows.map(r => r.map(cell => {
      const cellStr = String(cell);
      if (cellStr.includes(';') || cellStr.includes('\n') || cellStr.includes('"')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(';'))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${title}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// EXPORT TO PDF (Generates a clean HTML print window layout representing a system report/invoice)
export function printInvoiceHTML(order: Order) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Пожалуйста, разрешите всплывающее окно для печати отчета.');
    return;
  }

  const filesHtml = order.files.map(f => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${f.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${getFileFormatGroupLabel(f.formatGroup)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${formatFileSize(f.size)}</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>Накладная ${order.id}</title>
        <style>
          body { font-family: "Helvetica Neue", Arial, sans-serif; color: #333; margin: 40px; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; color: #2563eb; }
          .sub-title { font-size: 14px; color: #666; margin-top: 5px; }
          .details { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .details-col { width: 48%; }
          .details-label { font-size: 12px; text-transform: uppercase; color: #888; font-weight: bold; margin-bottom: 4px; }
          .details-val { font-size: 14px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f3f4f6; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; color: #555; }
          .total-box { display: flex; justify-content: flex-end; }
          .total-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; width: 250px; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
          .total-final { border-top: 1px solid #cbd5e1; padding-top: 8px; font-weight: bold; font-size: 18px; color: #1e293b; }
          .footer { text-align: center; font-size: 11px; color: #999; margin-top: 60px; border-top: 1px dashed #ddd; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">КОПИ-ЦЕНТР "Фото-Север"</div>
            <div class="sub-title">Автоматизированная накладная по заказу</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">Адрес: Северное шоссе, 18</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: bold; color: #475569;">${order.id}</div>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">Дата: ${new Date(order.orderDate).toLocaleDateString('ru-RU')}</div>
          </div>
        </div>

        <div class="details">
          <div class="details-col">
            <div class="details-label">Получатель услуги (Клиент)</div>
            <div class="details-val" style="font-size: 16px; font-weight: bold; color: #0f172a;">${order.userName}</div>
            <div class="details-val">${order.userEmail}</div>
            <div class="details-val">${order.paymentMethod ? 'Способ оплаты: ' + order.paymentMethod : 'Не оплачено'}</div>
            <div class="details-val" style="margin-top: 8px; color: #475569;">Приоритет/Заметки: ${order.notes || 'Нет'}</div>
          </div>
          <div class="details-col" style="text-align: right;">
            <div class="details-label">Параметры Печати</div>
            <div class="details-val">Тип бумаги: <strong>${paperTranslate(order.paperType, order.paperDensity)}</strong></div>
            <div class="details-val">Цветность: <strong>${order.printColor === 'bw' ? 'Черно-белая (Ч/Б)' : 'Полноцветная (Color)'}</strong></div>
            <div class="details-val">Количество копий: <strong>${order.copies} шт.</strong></div>
            <div class="details-val" style="margin-top: 12px;">Статус заказа: <span style="padding: 3px 8px; border-radius: 4px; background: #e0f2fe; color: #0369a1; font-weight: bold; font-size:12px;">${getStatusLabel(order.status).toUpperCase()}</span></div>
          </div>
        </div>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 8px; font-size: 14px; text-transform: uppercase; color: #475569;">Список Загруженных Файлов для печати</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 60%;">Имя файла</th>
              <th style="width: 25%;">Формат файла</th>
              <th style="width: 15%; text-align: right;">Размер</th>
            </tr>
          </thead>
          <tbody>
            ${filesHtml}
          </tbody>
        </table>

        <div class="total-box">
          <div class="total-card">
            <div class="total-row">
              <div>Стоимость печати (ед.):</div>
              <div>₽${(order.totalCost / order.copies).toFixed(2)}</div>
            </div>
            <div class="total-row">
              <div>Количество копий:</div>
              <div>x ${order.copies}</div>
            </div>
            <div class="total-row total-final">
              <div>Итого к оплате:</div>
              <div>₽${order.totalCost}</div>
            </div>
            <div style="font-size: 11px; color: #059669; font-weight: bold; text-align: right; margin-top: 4px;">
              ${order.paymentStatus === 'paid' ? '● ОПЛАЧЕНО УСПЕШНО' : '○ ОЖИДАЕТ ОПЛАТЫ'}
            </div>
          </div>
        </div>

        <div class="footer">
          <p>Благодарим за заказ в Копи-Центре "Фото-Север"!</p>
          <p>Адрес выдачи: Северное шоссе, 18 &middot; Встроенный чат поддержки.</p>
          <p style="font-size: 10px; color: #bbb; margin-top: 10px;">ID Огранизатора Транзакции: ${order.transactionId || 'MOCK-BANK-TXID'}</p>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function paperTranslate(paper: string, density?: string): string {
  let label = '';
  switch (paper) {
    case 'standard': label = 'Обычная (А4)'; break;
    case 'glossy': label = 'Глянцевая (Фотобумага)'; break;
    case 'matte': label = 'Матовая (Фотобумага)'; break;
    case 'standard_a3': label = 'Обычная А3'; break;
    case 'bw_a3': label = 'Фото А3'; break;
    default: label = paper;
  }
  if (density) {
    if (density === 'thick') {
      label += ' (Плотная)';
    } else if (density === 'regular') {
      label += ' (Обычная)';
    } else {
      label += ` (Размер: ${density})`;
    }
  }
  return label;
}

function getFileFormatGroupLabel(group: FileFormatGroup): string {
  switch (group) {
    case 'archive': return 'Комплект/Архив';
    case 'image': return 'Изображение';
    case 'document': return 'Документ';
    case 'other': return 'Другой';
  }
}

export interface ClientTier {
  name: 'Новичок' | 'Постоянный клиент' | 'VIP клиент';
  tierCode: 'newbie' | 'loyal' | 'vip';
  icon: 'star' | 'trophy' | 'crown';
  color: string;
  badgeClass: string;
  priority: boolean;
  minAmount: number;
}

export function getClientTierForUser(userId: string, orders: Order[]): ClientTier {
  const userOrders = orders.filter(o => o.userId === userId);
  const totalAmount = userOrders
    .filter(o => o.paymentStatus === 'paid' || o.status === 'printed' || o.status === 'ready')
    .reduce((sum, o) => sum + o.totalCost, 0);

  if (totalAmount >= 50000) {
    return {
      name: 'VIP клиент',
      tierCode: 'vip',
      icon: 'crown',
      color: 'text-amber-500',
      badgeClass: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide border border-amber-300 shadow-sm flex items-center gap-1 shadow-amber-500/10',
      priority: true,
      minAmount: 50000,
    };
  } else if (totalAmount >= 5000) {
    return {
      name: 'Постоянный клиент',
      tierCode: 'loyal',
      icon: 'trophy',
      color: 'text-amber-400',
      badgeClass: 'bg-gradient-to-r from-slate-200 to-amber-100 text-slate-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-slate-300 flex items-center gap-1 shadow-sm',
      priority: false,
      minAmount: 5000,
    };
  } else {
    return {
      name: 'Новичок',
      tierCode: 'newbie',
      icon: 'star',
      color: 'text-indigo-400',
      badgeClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 font-bold px-2.5 py-0.5 rounded-full text-[10px] border border-indigo-150 dark:border-indigo-900/50 flex items-center gap-1 shadow-sm',
      priority: false,
      minAmount: 0,
    };
  }
}

export function playNotificationSound(type: 'message' | 'ready') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    if (type === 'ready') {
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.12, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      playTone(523.25, now, 0.4);      // C5
      playTone(659.25, now + 0.15, 0.4); // E5
      playTone(783.99, now + 0.3, 0.6);  // G5
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    console.warn('AudioContext failed:', e);
  }
}

export function showBrowserNotification(title: string, body: string) {
  if ('Notification' in window) {
    const BrowserNotification = window.Notification;
    if (BrowserNotification.permission === 'granted') {
      try {
        new BrowserNotification(title, { body, icon: '/logo-192.png' });
      } catch (err) {
        console.warn('Silent visual push failed:', err);
      }
    } else if (BrowserNotification.permission !== 'denied') {
      try {
        BrowserNotification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new BrowserNotification(title, { body, icon: '/logo-192.png' });
          }
        });
      } catch (err) {
        console.warn('Permission request failed:', err);
      }
    }
  }
}

export function isWorkingHours(): boolean {
  const date = new Date();
  const day = date.getDay(); // 0: Sunday, 1: Monday, ..., 6: Saturday
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentTimeInMinutes = hours * 60 + minutes;

  if (day >= 1 && day <= 5) {
    // Monday - Friday: 09:00 - 19:00
    return currentTimeInMinutes >= 9 * 60 && currentTimeInMinutes < 19 * 60;
  } else if (day === 6 || day === 0) {
    // Saturday & Sunday: 10:00 - 19:00
    return currentTimeInMinutes >= 10 * 60 && currentTimeInMinutes < 19 * 60;
  }
  return false;
}



