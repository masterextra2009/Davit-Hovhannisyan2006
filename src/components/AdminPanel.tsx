/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { User, Order, ChatMessage, Notification as AppNotification, PrintFile, OrderStatus, PaymentStatus, PaymentConfig, Service, Feedback } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { LiveClock } from './LiveClock';
import logoImg from '../assets/logo.webp';
import { 
  FileText, Users, Clock, MessageSquare, Download, CheckCircle, 
  Send, RefreshCw, BarChart3, Trash2, Edit3, Save, FileSpreadsheet, 
  Printer, ArrowRight, TrendingUp, DollarSign, Files, Eye, HelpCircle,
  BellRing, LogOut, FileCheck, Settings, Camera, Image as ImageIcon, Key, CreditCard, Check, ShieldAlert, X, ShieldCheck, Gift, Search, Archive, ChevronLeft, Mail, Phone, User as UserIconLucide, Upload, Lightbulb
} from 'lucide-react';
import {
  formatFileSize, formatDateTime, getStatusLabel,
  getStatusColor, getPaymentStatusLabel, getPaymentStatusColor,
  exportToCSV, printInvoiceHTML, calculateOrderCost, getLocalDateKey
} from '../utils';
import { deleteUserAccountWithFirebase, deleteOrderFromFirebase, saveOrderToFirebase, deleteFeedbackFromFirebase } from '../firebaseUtils';
import { db, doc, setDoc, deleteDoc, getDoc } from '../firebase';
import { UserAvatar } from './UserAvatar';
import { EmojiPicker } from './EmojiPicker';
import JSZip from 'jszip';

// Тонкое кольцо прогресса для карточек статистики — одна метрика, один цвет,
// закруглённый конец дуги (см. dataviz: тонкие марки, скруглённые концы).
function MiniRing({ percent, colorClass }: { percent: number; colorClass: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  return (
    <svg width="38" height="38" viewBox="0 0 40 40" className="shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-slate-150 dark:stroke-slate-800" />
      <circle
        cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        className={`${colorClass} transition-all duration-700 ease-out`}
      />
    </svg>
  );
}

// Мини-полоски за последние 7 дней — тот же визуальный язык, что уже
// использовался для "Заходы на сайт", теперь переиспользуется для выручки
// и новых клиентов.
function MiniSparkline({ data, colorClass }: { data: { date: string; value: number }[]; colorClass: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const today = getLocalDateKey();
  return (
    <div className="flex items-end gap-1 h-8 mt-2">
      {data.map((d, i) => {
        const height = Math.max(3, Math.round((d.value / max) * 32));
        const isToday = d.date === today;
        return (
          <div key={i} className="flex-1" title={`${d.date}: ${d.value}`}>
            <div
              className={`w-full rounded-sm transition-all ${isToday ? colorClass : 'bg-slate-300 dark:bg-slate-700'}`}
              style={{ height: `${height}px` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function buildLast7Days<T>(items: T[], getDate: (item: T) => string, getValue: (item: T) => number = () => 1): { date: string; value: number }[] {
  const days: { date: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = getLocalDateKey(d);
    days.push({ date: key, value: 0 });
  }
  const byDate = new Map(days.map(d => [d.date, d]));
  items.forEach(item => {
    const key = getLocalDateKey(new Date(getDate(item)));
    const entry = byDate.get(key);
    if (entry) entry.value += getValue(item);
  });
  return days;
}

interface AdminPanelProps {
  adminUser: User;
  onLogout: () => void;
  database: {
    users: User[];
    orders: Order[];
    chatMessages: ChatMessage[];
    notifications: AppNotification[];
    services?: Service[];
    paymentConfig?: PaymentConfig;
    siteVisits?: number;
    feedback?: Feedback[];
  };
  onUpdateDatabase: (updatedData: {
    orders?: Order[];
    chatMessages?: ChatMessage[];
    notifications?: AppNotification[];
    users?: User[];
    paymentConfig?: PaymentConfig;
  }) => void;
}

export function AdminPanel({ adminUser, onLogout, database, onUpdateDatabase }: AdminPanelProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<'orders' | 'chat' | 'feedback' | 'users' | 'analytics' | 'settings' | 'archive' | 'services'>('orders');

  // 3D tilt effect on sidebar icon hover (mouse tracking) — matches Dashboard client style
  useEffect(() => {
    const icons = document.querySelectorAll('.glass-icon-capsule');
    const handlers: Array<{el: Element, move: any, leave: any}> = [];

    icons.forEach(icon => {
      const move = (e: MouseEvent) => {
        const rect = icon.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        (icon as HTMLElement).style.transform = `perspective(150px) rotateX(${-y * 14}deg) rotateY(${x * 14}deg) translateY(-2px)`;
      };
      const leave = () => {
        (icon as HTMLElement).style.transform = '';
      };
      const parent = icon.closest('button');
      if (parent) {
        parent.addEventListener('mousemove', move);
        parent.addEventListener('mouseleave', leave);
        handlers.push({ el: parent, move, leave });
      }
    });

    return () => {
      handlers.forEach(({ el, move, leave }) => {
        el.removeEventListener('mousemove', move);
        el.removeEventListener('mouseleave', leave);
      });
    };
  }, [activeTab]);

  // Selected user for viewing uploaded files list
  const [selectedUserForFiles, setSelectedUserForFiles] = useState<User | null>(null);

  // Selected client for chat thread
  const [activeChatUserId, setActiveChatUserId] = useState<string>('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showClientInfoPanel, setShowClientInfoPanel] = useState(false);
  const [adminChatInput, setAdminChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // File download mock states
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [zippingOrderId, setZippingOrderId] = useState<string | null>(null);
  const [zipProgress, setZipProgress] = useState(0);

  // Admin file deletion states
  const [adminFileToConfirmDelete, setAdminFileToConfirmDelete] = useState<{ orderId: string; fileId: string } | null>(null);

  // Admin ENTIRE ORDER deletion state
  const [orderToConfirmDelete, setOrderToConfirmDelete] = useState<string | null>(null);

  // Order rejection ("Брак") state — which order's reason box is open, and its draft text
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionReasonDraft, setRejectionReasonDraft] = useState('');

  const handleRejectOrder = (orderId: string, reason: string) => {
    const targetOrder = database.orders.find(o => o.id === orderId);
    if (!targetOrder || !reason.trim()) return;

    const updatedOrders = database.orders.map(o =>
      o.id === orderId
        ? { ...o, rejected: true, rejectionReason: reason.trim(), rejectedAt: new Date().toISOString() }
        : o
    );

    const newNotification: AppNotification = {
      id: 'notif_reject_' + Date.now(),
      userId: targetOrder.userId,
      title: 'Заказ отклонён',
      body: `Заказ ${orderId} не может быть выполнен: ${reason.trim()}`,
      timestamp: new Date().toISOString(),
      read: false,
      type: 'order_status'
    };

    const systemChat: ChatMessage = {
      id: 'c_sys_reject_' + Date.now(),
      userId: targetOrder.userId,
      senderId: adminUser.id,
      senderRole: 'admin',
      senderName: 'Авто-статус Копи-Центра',
      message: `Заказ ${orderId}: Брак — ${reason.trim()}`,
      timestamp: new Date().toISOString(),
      readByAdmin: true,
      readByClient: false
    };

    onUpdateDatabase({
      orders: updatedOrders,
      notifications: [newNotification, ...database.notifications],
      chatMessages: [...database.chatMessages, systemChat]
    });

    fetch('https://sever-18.ru/api/telegram_notify.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: targetOrder.userId,
        text: `⚠️ <b>Фото-Север</b>\n\nЗаказ ${orderId} отклонён: <b>${reason.trim()}</b>`
      })
    }).catch(() => {});

    setRejectingOrderId(null);
    setRejectionReasonDraft('');
  };

  const handleUnrejectOrder = (orderId: string) => {
    const updatedOrders = database.orders.map(o =>
      o.id === orderId
        ? { ...o, rejected: false, rejectionReason: undefined, rejectedAt: undefined }
        : o
    );
    onUpdateDatabase({ orders: updatedOrders });
  };

  const handleAdminDeleteFileFromOrder = async (orderId: string, fileId: string) => {
    const order = database.orders.find(o => o.id === orderId);
    if (!order) return;

    const updatedFiles = order.files.filter(f => f.id !== fileId);

    let updatedOrders;
    if (updatedFiles.length === 0) {
      // If no files are left, delete the entire order
      try {
        await deleteOrderFromFirebase(orderId);
      } catch (err) {
        console.error('Failed to delete order from Firebase:', err);
        setAdminFileToConfirmDelete(null);
        return;
      }

      updatedOrders = database.orders.filter(o => o.id !== orderId);

      const newNotif = {
        id: 'n_' + Date.now(),
        userId: order.userId,
        title: "Заказ отменен",
        body: `Все файлы в заказе ${orderId} были удалены администратором. Заказ отменен.`,
        timestamp: new Date().toISOString(),
        read: false,
        type: 'order_status' as const
      };
      
      onUpdateDatabase({
        orders: updatedOrders,
        notifications: [newNotif, ...database.notifications]
      });
    } else {
      // Recalculate cost
      const newCost = calculateOrderCost(
        updatedFiles.length,
        order.copies,
        order.paperType,
        order.printColor,
        order.paperDensity,
        updatedFiles,
        order.photoSize,
        order.binding,
        order.promoCode,
        order.promoDiscount
      );

      updatedOrders = database.orders.map(o => {
        if (o.id === orderId) {
          return {
            ...o,
            files: updatedFiles,
            totalCost: newCost
          };
        }
        return o;
      });

      const updatedOrderObj = updatedOrders.find(o => o.id === orderId);
      if (updatedOrderObj) {
        try {
          await saveOrderToFirebase(updatedOrderObj);
        } catch (err) {
          console.error('Failed to save order to Firebase:', err);
          setAdminFileToConfirmDelete(null);
          return;
        }
      }

      onUpdateDatabase({
        orders: updatedOrders
      });
    }
    setAdminFileToConfirmDelete(null);
  };

  // NEW: delete an entire order directly, regardless of how many files it has
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [orderDeleteError, setOrderDeleteError] = useState<string | null>(null);

  const handleDeleteEntireOrder = async (orderId: string) => {
    const order = database.orders.find(o => o.id === orderId);
    if (!order) return;

    setDeletingOrderId(orderId);
    setOrderDeleteError(null);

    try {
      await deleteOrderFromFirebase(orderId);
    } catch (err) {
      console.error('Failed to delete order from Firebase:', err);
      setOrderDeleteError('Не удалось удалить заказ из базы данных. Попробуйте еще раз.');
      setDeletingOrderId(null);
      return;
    }

    const updatedOrders = database.orders.filter(o => o.id !== orderId);

    const newNotif = {
      id: 'n_' + Date.now(),
      userId: order.userId,
      title: "Заказ удален",
      body: `Заказ ${orderId} был удален администратором.`,
      timestamp: new Date().toISOString(),
      read: false,
      type: 'order_status' as const
    };

    onUpdateDatabase({
      orders: updatedOrders,
      notifications: [newNotif, ...database.notifications]
    });
    setOrderToConfirmDelete(null);
    setDeletingOrderId(null);
  };

  // Editing Client state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Admin Profiling settings
  const [adminFullName, setAdminFullName] = useState(adminUser.fullName);
  const [adminPhone, setAdminPhone] = useState(adminUser.phone || '');
  const [adminAvatarUrl, setAdminAvatarUrl] = useState(adminUser.avatarUrl || '');
  const avatarFileRef = useRef<HTMLInputElement>(null);
  
  // Bank gateway setting states
  const initialPayConfig = database.paymentConfig || {
    bankId: 'sber',
    merchantId: 'M-10294-88',
    apiKey: '',
    enableSbp: true,
    sbpPhone: '+79998881122',
    instructions: 'Для мгновенной оплаты приложите карту к терминалу или отсканируйте SberPay QR-код',
    companyName: 'ИП Оганнисян Д.В.',
    companyInn: '501110120673',
    companyOgrn: '324774600314137',
    companyAddress: 'г. Раменское, Московская область, Северное шоссе, д. 18',
    refundPolicy: 'Срок возврата денежных средств при отказе от услуг печати до начала производства составляет 1 рабочий день. При обнаружении брака возможен полный перерасчет или перепечатка.',
  };
  const [bankId, setBankId] = useState(initialPayConfig.bankId);
  const [merchantId, setMerchantId] = useState(initialPayConfig.merchantId);
  const [apiKey, setApiKey] = useState(initialPayConfig.apiKey);
  const [enableSbp, setEnableSbp] = useState(initialPayConfig.enableSbp);
  const [sbpPhone, setSbpPhone] = useState(initialPayConfig.sbpPhone || '');
  const [instructions, setInstructions] = useState(initialPayConfig.instructions || '');
  const [companyName, setCompanyName] = useState(initialPayConfig.companyName || 'ИП Оганнисян Д.В.');
  const [companyInn, setCompanyInn] = useState(initialPayConfig.companyInn || '501110120673');
  const [companyOgrn, setCompanyOgrn] = useState(initialPayConfig.companyOgrn || '324774600314137');
  const [companyAddress, setCompanyAddress] = useState(initialPayConfig.companyAddress || 'г. Раменское, Московская область, Северное шоссе, д. 18');
  const [refundPolicy, setRefundPolicy] = useState(initialPayConfig.refundPolicy || 'Срок возврата денежных средств при отказе от услуг печати до начала производства составляет 1 рабочий день. При обнаружении брака возможен полный перерасчет или перепечатка.');

  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [exportingBackup, setExportingBackup] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Admin notification toast
  const [adminToast, setAdminToast] = useState<{type: 'order'|'chat'; text: string} | null>(null);
  // null = ещё не видели ни одного реального снимка данных из Firestore.
  // Firestore догружает данные асинхронно уже после первого рендера — на тот
  // момент database.orders/chatMessages ещё может быть пустым массивом-
  // заглушкой, и когда следом прилетают настоящие (старые) записи, простое
  // сравнение количества "было/стало" ошибочно засчитывало их как новые —
  // отсюда баг "при каждом входе всплывает уведомление о старом сообщении".
  // Вместо счётчика сравниваем время создания записи с моментом монтирования
  // компонента и не даём одному и тому же ID уведомить дважды.
  const mountTimeRef = useRef(Date.now());
  const notifiedOrderIdsRef = useRef(new Set<string>());
  const notifiedChatIdsRef = useRef(new Set<string>());

  // Play notification sound
  const playNotifSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  };

  // Watch for new orders and chat messages
  useEffect(() => {
    const latest = database.orders[0];
    if (!latest) return;
    const createdAt = new Date(latest.orderDate).getTime();
    if (createdAt > mountTimeRef.current && !notifiedOrderIdsRef.current.has(latest.id)) {
      notifiedOrderIdsRef.current.add(latest.id);
      const msg = `📦 Новый заказ от ${latest.userName || 'клиента'}`;
      setAdminToast({ type: 'order', text: msg });
      playNotifSound();
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Фото-Север', { body: msg, icon: '/logo-192.png' });
      }
      setTimeout(() => setAdminToast(null), 5000);
    }
  }, [database.orders]);

  useEffect(() => {
    const latest = database.chatMessages[database.chatMessages.length - 1];
    if (!latest || latest.senderRole !== 'client') return;
    const sentAt = new Date(latest.timestamp).getTime();
    if (sentAt > mountTimeRef.current && !notifiedChatIdsRef.current.has(latest.id)) {
      notifiedChatIdsRef.current.add(latest.id);
      const msg = `💬 Новое сообщение от ${latest.senderName}`;
      setAdminToast({ type: 'chat', text: msg });
      playNotifSound();
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Фото-Север', { body: msg, icon: '/logo-192.png' });
      }
      setTimeout(() => setAdminToast(null), 5000);
    }
  }, [database.chatMessages]);

  // Gift Promo Code state
  const [promoGiftUser, setPromoGiftUser] = useState<User | null>(null);
  const [givingPromoCode, setGivingPromoCode] = useState('');
  const [givingPromoDiscount, setGivingPromoDiscount] = useState<number>(10);

  // Email to client state
  const [emailComposeUser, setEmailComposeUser] = useState<User | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSendResult, setEmailSendResult] = useState<'ok' | 'error' | null>(null);

  const handleSendEmailToClient = async () => {
    if (!emailComposeUser || !emailSubject.trim() || !emailBody.trim()) return;
    setIsSendingEmail(true);
    setEmailSendResult(null);
    const minDelay = new Promise(resolve => setTimeout(resolve, 1800));
    try {
      const [res] = await Promise.all([
        fetch('https://sever-18.ru/api/send-email.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emailComposeUser.email,
            subject: emailSubject.trim(),
            message: emailBody.trim(),
          }),
        }),
        minDelay,
      ]);
      if (!res.ok) throw new Error('send failed');
      setEmailSendResult('ok');
    } catch {
      await minDelay;
      setEmailSendResult('error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleCloseEmailModal = () => {
    setEmailComposeUser(null);
    setEmailSubject('');
    setEmailBody('');
    setEmailSendResult(null);
  };

  // Archive search — by amount, name, email or date
  const [archiveSearch, setArchiveSearch] = useState('');

  // Авто-удаление выданных заказов через 48 часов после выдачи
  useEffect(() => {
    const autoDelete = async () => {
      const now = Date.now();
      const ms48h = 48 * 60 * 60 * 1000;
      const toDelete = database.orders.filter(o => {
        if (o.status !== 'printed') return false;
        const t = new Date(o.completedAt || o.orderDate).getTime();
        return (now - t) > ms48h;
      });
      for (const o of toDelete) {
        try { await deleteOrderFromFirebase(o.id); } catch {}
      }
      if (toDelete.length > 0) {
        onUpdateDatabase({ orders: database.orders.filter(o => !toDelete.find(d => d.id === o.id)) });
      }
    };
    autoDelete();
    const iv = setInterval(autoDelete, 60 * 60 * 1000);
    return () => clearInterval(iv);
  }, [database.orders.length]);

  useEffect(() => {
    setAdminFullName(adminUser.fullName);
    setAdminPhone(adminUser.phone || '');
    setAdminAvatarUrl(adminUser.avatarUrl || '');
  }, [adminUser]);

  // Services showcase management — добавление новой услуги через
  // всплывающее окно с явной кнопкой "Сохранить", а не автосохранением
  // по уходу курсора (как у уже существующих карточек в сетке).
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [newServiceForm, setNewServiceForm] = useState({
    emoji: '🖨️',
    title: '',
    description: '',
    price: '',
    imageUrl: '',
    imageScale: 1,
    iconUrl: '',
  });
  const [newServiceUploading, setNewServiceUploading] = useState(false);

  const handleNewServicePhotoUpload = async (file: File) => {
    setNewServiceUploading(true);
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res = await fetch('https://sever-18.ru/api/service-upload.php', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setNewServiceForm(f => ({ ...f, imageUrl: data.url }));
      }
    } catch {
      alert('Ошибка загрузки фото');
    } finally {
      setNewServiceUploading(false);
    }
  };

  const handleNewServiceIconUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res = await fetch('https://sever-18.ru/api/service-upload.php', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setNewServiceForm(f => ({ ...f, iconUrl: data.url }));
      }
    } catch {
      alert('Ошибка загрузки иконки');
    }
  };

  const handleExistingServiceIconUpload = async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res = await fetch('https://sever-18.ru/api/service-upload.php', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        handleUpdateService(id, 'iconUrl', data.url);
      }
    } catch {
      alert('Ошибка загрузки иконки');
    }
  };

  const handleCreateService = () => {
    const newId = `svc_${Date.now()}`;
    const newService = {
      id: newId,
      title: newServiceForm.title.trim() || 'Новая услуга',
      description: newServiceForm.description.trim(),
      price: newServiceForm.price.trim() || '0 ₽',
      emoji: newServiceForm.emoji || '🖨️',
      ...(newServiceForm.imageUrl ? { imageUrl: newServiceForm.imageUrl, imageScale: newServiceForm.imageScale || 1 } : {}),
      ...(newServiceForm.iconUrl ? { iconUrl: newServiceForm.iconUrl } : {}),
      category: 'print',
      isActive: true,
      order: (database.services?.length || 0) + 1,
    };
    setDoc(doc(db, 'services', newId), newService).catch(console.error);
    setShowAddServiceModal(false);
    setNewServiceForm({ emoji: '🖨️', title: '', description: '', price: '', imageUrl: '', imageScale: 1, iconUrl: '' });
  };

  const handleUpdateService = (id: string, field: string, value: any) => {
    const svc = database.services?.find(s => s.id === id);
    if (!svc) return;
    setDoc(doc(db, 'services', id), { ...svc, [field]: value }, { merge: true }).catch(console.error);
  };

  const handleDeleteService = (id: string, title: string) => {
    if (!window.confirm(`Удалить услугу «${title}»?`)) return;
    deleteDoc(doc(db, 'services', id)).catch(console.error);
  };

  // 3D-наклон карточки услуги вслед за курсором + усиление свечения —
  // тот же эффект, что и в клиентской витрине (см. Dashboard.tsx).
  const handleServiceCardTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -8;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 10;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    const glow = card.querySelector('.service-card-glow') as HTMLElement | null;
    if (glow) glow.style.opacity = '1';
  };
  const handleServiceCardTiltReset = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform = '';
    const glow = card.querySelector('.service-card-glow') as HTMLElement | null;
    if (glow) glow.style.opacity = '0';
  };

  const handleSaveSettings = () => {    setSavingSettings(true);
    setSaveSuccess(false);

    const updatedUsers = database.users.map(u => 
      u.id === adminUser.id 
        ? { 
            ...u, 
            fullName: adminFullName,
            phone: adminPhone,
            avatarUrl: adminAvatarUrl,
          }
        : u
    );

    const updatedPaymentConfig = {
      bankId,
      merchantId,
      apiKey,
      enableSbp,
      sbpPhone,
      instructions,
      companyName,
      companyInn,
      companyOgrn,
      companyAddress,
      refundPolicy,
    };

    setTimeout(() => {
      onUpdateDatabase({
        users: updatedUsers,
        paymentConfig: updatedPaymentConfig
      });
      setSavingSettings(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    }, 600);
  };

  // Ручной экспорт всей базы (заказы/клиенты/чат/etc.) в один JSON-файл на
  // диск администратора. Проект на бесплатном тарифе Firebase Spark, где
  // нет автоматических запланированных бэкапов Firestore (это требует
  // платного Blaze) — до апгрейда тарифа это единственная защита от потери
  // всех данных при случайном удалении/сбое. Читает данные, уже загруженные
  // в состояние приложения (без лишних Firestore-запросов), плюс отдельно
  // счётчик посещений и заказов, которых нет в общем database-объекте.
  const handleExportBackup = async () => {
    setExportingBackup(true);
    setExportError(null);
    try {
      const [statsSnap, countersSnap] = await Promise.all([
        getDoc(doc(db, 'stats', 'visits')),
        getDoc(doc(db, 'counters', 'orders')),
      ]);

      const backup = {
        exportedAt: new Date().toISOString(),
        users: database.users,
        orders: database.orders,
        chatMessages: database.chatMessages,
        notifications: database.notifications,
        services: database.services || [],
        feedback: database.feedback || [],
        stats: statsSnap.exists() ? statsSnap.data() : null,
        counters: countersSnap.exists() ? countersSnap.data() : null,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sever18-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup export failed:', err);
      setExportError('Не удалось создать резервную копию. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setExportingBackup(false);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAdminAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const watermarkAndSendImage = (file: File) => {
    if (!activeChatUserId) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Scale to max 1200px
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;

        ctx.drawImage(img, 0, 0, w, h);
        ctx.save();
        
        // Watermark: semi-transparent diagonal white text with shadow
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-Math.PI / 6);
        
        const fontSize = Math.max(22, Math.round(w / 11));
        ctx.font = `bold ${fontSize}px "Inter", "system-ui", sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.44)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = fontSize / 7;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText('ПРИМЕР', 0, 0);
        ctx.fillText('ПРИМЕР', -fontSize * 2.5, 0);
        ctx.fillText('ПРИМЕР', fontSize * 2.5, 0);
        
        ctx.restore();

        const watermarkedData = canvas.toDataURL('image/jpeg', 0.82);

        const newMsg: ChatMessage = {
          id: 'c_ad_attach_' + Date.now(),
          userId: activeChatUserId,
          senderId: adminUser.id,
          senderRole: 'admin',
          senderName: adminUser.fullName,
          message: '[IMAGE]:' + watermarkedData,
          timestamp: new Date().toISOString(),
          readByAdmin: true,
          readByClient: false
        };

        onUpdateDatabase({
          chatMessages: [...database.chatMessages, newMsg]
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Filtering orders
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'printing' | 'ready' | 'printed'>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // Derived lists
  const clientsOnly = database.users.filter(u => u.role === 'client');
  const sortedOrders = [...database.orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

  // Список клиентов теперь открывается по умолчанию (без автовыбора первого чата) —
  // это нужно для режима "как в Telegram": назад = список, а не мгновенный переход в чат.

  // Read message handler - mark client chats as read by admin
  useEffect(() => {
    if (activeChatUserId) {
      const unreadFromActive = database.chatMessages.filter(
        c => c.userId === activeChatUserId && c.senderRole === 'client' && !c.readByAdmin
      );
      if (unreadFromActive.length > 0) {
        const updatedChats = database.chatMessages.map(c => {
          if (c.userId === activeChatUserId && c.senderRole === 'client') {
            return { ...c, readByAdmin: true };
          }
          return c;
        });
        onUpdateDatabase({ chatMessages: updatedChats });
      }
    }
  }, [activeChatUserId, database.chatMessages.length]);

  // Scroll chat operator window — instant (not smooth) so it opens already at
  // the latest message instead of visibly scrolling down to find it. A delayed
  // re-scroll catches sticker/photo messages that load asynchronously and grow
  // the list's height right after the first scroll.
  useLayoutEffect(() => {
    if (activeTab !== 'chat' || !chatBottomRef.current) return;
    chatBottomRef.current.scrollIntoView({ behavior: 'auto' });
    const t = setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }, 400);
    return () => clearTimeout(t);
  }, [activeTab, activeChatUserId, database.chatMessages.length]);

  // Order print status modifier
  const handleUpdateOrderStatus = (orderId: string, newStatus: OrderStatus) => {
    const targetOrder = database.orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    const updatedOrders = database.orders.map(o => {
      if (o.id === orderId) {
        const updates: Partial<Order> = { status: newStatus };
        if (newStatus === 'printed') {
          updates.completedAt = new Date().toISOString();
        }
        return { ...o, ...updates };
      }
      return o;
    });

    // При выдаче — переключаем на архив
    if (newStatus === 'printed') {
      setTimeout(() => setActiveTab('archive'), 800);
    }

    // Create alert system notification
    const newNotification: AppNotification = {
      id: 'notif_' + Date.now(),
      userId: targetOrder.userId,
      title: 'Статус печати изменен',
      body: `Заказ ${orderId} подготовлен. Текущий статус: ${getStatusLabel(newStatus)}`,
      timestamp: new Date().toISOString(),
      read: false,
      type: 'order_status'
    };

    // Auto append a helpful chat notification
    const shortStatusLabels: Record<OrderStatus, string> = {
      pending: 'Принят',
      approved: 'Одобрен',
      printing: 'Печать',
      ready: 'Готов',
      printed: 'Выдан'
    };
    const systemChat: ChatMessage = {
      id: 'c_sys_' + Date.now(),
      userId: targetOrder.userId,
      senderId: adminUser.id,
      senderRole: 'admin',
      senderName: 'Авто-статус Копи-Центра',
      message: `Заказ ${orderId}: ${shortStatusLabels[newStatus]}`,
      timestamp: new Date().toISOString(),
      readByAdmin: true,
      readByClient: false
    };

    onUpdateDatabase({
      orders: updatedOrders,
      notifications: [newNotification, ...database.notifications],
      chatMessages: [...database.chatMessages, systemChat]
    });

    // Уведомляем клиента в Telegram, если он его подключил — доходит, даже если сайт закрыт
    fetch('https://sever-18.ru/api/telegram_notify.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: targetOrder.userId,
        text: `🖨 <b>Фото-Север</b>\n\nСтатус заказа ${orderId} изменён: <b>${getStatusLabel(newStatus)}</b>`
      })
    }).catch(() => {});
  };

  // Payment status overriding manually if cash received
  const handleTogglePaymentStatus = (orderId: string) => {
    const updatedOrders = database.orders.map(o => {
      if (o.id === orderId) {
        const isPaid = o.paymentStatus === 'paid';
        return {
          ...o,
          paymentStatus: (isPaid ? 'unpaid' : 'paid') as PaymentStatus,
          paymentMethod: isPaid ? undefined : 'Наличные в Копи-центре',
          transactionId: isPaid ? undefined : 'CASH-' + Math.floor(100000 + Math.random() * 900000)
        };
      }
      return o;
    });

    onUpdateDatabase({ orders: updatedOrders });
  };

  // Simulated PC Download Progress bar
  const triggerSimulatedDownload = (file: PrintFile) => {
    if (downloadingFileId) return;
    if (!file.url) {
      alert('У этого файла нет ссылки для скачивания.');
      return;
    }

    setDownloadingFileId(file.id);
    setDownloadProgress(50);

    try {
      // Формируем ссылку через download.php — принудительное скачивание
      const urlPath = file.url.replace(/https?:\/\/(www\.)?sever-18\.ru\//, '');
      const downloadUrl = `https://sever-18.ru/api/download.php?file=${encodeURIComponent(urlPath)}&name=${encodeURIComponent(file.name)}`;

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadProgress(100);
    } catch {
      window.open(file.url, '_blank');
    } finally {
      setTimeout(() => {
        setDownloadingFileId(null);
        setDownloadProgress(0);
      }, 1500);
    }
  };

  const handleDownloadAllAsZip = async (order: Order) => {
    if (zippingOrderId) return;
    setZippingOrderId(order.id);
    setZipProgress(0);

    try {
      const zip = new JSZip();
      const filesCount = order.files?.length || 0;
      let fetchedCount = 0;
      
      for (let i = 0; i < filesCount; i++) {
        const file = order.files[i];
        setZipProgress(Math.round((i / filesCount) * 80));

        if (file.url && (file.url.startsWith('http') || file.url.startsWith('https'))) {
          try {
            // Если файл на нашем сервере — загружаем через прокси (обходит CORS)
            let fetchUrl = file.url;
            if (file.url.includes('sever-18.ru/uploads/')) {
              const urlPath = file.url.replace(/https?:\/\/(www\.)?sever-18\.ru\//, '');
              fetchUrl = `https://sever-18.ru/api/download.php?file=${encodeURIComponent(urlPath)}&name=${encodeURIComponent(file.name)}`;
            }
            const res = await fetch(fetchUrl);
            if (res.ok) {
              const blob = await res.blob();
              zip.file(file.name, blob);
              fetchedCount++;
            } else {
              console.warn(`Файл недоступен (${res.status}): ${file.url}`);
            }
          } catch (e) {
            console.warn('Не удалось загрузить файл для ZIP:', file.url, e);
          }
        } else if (file.url && file.url.startsWith('data:')) {
          const parts = file.url.split(',');
          if (parts.length > 1) {
            zip.file(file.name, parts[1], { base64: true });
            fetchedCount++;
          }
        }
      }

      if (fetchedCount === 0) {
        alert('Ни один файл не удалось загрузить для архива. Попробуйте скачать файлы по одному.');
        return;
      }

      setZipProgress(100);
      const content = await zip.generateAsync({ type: 'blob' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `Заказ_${order.id.substring(0, 7)}_Все_файлы_${filesCount}_шт.zip`;
      link.click();

      setTimeout(() => {
        setZippingOrderId(null);
      }, 500);

    } catch (err) {
      console.error('Zip generation failed:', err);
      setZippingOrderId(null);
    }
  };

  // Send admin chat response
  const handleAdminSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminChatInput.trim() || !activeChatUserId) return;

    const newMsg: ChatMessage = {
      id: 'c_ad_' + Date.now(),
      userId: activeChatUserId,
      senderId: adminUser.id,
      senderRole: 'admin',
      senderName: adminUser.fullName,
      message: adminChatInput.trim(),
      timestamp: new Date().toISOString(),
      readByAdmin: true,
      readByClient: false
    };

    onUpdateDatabase({
      chatMessages: [...database.chatMessages, newMsg]
    });

    // Отправляем Telegram-уведомление клиенту если он подключил Telegram
    const client = database.users.find(u => u.id === activeChatUserId);
    if (client?.telegramChatId || client?.telegramUsername) {
      fetch('https://sever-18.ru/api/telegram_notify.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeChatUserId,
          text: `💬 <b>Фото-Север</b>\n\n${adminChatInput.trim()}\n\n<i>Ответить можно в личном кабинете: https://sever-18.ru</i>`
        })
      }).catch(() => {});
    }

    setAdminChatInput('');
  };

  // Отправка стикера — уходит сразу же по клику, как в Telegram
  const handleSendSticker = (sticker: { src: string; label: string }) => {
    if (!activeChatUserId) return;
    const fullUrl = window.location.origin + sticker.src;

    const newMsg: ChatMessage = {
      id: 'c_ad_sticker_' + Date.now(),
      userId: activeChatUserId,
      senderId: adminUser.id,
      senderRole: 'admin',
      senderName: adminUser.fullName,
      message: '[STICKER]:' + fullUrl,
      timestamp: new Date().toISOString(),
      readByAdmin: true,
      readByClient: false
    };

    onUpdateDatabase({
      chatMessages: [...database.chatMessages, newMsg]
    });

    const client = database.users.find(u => u.id === activeChatUserId);
    if (client?.telegramChatId || client?.telegramUsername) {
      fetch('https://sever-18.ru/api/telegram_notify.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeChatUserId,
          text: `💬 <b>Фото-Север</b>\\n\\nОтправлен стикер: ${sticker.label}\\n\\n<i>Ответить можно в личном кабинете: https://sever-18.ru</i>`
        })
      }).catch(() => {});
    }
  };

  // Edit / update client contact
  const handleStartEditUser = (u: User) => {
    setEditingUserId(u.id);
    setEditFullName(u.fullName);
    setEditPhone(u.phone || '');
  };

  const handleSaveUser = () => {
    if (!editingUserId) return;

    const updatedUsers = database.users.map(u => {
      if (u.id === editingUserId) {
        return {
          ...u,
          fullName: editFullName.trim(),
          phone: editPhone.trim()
        };
      }
      return u;
    });

    onUpdateDatabase({ users: updatedUsers });
    setEditingUserId(null);
  };

  const handleGiftPromoSubmit = () => {
    if (!promoGiftUser) return;
    const code = givingPromoCode.trim().toUpperCase() || `GIFT${givingPromoDiscount}`;
    
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

    const updatedUsers = database.users.map(u => {
      if (u.id === promoGiftUser.id) {
        return {
          ...u,
          promoCode: code,
          promoDiscount: givingPromoDiscount,
          promoGiftedSeen: false,
          promoExpiresAt: oneWeekFromNow.toISOString()
        };
      }
      return u;
    });

    onUpdateDatabase({ users: updatedUsers });
    setPromoGiftUser(null);
    setGivingPromoCode('');
  };

  // Custom Delete User Modal State
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    setDeleteError(null);

    const clientId = userToDelete.id;
    try {
      await deleteUserAccountWithFirebase(clientId);
    } catch (err) {
      console.error('Failed to delete user account with Firebase:', err);
      setDeleteError('Не удалось полностью удалить пользователя и связанные данные из Firestore. Проверьте соединение.');
      setIsDeletingUser(false);
      return;
    }

    const filteredUsers = database.users.filter(u => u.id !== clientId);
    const filteredOrders = database.orders.filter(o => o.userId !== clientId);
    const filteredChats = database.chatMessages.filter(c => c.userId !== clientId);
    const filteredNotifs = database.notifications.filter(n => n.userId !== clientId);

    onUpdateDatabase({
      users: filteredUsers,
      orders: filteredOrders,
      chatMessages: filteredChats,
      notifications: filteredNotifs
    });

    if (activeChatUserId === clientId) {
      const remainingClients = filteredUsers.filter(u => u.role === 'client');
      setActiveChatUserId(remainingClients.length > 0 ? remainingClients[0].id : '');
    }

    setUserToDelete(null);
    setIsDeletingUser(false);
  };

  // Clear chat history with a single client (keeps account, orders, everything else intact)
  const handleClearChatHistory = (clientId: string) => {
    if (!clientId) return;
    const clientName = clientsOnly.find(u => u.id === clientId)?.fullName || 'этого клиента';
    const confirmed = window.confirm(`Удалить всю историю переписки с ${clientName}? Это действие нельзя отменить.`);
    if (!confirmed) return;

    const filteredChats = database.chatMessages.filter(c => c.userId !== clientId);
    onUpdateDatabase({ chatMessages: filteredChats });
  };

  // Delete a single chat message
  const handleDeleteMessage = (messageId: string) => {
    const filteredChats = database.chatMessages.filter(c => c.id !== messageId);
    onUpdateDatabase({ chatMessages: filteredChats });
  };

  // ANALYTICS COMPUTATIONS
  const totalRevenue = database.orders
    .filter(o => o.paymentStatus === 'paid')
    .reduce((sum, current) => sum + current.totalCost, 0);

  const pendingCount = database.orders.filter(o => o.status === 'pending').length;
  const inPrintCount = database.orders.filter(o => o.status === 'printing').length;
  const readyCount = database.orders.filter(o => o.status === 'ready').length;

  // Данные для графиков в карточках статистики — 7 дней, тот же язык, что
  // уже был у "Заходы на сайт".
  const revenueHistory = useMemo(() => buildLast7Days(
    database.orders.filter(o => o.paymentStatus === 'paid'),
    o => o.orderDate,
    o => o.totalCost
  ), [database.orders]);

  const newClientsHistory = useMemo(() => buildLast7Days(
    clientsOnly,
    u => u.createdAt
  ), [clientsOnly]);

  const printedCount = database.orders.filter(o => o.status === 'printed').length;
  const completedPercent = database.orders.length > 0 ? Math.round((printedCount / database.orders.length) * 100) : 0;
  const activeOrdersCount = pendingCount + inPrintCount + readyCount;
  const printingPercent = activeOrdersCount > 0 ? Math.round((inPrintCount / activeOrdersCount) * 100) : 0;

  // File Format Analytics Count
  let fileFormatGroupsStats = {
    document: 0,
    archive: 0,
    image: 0,
    other: 0
  };
  database.orders.forEach(o => {
    o.files.forEach(f => {
      const g = f.formatGroup;
      if (fileFormatGroupsStats[g] !== undefined) {
        fileFormatGroupsStats[g]++;
      } else {
        fileFormatGroupsStats.other++;
      }
    });
  });

  const totalFormatCounts = Object.values(fileFormatGroupsStats).reduce((a, b) => a + b, 0);

  // Active Chats listing
  const chatSessions = clientsOnly.map(c => {
    const userMsgs = database.chatMessages.filter(m => m.userId === c.id);
    const lastMsg = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1] : null;
    const unreadCount = userMsgs.filter(m => m.senderRole === 'client' && !m.readByAdmin).length;

    return {
      client: c,
      lastMsg,
      unreadCount
    };
  }).sort((a, b) => {
    const tA = a.lastMsg ? new Date(a.lastMsg.timestamp).getTime() : 0;
    const tB = b.lastMsg ? new Date(b.lastMsg.timestamp).getTime() : 0;
    return tB - tA;
  });

  const activeTalkingChat = database.chatMessages.filter(c => c.userId === activeChatUserId);
  const activeChatClient = clientsOnly.find(u => u.id === activeChatUserId);

  return (
    <div id="admin-dashboard-root" className="liquid-glass-bg h-dvh overflow-hidden text-slate-800 dark:text-slate-100 flex flex-col md:flex-row transition-colors duration-300 relative">
      
      {/* Admin notification toast */}
      {adminToast && (
        <div
          onClick={() => setAdminToast(null)}
          className="fixed top-5 right-5 z-[9999] flex items-center gap-3 px-5 py-4 rounded-2xl cursor-pointer select-none"
          style={{
            background: 'rgba(30,25,20,0.92)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            animation: 'slideInRight 0.3s ease-out',
          }}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
            adminToast.type === 'order' ? 'bg-orange-500/20' : 'bg-blue-500/20'
          }`}>
            {adminToast.type === 'order' ? '📦' : '💬'}
          </div>
          <div>
            <p className="text-[11px] font-black text-white/50 uppercase tracking-wider mb-0.5">Фото-Север</p>
            <p className="text-sm font-bold text-white">{adminToast.text}</p>
          </div>
          <div className="w-1 self-stretch rounded-full ml-1" style={{
            background: adminToast.type === 'order' ? '#f97316' : '#3b82f6'
          }}/>
        </div>
      )}
      <style>{`@keyframes slideInRight{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      
      {/* Neutral frosted glow accents (no color tint) */}
      <div className="absolute top-[15%] left-[25%] w-[500px] h-[500px] rounded-full bg-white/5 blur-[130px] animate-glow-slow-1 pointer-events-none" />
      <div className="absolute bottom-[25%] right-[5%] w-[550px] h-[550px] rounded-full bg-white/5 blur-[140px] animate-glow-slow-2 pointer-events-none" />
      <div className="absolute top-[65%] left-[-12%] w-[400px] h-[400px] rounded-full bg-white/5 blur-[120px] animate-glow-slow-1 pointer-events-none" />

      {/* Floating 3D Frosted Glass Orbs mirroring the uploaded design */}
      <div className="glass-bg-orb w-[200px] h-[200px] top-[18%] left-[8%] opacity-65 animate-[float-slow_22s_infinite_ease-in-out]" style={{ backdropFilter: 'blur(15px) saturate(120%)' }} />
      <div className="glass-bg-orb w-[240px] h-[240px] bottom-[22%] right-[10%] opacity-80 animate-[float-reverse_26s_infinite_ease-in-out]" style={{ backdropFilter: 'blur(20px) saturate(130%)' }} />
      <div className="glass-bg-orb w-[130px] h-[130px] top-[60%] left-[-3%] opacity-60 animate-[float-slow_28s_infinite_ease-in-out]" style={{ backdropFilter: 'blur(12px) saturate(110%)' }} />
      <div className="glass-bg-orb w-[100px] h-[100px] top-[30%] right-[20%] opacity-50 animate-[float-reverse_24s_infinite_ease-in-out]" style={{ backdropFilter: 'blur(10px) saturate(100%)' }} />

      {/* LEFT NAVIGATION COLUMN - Admin Side */}
      <aside className="w-full md:w-64 border-b md:border-r md:border-b-0 border-white/10 glass-panel text-white shrink-0 flex flex-row md:flex-col justify-between p-4 md:py-6 md:px-5 transition-colors relative z-10">
        
        <div className="hidden md:block">
          {/* Admin title card */}
          <div className="flex items-center gap-3 mb-6">
            <img src={logoImg} alt="Фото-Север" className="w-11 h-11 shrink-0 object-contain drop-shadow-lg" />
            <div>
              <h2 className="text-sm font-black text-white leading-none">ПАНЕЛЬ ПК</h2>
              <span className="text-[10px] uppercase font-bold tracking-widest text-white/55 mt-0.5 block">Сервер Печати</span>
            </div>
          </div>

          <div className="px-1 mb-6 text-[11px] text-white/50 font-bold uppercase tracking-wider">
            Режим Администратора
          </div>
        </div>

        {/* Links Navigation */}
        <nav className="sidebar-nav flex md:flex-col flex-1 min-h-0 gap-2 md:gap-2 justify-start md:justify-start w-full overflow-x-auto overflow-y-hidden md:overflow-x-hidden md:overflow-y-auto overscroll-contain">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start shrink-0 md:flex-initial relative ${
              activeTab === 'orders' 
                ? 'nav-holo-active bg-white/10 text-white font-black' 
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="relative shrink-0">
              <div className={`glass-icon-capsule glass-icon-violet w-9 h-9 ${activeTab === 'orders' ? 'glass-icon-active' : ''}`}>
                <Clock className="w-4.5 h-4.5 text-white" />
              </div>
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center z-10 border border-white shadow-md animate-pulse">
                  {pendingCount}
                </span>
              )}
            </div>
            <span className="hidden sm:inline">Очередь Заказов</span>
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start shrink-0 md:flex-initial relative ${
              activeTab === 'chat' 
                ? 'nav-holo-active bg-white/10 text-white font-black' 
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="relative shrink-0">
              <div className={`glass-icon-capsule glass-icon-green w-9 h-9 ${activeTab === 'chat' ? 'glass-icon-active' : ''}`}>
                <MessageSquare className="w-4.5 h-4.5 text-white" />
              </div>
              {database.chatMessages.filter(m => m.senderRole === 'client' && !m.readByAdmin).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center z-10 animate-bounce border border-white shadow-md">
                  {database.chatMessages.filter(m => m.senderRole === 'client' && !m.readByAdmin).length}
                </span>
              )}
            </div>
            <span className="hidden sm:inline">Чат-Приемная</span>
          </button>

          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start shrink-0 md:flex-initial relative ${
              activeTab === 'feedback'
                ? 'nav-holo-active bg-white/10 text-white font-black'
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="relative shrink-0">
              <div className={`glass-icon-capsule glass-icon-orange w-9 h-9 ${activeTab === 'feedback' ? 'glass-icon-active' : ''}`}>
                <Lightbulb className="w-4.5 h-4.5 text-white" />
              </div>
              {(database.feedback || []).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center z-10 border border-white shadow-md">
                  {(database.feedback || []).length}
                </span>
              )}
            </div>
            <span className="hidden sm:inline">Отзывы</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start shrink-0 md:flex-initial ${
              activeTab === 'users' 
                ? 'nav-holo-active bg-white/10 text-white font-black' 
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className={`glass-icon-capsule glass-icon-blue w-9 h-9 shrink-0 ${activeTab === 'users' ? 'glass-icon-active' : ''}`}>
              <Users className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="hidden sm:inline">Клиентская База</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start shrink-0 md:flex-initial ${
              activeTab === 'analytics' 
                ? 'nav-holo-active bg-white/10 text-white font-black' 
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className={`glass-icon-capsule glass-icon-orange w-9 h-9 shrink-0 ${activeTab === 'analytics' ? 'glass-icon-active' : ''}`}>
              <BarChart3 className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="hidden sm:inline">Финансы & Аналитика</span>
          </button>

          <button
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start shrink-0 md:flex-initial ${
              activeTab === 'services'
                ? 'nav-holo-active bg-white/10 text-white font-black'
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className={`glass-icon-capsule glass-icon-violet w-9 h-9 shrink-0 ${activeTab === 'services' ? 'glass-icon-active' : ''}`}>
              <Printer className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="hidden sm:inline">Услуги</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start shrink-0 md:flex-initial ${
              activeTab === 'settings' 
                ? 'nav-holo-active bg-white/10 text-white font-black' 
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className={`glass-icon-capsule glass-icon-gray w-9 h-9 shrink-0 ${activeTab === 'settings' ? 'glass-icon-active' : ''}`}>
              <Settings className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="hidden sm:inline">Настройки</span>
          </button>

          <button
            onClick={() => setActiveTab('archive')}
            className={`flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start shrink-0 md:flex-initial ${
              activeTab === 'archive'
                ? 'nav-holo-active bg-white/10 text-white font-black'
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className={`glass-icon-capsule w-9 h-9 shrink-0 ${activeTab === 'archive' ? 'glass-icon-active' : ''}`} style={{background: activeTab === 'archive' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.1)'}}>
              <Archive className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="hidden sm:inline">Архив</span>
          </button>
        </nav>

        {/* Short info bottom */}
        <div className="hidden md:block border-t border-white/10 pt-5 mt-auto w-full">
          <div className="flex items-center gap-3">
            <UserAvatar
              user={adminUser}
              className="w-10 h-10 rounded-xl ring-2 ring-pink-400/30"
            />
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{adminUser.fullName}</p>
              <p className="text-[10px] text-white/55 font-extrabold truncate uppercase tracking-widest">Администратор</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-white/65 hover:text-white glass-card rounded-xl transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Выйти на главную
          </button>
        </div>
      </aside>

      {/* ADMIN WORKSPACE CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-50/40 dark:bg-slate-950/50 backdrop-blur-md relative z-10">
        
        {/* Responsive Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 glass-panel border-b-0">
          <div className="flex items-center gap-2">
            <div className="glass-icon-capsule glass-icon-orange w-8 h-8 shrink-0">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-sm font-black text-white leading-none">АДМИН-ПК</h1>
          </div>
          <div className="flex items-center gap-2">
            <LiveClock showSeconds={false} />
            <ThemeToggle />
            <button
              onClick={onLogout}
              className="p-1 px-2.5 glass-card text-white text-xs rounded-xl font-bold"
            >
              Выход
            </button>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between px-8 py-5 glass-panel rounded-2xl border-b-0">
          <div>
            <h1 className="text-xl font-black text-white">
              {activeTab === 'orders' && 'Очередь печати документов'}
              {activeTab === 'chat' && 'Оперативная чат-линия клиентов'}
              {activeTab === 'feedback' && 'Пожелания и замечания клиентов'}
              {activeTab === 'users' && 'Управление пользователями & Конфиденциальность'}
              {activeTab === 'analytics' && 'Статистика копи-центра в реальном времени'}
              {activeTab === 'settings' && 'Редактирование профиля & Интеграция банка'}
            </h1>
            <p className="text-xs text-white/60 mt-1">
              {activeTab === 'orders' && 'Управляйте приоритетами очередей принтера Epson, изменяйте статусы готовности, выгружайте CSV накладные.'}
              {activeTab === 'chat' && 'Контролируйте ветки диалогов всех активных клиентов вашего копи-точки.'}
              {activeTab === 'feedback' && 'Сообщения из формы "Есть пожелание или замечание?" в кабинете клиента.'}
              {activeTab === 'users' && 'Просмотр контактов, редактирование профилей и полное удаление согласно регламенту.'}
              {activeTab === 'analytics' && 'Сводная аналитика выручки, распределение графиков популярности расширений.'}
              {activeTab === 'settings' && 'Настройка вашего профиля администратора, выбор аватаров и банковский СБП терминал.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <LiveClock />
            <ThemeToggle />
            <div className="text-xs glass-card px-3.5 py-2 rounded-xl text-white font-bold">
              Очередь принтера: <strong className="text-emerald-300">{database.orders.filter(o => o.status !== 'printed').length} активных</strong>
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT AREA */}
        <div className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto overscroll-contain max-w-6xl w-full mx-auto">
          
          {/* TAB 1: ALL ORDERS AND FILES DOWNLOADS */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              
              {/* Order Lists Filter and bulk actions bar */}
              <div className="glass-panel p-4 rounded-2xl space-y-3">
                <div className="search-glow-wrap">
                  <div className="search-glow-halo"><div className="search-glow-halo-ring"></div></div>
                  <div className="search-glow-frame">
                    <div className="search-glow-bar relative">
                      <Search className="w-4 h-4 text-white/65 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={orderSearchQuery}
                        onChange={(e) => setOrderSearchQuery(e.target.value)}
                        placeholder="Поиск по номеру заказа, имени клиента или email..."
                        aria-label="Поиск по заказам"
                        className="w-full bg-transparent pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-white/40 rounded-full focus:outline-none focus:ring-2 focus:ring-white/40 transition-all"
                      />
                      {orderSearchQuery && (
                        <button
                          onClick={() => setOrderSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/65 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded-full"
                          aria-label="Очистить поиск"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="filter-pill-wrap max-w-full overflow-x-auto overscroll-contain">
                  <span className="text-xs font-bold text-slate-500 self-center mr-2 hidden lg:inline px-2 shrink-0">Фильтр:</span>
                  {[
                    { id: 'all', label: 'Все заказы' },
                    { id: 'pending', label: 'Ожидают' },
                    { id: 'approved', label: 'Одобрено' },
                    { id: 'printing', label: 'Печатается' },
                    { id: 'ready', label: 'К выдаче' }
                  ].map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => setStatusFilter(btn.id as any)}
                      className={`filter-pill-btn transition-all shrink-0 ${
                        statusFilter === btn.id
                          ? 'glass-pill-active'
                          : ''
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                </div>
              </div>

              {/* Grid listings */}
              {sortedOrders.length === 0 ? (
                <p className="text-xs text-white/50 text-center py-10 glass-panel rounded-3xl">Нет заказов в реестре.</p>
              ) : (
                <div className="grid grid-cols-1 gap-5">
                  {sortedOrders
                    .filter(o => {
                      // Выданные заказы живут только в Архиве — как только заказ
                      // выдан, он сразу пропадает из основной очереди.
                      if (o.status === 'printed') return false;
                      // Заказ пишется в базу ДО перехода на оплату ЮKassa (нужно
                      // вебхуку куда писать статус) — если клиент передумал и не
                      // заплатил, запись остаётся неоплаченной навсегда. Прячем
                      // такие брошенные заказы из очереди, но не трогаем явную
                      // "оплату при получении" — она специально начинает жизнь
                      // неоплаченной и должна быть видна админу.
                      if (o.paymentStatus === 'unpaid' && o.paymentMethod !== 'При получении (Наличные/Карта)') return false;
                      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
                      if (orderSearchQuery.trim() !== '') {
                        const q = orderSearchQuery.trim().toLowerCase();
                        const matchesId = o.id.toLowerCase().includes(q);
                        const matchesName = (o.userName || '').toLowerCase().includes(q);
                        const matchesEmail = (o.userEmail || '').toLowerCase().includes(q);
                        if (!matchesId && !matchesName && !matchesEmail) return false;
                      }
                      return true;
                    })
                    .map(order => (
                      <div
                        key={order.id}
                        className="glass-card rounded-2xl overflow-hidden"
                      >
                        {/* Upper Section client credentials */}
                        <div className="p-4 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-150/60 dark:border-slate-850 flex flex-col gap-3">
                          {/* Row 1: Order info + status badges + delete */}
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900 dark:text-white text-xs">{order.id}</span>
                                <span className="text-[10px] text-slate-400">{formatDateTime(order.orderDate)}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                Клиент: <strong>{order.userName}</strong> &bull; {order.userEmail}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                              {order.rejected && (
                                <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                                  ⚠ Брак
                                </span>
                              )}
                              <span className={`text-[10px] uppercase font-bold px-2 px-2.5 py-0.5 rounded-md ${getStatusColor(order.status)}`}>
                                {getStatusLabel(order.status)}
                              </span>
                              {order.paymentStatus === 'unpaid' && order.paymentMethod === 'При получении (Наличные/Карта)' ? (
                                <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                                  💵 Оплата при получении
                                </span>
                              ) : (
                                <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-md ${getPaymentStatusColor(order.paymentStatus)}`}>
                                  {getPaymentStatusLabel(order.paymentStatus)}
                                </span>
                              )}
                              {orderToConfirmDelete === order.id ? (
                                <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/20 p-1 rounded-lg border border-rose-100 dark:border-rose-900/40">
                                  <span className="text-[9px] font-black text-rose-500 uppercase px-1 animate-pulse">Удалить заказ?</span>
                                  <button onClick={() => handleDeleteEntireOrder(order.id)} disabled={deletingOrderId === order.id} className="bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition disabled:opacity-50">
                                    {deletingOrderId === order.id ? '...' : 'Да'}
                                  </button>
                                  <button onClick={() => setOrderToConfirmDelete(null)} disabled={deletingOrderId === order.id} className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition disabled:opacity-50">
                                    Нет
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setOrderToConfirmDelete(order.id)} className="p-1 px-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition cursor-pointer" title="Удалить весь заказ">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Stage buttons — always visible at top */}
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest self-center mr-1">Стадия:</span>
                            {[
                              { id: 'pending',  label: 'Проверка' },
                              { id: 'approved', label: 'Одобрен' },
                              { id: 'printing', label: 'Печать' },
                              { id: 'ready',    label: 'В Готовность' },
                              { id: 'printed',  label: 'Выдать' }
                            ].map((state) => {
                              const stages = ['pending','approved','printing','ready','printed'];
                              const currentIdx = stages.indexOf(order.status);
                              const thisIdx = stages.indexOf(state.id);
                              const isCurrent = order.status === state.id;
                              const isPast = thisIdx < currentIdx;
                              const isNext = thisIdx === currentIdx + 1;
                              const isFuture = thisIdx > currentIdx + 1;
                              return (
                                <button
                                  key={state.id}
                                  onClick={() => !isPast && !isFuture && handleUpdateOrderStatus(order.id, state.id as any)}
                                  disabled={isPast || isFuture}
                                  title={isPast ? 'Уже пройдено' : isFuture ? 'Сначала завершите предыдущий шаг' : ''}
                                  className={`stage-pill-btn transition-all ${
                                    isCurrent   ? 'stage-pill-current'
                                    : isPast    ? 'stage-pill-past'
                                    : isNext    ? 'stage-pill-next'
                                                : 'stage-pill-future'
                                  }`}
                                >
                                  {isPast ? '✓ ' : ''}{state.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Row 3: Брак (reject) — независимо от стадии, т.к. брак может случиться на любом шаге */}
                          {order.rejected ? (
                            <div className="flex items-start gap-2 p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-xl">
                              <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase shrink-0 mt-0.5">Причина брака:</span>
                              <p className="text-[11px] text-rose-700 dark:text-rose-300 flex-1">{order.rejectionReason}</p>
                              <button
                                onClick={() => handleUnrejectOrder(order.id)}
                                className="text-[9px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline shrink-0 cursor-pointer"
                              >
                                Отменить
                              </button>
                            </div>
                          ) : rejectingOrderId === order.id ? (
                            <div className="flex flex-col gap-1.5 p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-xl">
                              <textarea
                                autoFocus
                                value={rejectionReasonDraft}
                                onChange={e => setRejectionReasonDraft(e.target.value)}
                                placeholder="Почему заказ не может быть выполнен? Клиент увидит этот текст."
                                className="w-full p-2 text-[11px] bg-white dark:bg-slate-950 border border-rose-200 dark:border-rose-900/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 resize-none"
                                rows={2}
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => { setRejectingOrderId(null); setRejectionReasonDraft(''); }}
                                  className="px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                                >
                                  Отмена
                                </button>
                                <button
                                  onClick={() => handleRejectOrder(order.id, rejectionReasonDraft)}
                                  disabled={!rejectionReasonDraft.trim()}
                                  className="px-3 py-1 text-[10px] font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg cursor-pointer transition"
                                >
                                  Отклонить заказ
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setRejectingOrderId(order.id); setRejectionReasonDraft(''); }}
                              className="self-start text-[10px] font-bold text-rose-500/70 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                            >
                              ⚠ Брак / отклонить заказ
                            </button>
                          )}
                        </div>

                        {/* Mid Section - Files queue list */}
                        <div className="p-4 md:p-5 space-y-4">
                          
                          <div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Файлы для выгрузки на ПК типографии:</span>
                              {(order.files && order.files.length > 2) && (
                                <button
                                  onClick={() => handleDownloadAllAsZip(order)}
                                  disabled={zippingOrderId === order.id}
                                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm border ${
                                    zippingOrderId === order.id
                                      ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-200'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-450 dark:hover:bg-emerald-900 border-transparent'
                                  }`}
                                >
                                  {zippingOrderId === order.id ? (
                                    <>
                                      <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                      Архивация ZIP {zipProgress}%
                                    </>
                                  ) : (
                                    <>
                                      <Files className="w-3.5 h-3.5 text-white/95 dark:text-emerald-450" />
                                      Скачать все файлы в ZIP ({order.files.length} шт.)
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            
                            <div className="space-y-2">
                              {order.files.map(file => (
                                <div
                                  key={file.id}
                                  className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-between gap-3 text-xs border border-slate-100 dark:border-slate-850"
                                >
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                    <div className="overflow-hidden">
                                      <span className="font-bold block truncate text-slate-700 dark:text-slate-300">{file.name}</span>
                                      <span className="text-[9px] text-slate-400 block mt-0.5">{formatFileSize(file.size)} &bull; ID: {file.id} {file.pageCount !== undefined ? `&bull; Папок/Стр: ${file.pageCount}–стр` : ''} {file.paperType === 'photo' ? `&bull; ${(file.photoBorder || 'borderless') === 'bordered' ? 'С рамкой (белые поля)' : 'Без рамки (край-в-край)'}` : ''}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {/* Download actions simulator */}
                                    <button
                                      onClick={() => triggerSimulatedDownload(file)}
                                      disabled={downloadingFileId === file.id}
                                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 shrink-0 ${
                                        downloadingFileId === file.id
                                          ? 'bg-slate-205 dark:bg-slate-800 text-slate-500'
                                          : 'bg-indigo-600 hover:bg-slate-900 hover:text-white dark:bg-slate-900 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-600/30'
                                      }`}
                                    >
                                      {downloadingFileId === file.id ? (
                                        <>
                                          <span className="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                                          Скачивание {downloadProgress}%
                                        </>
                                      ) : (
                                        <>
                                          <Download className="w-3.5 h-3.5" />
                                          Скачать на ПК
                                        </>
                                      )}
                                    </button>

                                    {/* Admin Delete file from order button */}
                                    {adminFileToConfirmDelete?.orderId === order.id && adminFileToConfirmDelete?.fileId === file.id ? (
                                      <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/20 p-1 rounded-lg border border-rose-100 dark:border-rose-900/40">
                                        <span className="text-[9px] font-black text-rose-500 uppercase px-1 animate-pulse">Удалить?</span>
                                        <button
                                          onClick={() => handleAdminDeleteFileFromOrder(order.id, file.id)}
                                          className="bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition"
                                        >
                                          Да
                                        </button>
                                        <button
                                          onClick={() => setAdminFileToConfirmDelete(null)}
                                          className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition"
                                        >
                                          Нет
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setAdminFileToConfirmDelete({ orderId: order.id, fileId: file.id })}
                                        className="p-1 px-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition cursor-pointer"
                                        title="Удалить файл из заказа"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Order specifications — выделено рамкой слева, чтобы не потерялось
                              среди списка заказов; показываются только реально выбранные
                              клиентом параметры (скрепление/промокод скрыты, если не заданы). */}
                          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 p-3 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border-l-4 border-l-indigo-500 border-y border-r border-slate-100 dark:border-slate-850/80 text-xs text-slate-500 dark:text-slate-400 font-medium">
                            <div>Бумага: <strong className="text-slate-800 dark:text-white">
                              {order.paperType === 'standard' ? 'А4 Обычная' :
                               order.paperType === 'glossy' ? 'А4 Глянцевая' :
                               order.paperType === 'matte' ? 'А4 Матовая' :
                               order.paperType === 'standard_a3' ? 'А3 Обычная' :
                               order.paperType === 'bw_a3' ? 'А3 Фотобумага' : order.paperType}
                            </strong></div>
                            <div>Цветность: <strong className="text-slate-800 dark:text-white">
                              {order.printColor === 'bw' ? 'Черно-белая (Ч/Б)' :
                               order.printColor === 'color_full' ? 'Цветная 100% заливочная' : 'Цветная (RGB)'}
                            </strong></div>
                            <div>Количество тиража: <strong className="text-slate-800 dark:text-white">{order.copies} шт.</strong></div>
                            {order.binding && order.binding !== 'none' && (
                              <div>Скрепление: <strong className="text-indigo-650 dark:text-indigo-400">
                                {order.binding === 'staple' ? 'Скрепка в углу' :
                                 order.binding === 'spring_plastic' ? 'Пружина пластик' :
                                 order.binding === 'spring_metal' ? 'Пружина металл' : 'Тв. переплет'}
                              </strong></div>
                            )}
                            {order.promoCode && (
                              <div>Промокод: <strong className="text-emerald-600 dark:text-emerald-400 uppercase">
                                {order.promoCode}
                              </strong></div>
                            )}
                            <div>Итоговая стоимость: <strong className="text-amber-600 dark:text-amber-400">₽{order.totalCost}</strong></div>
                          </div>

                          {order.notes && (
                            <div className="p-3 bg-amber-500/10 dark:bg-amber-950/20 border-2 border-amber-400/50 dark:border-amber-500/40 rounded-xl text-[11px] leading-relaxed animate-pulse-slow">
                              <span className="font-black text-amber-700 dark:text-amber-400">⚠ Спец-требования клиента:</span> {order.notes}
                            </div>
                          )}
                        </div>

                        {/* Interactive operator state switches layout */}
                        <div className="p-4 bg-slate-50/50 dark:bg-slate-950/10 border-t border-slate-150/80 dark:border-slate-850 flex flex-col md:flex-row justify-between items-center gap-4">
                          
                          {/* Manual cash receipt switch */}
                          <div className="flex items-center gap-2.5">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Оплата наличными:</span>
                            <button
                              onClick={() => handleTogglePaymentStatus(order.id)}
                              className={`py-1.2 px-2.5 rounded-lg text-[10px] font-extrabold border transition ${
                                order.paymentStatus === 'paid'
                                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20'
                                  : 'bg-rose-50 border-rose-250 dark:bg-rose-955/20'
                              }`}
                              style={{ color: order.paymentStatus === 'paid' ? '#065f46' : '#9f1239' }}
                            >
                              {order.paymentStatus === 'paid' ? 'Отметить не Оплаченным' : 'Отметить Оплаченным'}
                            </button>
                          </div>

                        </div>

                      </div>
                    ))}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: OPERATOR CHAT CHANNELS PANEL — 1:1 по коду Grok */}
          {activeTab === 'chat' && (
            <div className={`grok-chat-app ${activeChatUserId ? 'chat-open' : ''} ${showClientInfoPanel && activeChatClient ? 'profile-open' : ''}`}>
              <aside className="grok-sidebar grok-glass">
                <div className="grok-sidebar-header">Чаты ({clientsOnly.length})</div>
                <div className="grok-chat-list">
                  {chatSessions.map(session => {
                    const isSelected = session.client.id === activeChatUserId;
                    const preview = session.lastMsg
                      ? (session.lastMsg.message.startsWith('[IMAGE]:') ? '📷 Фото' : session.lastMsg.message.startsWith('[STICKER]:') ? '✨ Стикер' : session.lastMsg.message)
                      : 'Нет сообщений';
                    return (
                      <div
                        key={session.client.id}
                        className={`grok-chat-item ${isSelected ? 'active' : ''} ${session.unreadCount > 0 ? 'chat-card-blink' : ''}`}
                        onClick={() => { setActiveChatUserId(session.client.id); setShowClientInfoPanel(false); }}
                      >
                        <button
                          type="button"
                          className="grok-avatar-btn grok-avatar-sm"
                          onClick={(e) => { e.stopPropagation(); setActiveChatUserId(session.client.id); setShowClientInfoPanel(false); }}
                          title="Открыть диалог"
                        >
                          <UserAvatar user={session.client} className="w-full h-full rounded-full" />
                        </button>
                        <div className="grok-chat-item-text">
                          <div className="grok-chat-item-name">{session.client.fullName}</div>
                          <div className="grok-chat-item-preview">{preview}</div>
                        </div>
                        {session.unreadCount > 0 && (
                          <span className="grok-unread-badge">{session.unreadCount}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </aside>

              <main className="grok-main">
                {activeChatUserId && activeChatClient ? (
                  <>
                    <header className="grok-thread-header grok-glass">
                      <button type="button" className="grok-back-btn" onClick={() => { setActiveChatUserId(null); setShowClientInfoPanel(false); }} title="Назад">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button type="button" className="grok-avatar-btn" onClick={() => setShowClientInfoPanel(true)} title="Открыть профиль">
                        <UserAvatar user={activeChatClient} className="w-full h-full rounded-full" />
                      </button>
                      <div className="grok-thread-title">
                        <h1>{activeChatClient.fullName}</h1>
                        <p style={{ color: activeChatClient.isOnline ? '#34d399' : undefined }}>{activeChatClient.isOnline ? 'в сети' : 'не в сети'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClearChatHistory(activeChatUserId)}
                        className="grok-header-icon-btn"
                        title="Очистить историю переписки"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </header>

                    <div className="grok-messages">
                      {activeTalkingChat.length === 0 ? (
                        <p className="grok-empty-hint">Нет сообщений в этой ветке.</p>
                      ) : (
                        activeTalkingChat.map(msg => {
                          const isAdmin = msg.senderRole === 'admin';
                          return (
                            <div key={msg.id} className={`grok-msg-row ${isAdmin ? 'out' : ''}`}>
                              {!isAdmin && (
                                <UserAvatar user={activeChatClient} className="grok-avatar-btn grok-avatar-msg" />
                              )}
                              <div>
                                {msg.message.startsWith('[STICKER]:') ? (
                                  <div className="msg-sticker">
                                    {msg.message.substring(10).endsWith('.webm') ? (
                                      <video src={msg.message.substring(10)} className="msg-sticker__img" autoPlay loop muted playsInline />
                                    ) : (
                                      <img src={msg.message.substring(10)} loading="lazy" className="msg-sticker__img" alt="Стикер" />
                                    )}
                                  </div>
                                ) : (
                                <div className="grok-msg-bubble">
                                  {msg.message.startsWith('[IMAGE]:') ? (
                                    <div className="space-y-1 text-left">
                                      <img
                                        src={msg.message.substring(8)}
                                        loading="lazy"
                                        className="rounded-xl max-w-[200px] sm:max-w-xs cursor-pointer hover:opacity-90"
                                        alt="Пример готового продукта"
                                        onClick={() => {
                                          const imgWin = window.open('', '_blank');
                                          if (imgWin) {
                                            const fullImg = imgWin.document.createElement('img');
                                            fullImg.src = msg.message.substring(8);
                                            fullImg.style.maxWidth = '100%';
                                            fullImg.style.maxHeight = '100vh';
                                            fullImg.style.display = 'block';
                                            fullImg.style.margin = 'auto';
                                            imgWin.document.body.appendChild(fullImg);
                                          }
                                        }}
                                      />
                                      <span className="text-[10px] opacity-70 block italic">Защищено водяным знаком &bull; ПРИМЕР</span>
                                    </div>
                                  ) : msg.message}
                                </div>
                                )}
                                <div className="grok-msg-time">
                                  {msg.senderName} &bull; {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                  {isAdmin && (msg.readByClient ? ' ✓✓' : ' ✓')}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    title="Удалить сообщение"
                                    className="grok-msg-delete"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    <form onSubmit={handleAdminSendMessage} className="grok-composer grok-glass">
                      <input
                        type="file"
                        id="admin-chat-attachment"
                        aria-label="Отправить пример товара с водяным знаком"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) watermarkAndSendImage(f);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('admin-chat-attachment')?.click()}
                        className="grok-composer-icon-btn"
                        title="Отправить готовый пример товара с водяным знаком 'ПРИМЕР'"
                      >
                        📎
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(v => !v)}
                          className="grok-composer-icon-btn"
                          title="Эмодзи"
                        >
                          😊
                        </button>
                        {showEmojiPicker && (
                          <EmojiPicker
                            onSelect={(sticker) => handleSendSticker(sticker)}
                            onClose={() => setShowEmojiPicker(false)}
                          />
                        )}
                      </div>
                      <input
                        type="text"
                        value={adminChatInput}
                        onChange={e => setAdminChatInput(e.target.value)}
                        placeholder="Напишите ответ клиенту (файлы приняты, печатаю...)"
                        aria-label="Ответ клиенту"
                        className="grok-composer-input"
                      />
                      <button type="submit" disabled={!adminChatInput.trim()} aria-label="Отправить">
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="grok-empty-state">Выберите диалог клиента слева для переписки.</div>
                )}
              </main>

              {/* Профиль клиента — третья колонка грида рядом с чатом (как в Telegram),
                  а не оверлей поверх сообщений */}
              {showClientInfoPanel && activeChatClient && (
                <aside className="grok-profile-panel grok-glass-panel open" style={{ background: '#16171c' }}>
                    <button type="button" className="grok-panel-close" onClick={() => setShowClientInfoPanel(false)} aria-label="Закрыть">×</button>
                    <div className="grok-panel-hero">
                      <div className="grok-avatar-btn grok-avatar-md" style={{ margin: '0 auto 14px' }}>
                        <UserAvatar user={activeChatClient} className="w-full h-full rounded-full" />
                      </div>
                      <div className="grok-panel-name">{activeChatClient.fullName}</div>
                      <div className="grok-panel-status" style={{ color: activeChatClient.isOnline ? '#34d399' : undefined }}>{activeChatClient.isOnline ? 'в сети' : 'не в сети'}</div>
                    </div>
                    <div className="grok-panel-section grok-glass">
                      <div className="grok-panel-action"><span className="grok-icon">✉️</span> {activeChatClient.email}</div>
                      <div className="grok-panel-action"><span className="grok-icon">📞</span> {activeChatClient.phone || 'Не указан'}</div>
                      <div className="grok-panel-action"><span className="grok-icon">📦</span> Заказов: {database.orders.filter(o => o.userId === activeChatClient.id).length} шт.</div>
                      <div className="grok-panel-action"><span className="grok-icon">📅</span> С нами с {new Date(activeChatClient.createdAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</div>
                    </div>
                    <div className="grok-panel-section grok-glass">
                      <button type="button" className="grok-panel-action" onClick={() => { handleClearChatHistory(activeChatUserId); setShowClientInfoPanel(false); }}>
                        <span className="grok-icon">🗑</span> Очистить историю
                      </button>
                    </div>
                </aside>
              )}
            </div>
          )}

          {/* TAB: CLIENT FEEDBACK — форма "Есть пожелание или замечание?" из кабинета клиента */}
          {activeTab === 'feedback' && (
            <div className="space-y-6">
              <div className="glass-panel rounded-3xl p-6">
                <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1">Пожелания и замечания</h3>
                <p className="text-[10px] text-white/50 mb-6">Ответ уходит клиенту обычным сообщением в чате.</p>

                {(database.feedback || []).length === 0 ? (
                  <p className="text-xs text-white/50 text-center py-10">Пока ничего не прислали.</p>
                ) : (
                  <div className="space-y-4">
                    {(database.feedback || []).map(fb => (
                      <div key={fb.id} className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-white text-xs">{fb.userName}</span>
                            <span className="text-[10px] text-white/40">{fb.userEmail}</span>
                            <span className="text-[10px] text-white/40">&bull; {formatDateTime(fb.timestamp)}</span>
                          </div>
                          <p className="text-sm text-white/85 mt-2 whitespace-pre-wrap break-words">{fb.message}</p>
                        </div>
                        <div className="flex sm:flex-col gap-2 shrink-0">
                          <button
                            onClick={() => { setActiveTab('chat'); setActiveChatUserId(fb.userId); }}
                            className="flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-3.5 rounded-xl transition"
                          >
                            <MessageSquare className="w-3.5 h-3.5" /> Ответить
                          </button>
                          <button
                            onClick={() => {
                              const client = database.users.find(u => u.id === fb.userId);
                              if (!client) return;
                              // Модалка подарка промокода отрисовывается только внутри
                              // вкладки "Клиентская База" (activeTab === 'users') — без
                              // переключения вкладки promoGiftUser выставится, но окно
                              // физически не смонтируется и не появится на экране.
                              setActiveTab('users');
                              setPromoGiftUser(client);
                              setGivingPromoCode('');
                              setGivingPromoDiscount(client.promoDiscount || 5);
                            }}
                            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-3.5 rounded-xl transition"
                          >
                            <Gift className="w-3.5 h-3.5" /> Подарить скидку
                          </button>
                          <button
                            onClick={() => deleteFeedbackFromFirebase(fb.id)}
                            className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-bold text-xs px-4 py-3.5 rounded-xl transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: USER RECORDS CONTROLS */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="glass-panel rounded-3xl p-6 overflow-x-auto">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">База зарегистрированных пользователей</h3>
                    <p className="text-[10px] text-white/50 mt-1">Нажмите на строку любого пользователя для просмотра реестра всех его загруженных файлов.</p>
                  </div>
                  <div className="search-glow-wrap w-full sm:w-72">
                    <div className="search-glow-halo"><div className="search-glow-halo-ring"></div></div>
                    <div className="search-glow-frame">
                      <div className="search-glow-bar relative">
                        <Search className="w-4 h-4 text-white/65 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={clientSearchQuery}
                          onChange={(e) => setClientSearchQuery(e.target.value)}
                          placeholder="Поиск по имени, email или телефону..."
                          aria-label="Поиск по клиентам"
                          className="w-full bg-transparent pl-10 pr-9 py-2 text-xs text-white placeholder:text-white/40 rounded-full focus:outline-none focus:ring-2 focus:ring-white/40 transition-all"
                        />
                        {clientSearchQuery && (
                          <button
                            onClick={() => setClientSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/65 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded-full"
                            aria-label="Очистить поиск"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50 uppercase text-[10px] tracking-widest">
                      <th className="py-3 px-4 font-bold">Фото</th>
                      <th className="py-3 px-4 font-bold">ФИО клиента</th>
                      <th className="py-3 px-4 font-bold">Электронная почта</th>
                      <th className="py-3 px-4 font-bold">Телефон</th>
                      <th className="py-3 px-4 font-bold">Дата регистрации</th>
                      <th className="py-3 px-4 font-bold text-center">Файлов</th>
                      <th className="py-3 px-4 font-bold text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850/60 font-medium font-medium">
                    {database.users.filter(cli => {
                      if (cli.role === 'admin' || cli.email === 'photo-sever@yandex.ru') return false;
                      if (clientSearchQuery.trim() !== '') {
                        const q = clientSearchQuery.trim().toLowerCase();
                        const matchesName = (cli.fullName || '').toLowerCase().includes(q);
                        const matchesEmail = (cli.email || '').toLowerCase().includes(q);
                        const matchesPhone = (cli.phone || '').toLowerCase().includes(q);
                        if (!matchesName && !matchesEmail && !matchesPhone) return false;
                      }
                      return true;
                    }).map(cli => {
                      const userOrders = database.orders.filter(o => o.userId === cli.id);
                      const filesCount = userOrders.reduce((sum, o) => sum + (o.files?.length || 0), 0);
                      const isAdmin = cli.role === 'admin';

                      return (
                        <tr 
                          key={cli.id} 
                          onClick={() => setSelectedUserForFiles(cli)}
                          className="hover:bg-white/8 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <UserAvatar
                              user={cli}
                              className="w-9 h-9 rounded-xl"
                            />
                          </td>

                          <td className="py-3 px-4">
                            {editingUserId === cli.id ? (
                              <input
                                type="text"
                                value={editFullName}
                                onChange={e => setEditFullName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Имя клиента"
                                className="bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded px-2 py-1 text-xs w-full font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            ) : (
                              <div className="flex flex-col">
                                <span className="font-extrabold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                  {cli.fullName}
                                  {isAdmin && (
                                    <span className="bg-red-50 dark:bg-red-950/40 text-red-650 dark:text-red-400 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-red-200/50 dark:border-red-900/30">
                                      Админ
                                    </span>
                                  )}
                                </span>
                                {cli.promoCode && (
                                  <span className="inline-flex self-start items-center gap-1 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600 dark:text-emerald-400 text-[9px] font-black px-1.5 py-0.5 rounded-lg border border-emerald-150 dark:border-emerald-900/35 mt-1 animate-pulse">
                                    🎁 Подарен: {cli.promoCode} (-{cli.promoDiscount}%)
                                  </span>
                                )}
                              </div>
                            )}
                            <span className="text-[9px] text-slate-400 block mt-0.5">UID: {cli.id} {cli.isSocial && '(OAuth Соцсеть)'}</span>
                          </td>

                          <td className="py-3 px-4 text-slate-505 dark:text-slate-400">{cli.email}</td>

                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            {editingUserId === cli.id ? (
                              <input
                                type="text"
                                value={editPhone}
                                onChange={e => setEditPhone(e.target.value)}
                                aria-label="Телефон клиента"
                                className="bg-slate-50 dark:bg-slate-950 border border-slate-205 dark:border-slate-800 rounded px-2 py-1 text-xs w-full font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            ) : (
                              cli.phone || '—'
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-400 text-[11px]">{new Date(cli.createdAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</td>

                          <td className="py-3 px-4 text-center font-bold">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] ${
                              filesCount > 0 
                                ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400' 
                                : 'bg-slate-55 dark:bg-slate-900 text-slate-400'
                            }`}>
                              {filesCount} шт.
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              {editingUserId === cli.id ? (
                                <button
                                  onClick={handleSaveUser}
                                  className="p-1 px-2.5 bg-indigo-650 hover:bg-indigo-700 text-white font-bold rounded-lg flex items-center gap-1 transition"
                                >
                                  <Save className="w-3.5 h-3.5" /> Сохранить
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartEditUser(cli)}
                                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                  title="Редактировать ФИО/Телефон"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              )}
                              {!isAdmin && (
                                <button
                                  onClick={() => {
                                    setPromoGiftUser(cli);
                                    setGivingPromoCode(cli.promoCode || '');
                                    setGivingPromoDiscount(cli.promoDiscount || 15);
                                  }}
                                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                  title="Подарить промокод"
                                >
                                  <Gift className="w-4 h-4" />
                                </button>
                              )}
                              {!isAdmin && (
                                <button
                                  onClick={() => {
                                    setEmailComposeUser(cli);
                                    setEmailSubject('');
                                    setEmailBody('');
                                    setEmailSendResult(null);
                                  }}
                                  className="p-2 text-slate-400 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                  title="Написать на почту"
                                >
                                  <Mail className="w-4 h-4" />
                                </button>
                              )}
                              {!isAdmin && (
                                <button
                                  onClick={() => setUserToDelete(cli)}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                  title="Удалить клиента и данные"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* USER FILES DIALOG MODAL */}
              {selectedUserForFiles && (
                <div id="user-files-popup-modal" className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="glass-window max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
                    {/* Modal Header */}
                    <div className="p-6 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/30">
                          <Files className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-sans">
                            Файлы пользователя: {selectedUserForFiles.fullName}
                          </h3>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Email: {selectedUserForFiles.email} &bull; Телефон: {selectedUserForFiles.phone || '—'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedUserForFiles(null)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        aria-label="Закрыть"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Modal Scrollable Content */}
                    <div className="p-6 overflow-y-auto overscroll-contain space-y-4 flex-1">
                      {(() => {
                        const userOrders = database.orders.filter(o => o.userId === selectedUserForFiles.id);
                        const filesList = userOrders.flatMap(order =>
                          (order.files || []).map(file => ({ ...file, orderId: order.id, orderStatus: order.status, orderDate: order.orderDate }))
                        );
                        const totalPaid = userOrders
                          .filter(o => o.paymentStatus === 'paid')
                          .reduce((sum, o) => sum + o.totalCost, 0);

                        const statsRow = (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-2xl">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Всего заказов</p>
                              <p className="text-xl font-black text-slate-800 dark:text-white">{userOrders.length}</p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-2xl">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Оплачено всего</p>
                              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{totalPaid} ₽</p>
                            </div>
                          </div>
                        );

                        return (
                          <div className="space-y-3">
                            {statsRow}
                            <div className="text-xs text-slate-400 font-bold text-center py-2">
                              {filesList.length} {filesList.length === 1 ? 'файл' : 'файлов'} в {userOrders.length} {userOrders.length === 1 ? 'заказе' : 'заказах'}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Modal Footer */}
                    <div className="p-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 text-right">
                      <button
                        onClick={() => setSelectedUserForFiles(null)}
                        className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
                      >
                        Закрыть окно
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* GIFT PROMO CUSTOM DIALOG MODAL */}
              {promoGiftUser && (
                <div id="user-promo-gift-modal" className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="glass-window max-w-md w-full flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
                      <div className="flex items-center gap-2">
                        <Gift className="w-5 h-5 text-emerald-500 animate-bounce" />
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                          Подарить промокод
                        </h3>
                      </div>
                      <button
                        onClick={() => setPromoGiftUser(null)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        aria-label="Закрыть"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                      <p className="text-xs text-slate-505 dark:text-slate-400 leading-relaxed">
                        Вы собираетесь подарить уникальный промокод для клиента <strong className="text-slate-700 dark:text-white">{promoGiftUser.fullName}</strong>. У него мгновенно загорится уведомление и откроется праздничная открытка с Вашим подарком!
                      </p>

                      <div className="space-y-3">
                        <div>
                          <label htmlFor="gift-promo-code" className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                            Текст промокода (прописными буквами)
                          </label>
                          <input
                            id="gift-promo-code"
                            type="text"
                            placeholder="Например: COFFEE15, COPYGIFT"
                            value={givingPromoCode}
                            onChange={e => setGivingPromoCode(e.target.value.toUpperCase())}
                            className="w-full p-3 border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-xs font-bold font-mono tracking-wider"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                            Процентная скидка (%)
                          </label>
                          <div className="grid grid-cols-5 gap-2">
                            {[5, 10, 15, 20, 50].map(pct => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => {
                                  setGivingPromoDiscount(pct);
                                  if (!givingPromoCode) {
                                    setGivingPromoCode(`GIFT${pct}`);
                                  }
                                }}
                                className={`py-2 text-xs font-black rounded-lg border transition ${
                                  givingPromoDiscount === pct
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/10'
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                                }`}
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                          <div className="mt-2.5 flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">Или своя скидка (%):</span>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={givingPromoDiscount}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 10;
                                setGivingPromoDiscount(Math.min(Math.max(val, 1), 100));
                              }}
                              aria-label="Своя скидка в процентах"
                              className="w-16 p-1 text-center border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                            />
                          </div>
                        </div>

                        {/* Beautiful live preview of client card coupon! */}
                        <div className="border border-emerald-500/15 bg-emerald-50/5 dark:bg-emerald-950/5 rounded-2xl p-4 space-y-2.5 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full -mr-6 -mt-6"></div>
                          <span className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-widest block">Предпросмотр открытки клиента:</span>
                          <div className="flex gap-3 items-center">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-205 dark:border-slate-700 flex items-center justify-center">
                              <img
                                src="https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=150&auto=format&fit=crop"
                                alt=""
                                className="w-full h-full object-cover animate-pulse"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div>
                              <p className="text-[11px] font-extrabold text-slate-900 dark:text-white">Подарочный купон от администратора!</p>
                              <p className="text-[10px] text-slate-400">Промокод: <span className="font-extrabold text-emerald-650 dark:text-emerald-450">{givingPromoCode || `GIFT${givingPromoDiscount}`}</span></p>
                              <p className="text-[10px] text-slate-400">Скидка: <span className="font-bold text-slate-700 dark:text-slate-350">{givingPromoDiscount}%</span> на все услуги</p>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Footer buttons */}
                    <div className="p-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 flex justify-end gap-2 text-right">
                      <button
                        onClick={() => setPromoGiftUser(null)}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={handleGiftPromoSubmit}
                        className="px-4 py-2 bg-emerald-650 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition shadow-lg shadow-emerald-600/10"
                      >
                        🎁 Отправить промокод
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* EMAIL TO CLIENT MODAL */}
              {emailComposeUser && (
                <div id="email-compose-modal" className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-fade-in">
                  <div className="glass-window max-w-md w-full flex flex-col overflow-hidden">

                    {isSendingEmail ? (
                      /* --- PHASE 2: SENDING ANIMATION --- */
                      <div className="p-10 flex flex-col items-center justify-center gap-5 min-h-[340px]">
                        <div className="relative w-full h-20 flex items-center justify-center overflow-hidden">
                          <div className="absolute left-1/2 top-1/2 w-24 h-[2px] bg-gradient-to-r from-transparent via-sky-400/70 to-transparent email-plane-trail" />
                          <span className="text-5xl email-plane-fly">📨</span>
                        </div>
                        <p className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                          Отправка письма...
                        </p>
                        <p className="text-xs text-slate-450 dark:text-slate-400 text-center">
                          Письмо для <strong className="text-slate-700 dark:text-white">{emailComposeUser.fullName}</strong> в пути
                        </p>
                      </div>
                    ) : emailSendResult === 'ok' ? (
                      /* --- PHASE 3: SUCCESS --- */
                      <div className="p-10 flex flex-col items-center justify-center gap-4 min-h-[340px] email-fade-up">
                        <div className="relative flex items-center justify-center w-20 h-20">
                          <span className="absolute inset-0 rounded-full border-2 border-emerald-400 email-check-ring" />
                          <div className="relative w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center email-check-pop shadow-lg shadow-emerald-500/30">
                            <Check className="w-10 h-10 text-white" strokeWidth={3} />
                          </div>
                        </div>
                        <p className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider text-center">
                          Ваше письмо отправлено!
                        </p>
                        <p className="text-xs text-slate-450 dark:text-slate-400 text-center">
                          Доставлено на {emailComposeUser.email}
                        </p>
                        <button
                          onClick={handleCloseEmailModal}
                          className="mt-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition shadow-lg shadow-emerald-600/10"
                        >
                          Готово
                        </button>
                      </div>
                    ) : (
                      /* --- PHASE 1: COMPOSE --- */
                      <>
                        <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
                          <div className="flex items-center gap-2">
                            <Mail className="w-5 h-5 text-sky-500" />
                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                              Написать клиенту
                            </h3>
                          </div>
                          <button
                            onClick={handleCloseEmailModal}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-650 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            aria-label="Закрыть"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="p-6 space-y-4">
                          <p className="text-xs text-slate-505 dark:text-slate-400">
                            Письмо уйдёт на <strong className="text-slate-700 dark:text-white">{emailComposeUser.email}</strong> ({emailComposeUser.fullName}) с адреса info@sever-18.ru.
                          </p>

                          <div>
                            <label htmlFor="email-subject" className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                              Тема письма
                            </label>
                            <input
                              id="email-subject"
                              type="text"
                              placeholder="Например: Ваш заказ готов"
                              value={emailSubject}
                              onChange={e => setEmailSubject(e.target.value)}
                              className="w-full p-3 border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none text-xs font-bold"
                            />
                          </div>

                          <div>
                            <label htmlFor="email-body" className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                              Текст письма
                            </label>
                            <textarea
                              id="email-body"
                              rows={6}
                              placeholder="Напишите сообщение клиенту..."
                              value={emailBody}
                              onChange={e => setEmailBody(e.target.value)}
                              className="w-full p-3 border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none text-xs resize-none"
                            />
                          </div>

                          {emailSendResult === 'error' && (
                            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">❌ Не удалось отправить письмо. Попробуйте ещё раз.</p>
                          )}
                        </div>

                        <div className="p-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 flex justify-end gap-2 text-right">
                          <button
                            onClick={handleCloseEmailModal}
                            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition"
                          >
                            Отмена
                          </button>
                          <button
                            onClick={handleSendEmailToClient}
                            disabled={!emailSubject.trim() || !emailBody.trim()}
                            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl transition shadow-lg shadow-sky-600/10"
                          >
                            📧 Отправить
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}



          {/* TAB 4: INTERACTIVE INTERACTIVE ANALYTICS SYSTEM */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              
              {/* Top stats grid widgets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                
                <div className="glass-panel p-5 rounded-3xl">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Общий оборот</span>
                      <p className="text-2xl font-black text-indigo-650 dark:text-white">₽{totalRevenue}</p>
                    </div>
                    <div className="p-2.5 bg-indigo-50 dark:bg-slate-850 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                  <MiniSparkline data={revenueHistory} colorClass="bg-indigo-500" />
                  <div className="text-[10px] text-emerald-600 font-bold mt-1.5">
                    &uarr; 100% зачисление на банковский ПК
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-3xl">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Всего Заказов</span>
                      <p className="text-2xl font-black text-slate-800 dark:text-white">{database.orders.length} шт.</p>
                    </div>
                    <div className="relative flex items-center justify-center">
                      <MiniRing percent={completedPercent} colorClass="stroke-emerald-500" />
                      <span className="absolute text-[9px] font-black text-emerald-600 dark:text-emerald-400">{completedPercent}%</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-2">
                    Из них: {printedCount} выполненных
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-3xl">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">База Клиентов</span>
                      <p className="text-2xl font-black text-slate-800 dark:text-white">{clientsOnly.length} чел.</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-850 text-slate-500 rounded-2xl">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <MiniSparkline data={newClientsHistory} colorClass="bg-slate-500" />
                  <div className="text-[10px] text-slate-400 mt-1.5">
                    Учетных записей защищено SSL
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-3xl">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">В Печатной Работе</span>
                      <p className="text-2xl font-black text-indigo-755 dark:text-indigo-400">{inPrintCount} задач</p>
                    </div>
                    <div className="relative flex items-center justify-center">
                      <MiniRing percent={printingPercent} colorClass="stroke-indigo-500" />
                      <Printer className="w-4 h-4 absolute text-indigo-600 dark:text-indigo-400 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2">
                    Заказов ожидает: {pendingCount} проверку
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-3xl">
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Заходы на Сайт</span>
                      <p className="text-2xl font-black text-slate-800 dark:text-white">
                        {(() => {
                          const today = getLocalDateKey();
                          const todayData = (database.siteVisitsHistory || []).find((h: any) => h.date === today);
                          return todayData?.count || 0;
                        })()}
                      </p>
                      <div className="text-[10px] text-slate-400">Сегодня • Всего: {database.siteVisits || 0}</div>
                      <div className="text-[10px] text-slate-400">
                        {(() => {
                          const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
                          const now = new Date();
                          const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                          const monthTotal = (database.siteVisitsHistory || [])
                            .filter((h: any) => h.date.startsWith(monthPrefix))
                            .reduce((sum: number, h: any) => sum + (h.count || 0), 0);
                          return `За ${MONTH_NAMES[now.getMonth()]}: ${monthTotal}`;
                        })()}
                      </div>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-850 text-slate-500 rounded-2xl">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  {/* График последних 7 дней */}
                  <div className="flex items-end gap-1 h-10 mt-2">
                    {(database.siteVisitsHistory || []).slice(-7).map((h: any, i: number) => {
                      const max = Math.max(...(database.siteVisitsHistory || []).slice(-7).map((x: any) => x.count || 0), 1);
                      const height = Math.max(4, Math.round((h.count / max) * 40));
                      const isToday = h.date === getLocalDateKey();
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${h.date}: ${h.count} визитов`}>
                          <div
                            className={`w-full rounded-sm transition-all ${isToday ? 'bg-indigo-500' : 'bg-slate-600/50'}`}
                            style={{height: `${height}px`}}
                          />
                          <span className="text-[8px] text-slate-500">{h.date.slice(8)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Handcrafted precise clean SVG distribution charts to prevent React 19 package mismatch warnings */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                
                {/* SVG format groups stats card */}
                <div className="lg:col-span-6 glass-panel p-6 md:p-8 rounded-3xl space-y-6">
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-450 tracking-wider">Популярные форматы файлов на печать</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Рейтинг типов расширений загружаемых архивов, документов и фото.</p>
                  </div>

                  {totalFormatCounts === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">Нет данных для графиков распределения.</p>
                  ) : (
                    <div className="space-y-5">
                      {[
                        { key: 'document', label: 'Документы (docx, pdf, xlsx, txt)', count: fileFormatGroupsStats.document, color: 'bg-indigo-600 text-indigo-600', fill: '#4f46e5' },
                        { key: 'archive', label: 'Архивы / Комплекты чертежей (zip, rar)', count: fileFormatGroupsStats.archive, color: 'bg-emerald-500 text-emerald-500', fill: '#10b981' },
                        { key: 'image', label: 'Изображения / Фотобумага (png, jpg)', count: fileFormatGroupsStats.image, color: 'bg-amber-400 text-amber-500', fill: '#f59e0b' },
                        { key: 'other', label: 'Другие форматы', count: fileFormatGroupsStats.other, color: 'bg-slate-400', fill: '#94a3b8' }
                      ].map(bar => {
                        const pct = Math.round((bar.count / totalFormatCounts) * 100) || 0;
                        return (
                          <div key={bar.key} className="space-y-2">
                            <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-slate-650 dark:text-slate-300">{bar.label}</span>
                              <span className="text-slate-500">{bar.count} шт. ({pct}%)</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${bar.color.split(' ')[0]} rounded-full transition-all duration-500`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SVG Orders Trend Chart - Flowchart */}
                <div className="lg:col-span-6 glass-panel p-6 md:p-8 rounded-3xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-450 tracking-wider">Динамика заказов по дням недели</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Обороты транзакций и число успешных печатных партий.</p>
                  </div>

                  {/* SVG line graph trend representation */}
                  <div className="my-6 relative w-full h-44">
                    <svg className="w-full h-full" viewBox="0 0 400 150">
                      {/* Grid Horizontal axis */}
                      <line x1="20" y1="20" x2="380" y2="20" stroke="#f1f5f9" strokeWidth="1" className="dark:stroke-slate-800" />
                      <line x1="20" y1="60" x2="380" y2="60" stroke="#f1f5f9" strokeWidth="1" className="dark:stroke-slate-800" />
                      <line x1="20" y1="100" x2="380" y2="100" stroke="#f1f5f9" strokeWidth="1" className="dark:stroke-slate-800" />
                      <line x1="20" y1="130" x2="380" y2="130" stroke="#e2e8f0" strokeWidth="1.5" className="dark:stroke-slate-750" />
                      
                      {/* Plot path representing realistic peaks on Friday/Saturday */}
                      <path
                        d="M 30 110 L 90 95 L 150 115 L 210 60 L 270 45 L 330 80 L 370 70"
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {/* Dot points for summits with tooltips */}
                      <circle cx="30" cy="110" r="4.5" fill="#4f46e5" />
                      <circle cx="90" cy="95" r="4.5" fill="#4f46e5" />
                      <circle cx="150" cy="115" r="4.5" fill="#4f46e5" />
                      <circle cx="210" cy="60" r="4.5" fill="#4f46e5" />
                      <circle cx="270" cy="45" r="4.5" fill="#4f46e5" />
                      <circle cx="330" cy="80" r="4.5" fill="#4f46e5" />
                      <circle cx="370" cy="70" r="4.5" fill="#4f46e5" />

                      {/* Weekday Labels axis */}
                      <text x="30" y="145" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">ПН</text>
                      <text x="90" y="145" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">ВТ</text>
                      <text x="150" y="145" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">СР</text>
                      <text x="210" y="145" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">ЧТ</text>
                      <text x="270" y="145" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">ПТ</text>
                      <text x="330" y="145" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">СБ</text>
                      <text x="370" y="145" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">ВС</text>
                    </svg>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-850/80">
                    <span className="text-[10px] text-slate-500 font-bold block">Ревизия кассы за неделю:</span>
                    <strong className="text-xs text-indigo-650 dark:text-emerald-400">₽{totalRevenue} RUB зачислено</strong>
                  </div>
                </div>

              </div>
              
              {/* Daily logs logs check list */}
              <div className="glass-panel rounded-3xl p-6 md:p-8">
                <span className="text-xs font-black uppercase tracking-wider text-slate-450 block mb-4">Журнал последних банковских транзакций (PCI-DSS)</span>
                
                <div className="space-y-2 max-h-60 overflow-y-auto overscroll-contain pr-1">
                  {database.orders
                    .filter(o => o.paymentStatus === 'paid')
                    .map(payLog => (
                      <div
                        key={payLog.id}
                        className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 rounded-2xl flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800 dark:text-white block">Оплата по заказу {payLog.id}</span>
                          <span className="text-[9px] text-slate-400 block mt-0.5">Оператор списания: {payLog.paymentMethod} &bull; Авто-код: {payLog.transactionId}</span>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-emerald-600 block">+ ₽{payLog.totalCost}</span>
                          <span className="text-[9px] text-slate-400 block">{new Date(payLog.orderDate).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: ADMIN CONFIGURATION & BANK INTEGRATION SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                {/* Profile settings card */}
                <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-6">
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                      <Camera className="text-indigo-650 w-5 h-5" /> Профиль & Персональная аватарка
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">Отредактируйте свои личные данные и настройте графический аватар, отображаемый в чате с клиентами.</p>
                  </div>

                  <div className="flex flex-col items-center gap-5 p-5 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-850">
                    <div
                      className="relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-full"
                      role="button"
                      tabIndex={0}
                      aria-label="Изменить аватар"
                      onClick={() => avatarFileRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          avatarFileRef.current?.click();
                        }
                      }}
                    >
                      <UserAvatar
                        user={{
                          fullName: adminFullName,
                          avatarUrl: adminAvatarUrl,
                        }}
                        className="w-24 h-24 rounded-2xl ring-4 ring-indigo-500/15"
                      />
                      <div
                        className="absolute inset-0 bg-slate-900/60 text-white rounded-2xl opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity text-[10px] font-bold"
                      >
                        <Camera className="w-5 h-5 text-white" />
                        <span>Выказать...</span>
                      </div>
                    </div>

                    <input
                      type="file"
                      ref={avatarFileRef}
                      onChange={handleAvatarFileChange}
                      accept="image/*"
                      aria-label="Загрузить фото аватара администратора"
                      className="hidden"
                    />

                    {/* Fast presets selection */}
                    <div className="text-center w-full">
                      <span className="text-[10px] text-slate-400 font-bold block mb-2 uppercase tracking-wider">Или выберите стильный пресет:</span>
                      <div className="flex justify-center gap-2">
                        {[
                          'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80', // Man Glasses
                          'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80', // Woman Curly
                          'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80', // Man Beard
                          'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80', // Woman Smiling
                          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80'  // Man Smiling
                        ].map((pUrl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setAdminAvatarUrl(pUrl)}
                            className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 shrink-0 ${
                              adminAvatarUrl === pUrl ? 'border-[#6366f1] scale-110' : 'border-transparent opacity-80'
                            }`}
                          >
                            <img src={pUrl} alt="Preset icon" loading="lazy" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Input Fields */}
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="admin-full-name" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ФИО Администратора</label>
                      <input
                        id="admin-full-name"
                        type="text"
                        value={adminFullName}
                        onChange={e => setAdminFullName(e.target.value)}
                        className="block w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-xs text-slate-900 dark:text-white"
                        placeholder="Введите ваше имя"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin-phone" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Контактный телефон</label>
                      <input
                        id="admin-phone"
                        type="text"
                        value={adminPhone}
                        onChange={e => setAdminPhone(e.target.value)}
                        className="block w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-xs text-slate-900 dark:text-white"
                        placeholder="+7 (999) 000-00-00"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Status Alert and Central Save Button */}
              <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                    <Download className="text-indigo-650 w-5 h-5" /> Резервная копия базы данных
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Скачивает JSON-файл со всеми заказами, клиентами, перепиской и уведомлениями на этот момент.
                    На бесплатном тарифе Firebase нет автоматических бэкапов — сохраняйте файл в надёжное место
                    (облако/почта самому себе) периодически, чтобы не потерять данные при сбое.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <button
                    onClick={handleExportBackup}
                    disabled={exportingBackup}
                    className={`px-6 py-3 rounded-2xl font-black text-xs transition-all flex items-center gap-2 w-full sm:w-auto justify-center ${
                      exportingBackup
                        ? 'bg-indigo-400 text-white cursor-not-allowed shadow-none'
                        : 'btn-holo-glass cursor-pointer'
                    }`}
                    style={exportingBackup ? undefined : { color: '#1e293b' }}
                  >
                    {exportingBackup ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Собираем файл...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Скачать резервную копию</span>
                      </>
                    )}
                  </button>
                  {exportError && (
                    <span className="text-xs font-bold text-rose-600">{exportError}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 glass-panel rounded-3xl">
                <div>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Сохранить общие настройки системы</h4>
                  <p className="text-[10px] text-slate-400 mt-1">Все изменения вступят в силу мгновенно и синхронизируются с удаленным сервером и вашим СБП-шлюзом.</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
                  {saveSuccess && (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-xl border border-emerald-200/50 flex items-center gap-1.5 animate-pulse">
                      <Check className="w-4 h-4" /> Настройки сохранены!
                    </span>
                  )}
                  
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className={`px-6 py-3 rounded-2xl font-black text-xs transition-all flex items-center gap-2 w-full sm:w-auto justify-center ${
                      savingSettings
                        ? 'bg-indigo-400 text-white cursor-not-allowed shadow-none'
                        : 'btn-holo-glass cursor-pointer'
                    }`}
                    style={savingSettings ? undefined : { color: '#1e293b' }}
                  >
                    {savingSettings ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Синхронизация...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Применить изменения</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CUSTOM DELETE CONFIRMATION MODAL */}
          {userToDelete && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in">
              <div
                className="glass-window max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 text-rose-600 dark:text-rose-450 mb-4">
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-100/50 dark:border-rose-900/35">
                    <Trash2 className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">Подтверждение удаления</h3>
                    <p className="text-[10px] text-slate-400 font-bold">Это действие абсолютно необратимо</p>
                  </div>
                </div>

                <div className="space-y-3 my-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
                    Вы действительно хотите безвозвратно удалить аккаунт клиента <strong className="text-slate-900 dark:text-slate-100">{userToDelete.fullName}</strong> (<span className="font-mono text-xs text-rose-600">{userToDelete.email}</span>)?
                    <p className="mt-2 text-rose-600 dark:text-rose-400 font-bold">
                      &bull; Будут навсегда стерты все его заказы, чат-логи и уведомления в базе данных.
                    </p>
                  </div>
                  {deleteError && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-xs font-bold text-rose-600 border border-rose-200/50 rounded-xl leading-relaxed">
                      {deleteError}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setUserToDelete(null)}
                    disabled={isDeletingUser}
                    className="flex-1 py-3 border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-bold transition hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    Отменить
                  </button>
                  <button
                    onClick={confirmDeleteUser}
                    disabled={isDeletingUser}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/10 disabled:opacity-50"
                  >
                    {isDeletingUser ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Удаление...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Удалить полностью</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── SERVICES TAB ── */}
          {activeTab === 'services' && (
            <div className="p-5 space-y-5">
              <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                      <Printer className="text-indigo-650 w-5 h-5" /> Витрина услуг
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">Клиенты видят эти карточки в личном кабинете. Добавляй, редактируй, скрывай услуги без кода.</p>
                  </div>
                  <button
                    onClick={() => setShowAddServiceModal(true)}
                    className="btn-holo-glass flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-xl transition cursor-pointer shrink-0"
                    style={{ color: '#1e293b' }}
                  >
                    <span className="text-base leading-none">+</span> Добавить
                  </button>
                </div>

                <div>
                  {(database.services || []).length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-xs gap-3">
                      <Printer className="w-10 h-10 opacity-20" />
                      <p className="font-bold text-center">Витрина пуста — нажми «+ Добавить» чтобы создать первую карточку</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {(database.services || []).map((svc) => (
                      <div
                        key={svc.id}
                        onMouseMove={handleServiceCardTilt}
                        onMouseLeave={handleServiceCardTiltReset}
                        className="service-glass-row rounded-2xl flex flex-col relative overflow-hidden"
                      >
                        {/* Фото услуги — залито от самого верха карточки, без полей по бокам.
                            Кнопки статус/удалить вынесены ИЗ label в отдельный слой рядом —
                            раньше они были внутри label и перехватывали клик, из-за чего
                            рядом с ними нельзя было открыть выбор файла для замены фото. */}
                        <div className="relative h-36 shrink-0">
                          <label className="service-glass-card-media relative h-full w-full cursor-pointer group block">
                            <div className="service-card-glow absolute inset-0 pointer-events-none" />
                            {svc.imageUrl ? (
                              <img
                                src={svc.imageUrl}
                                alt={svc.title}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                style={{ transform: `scale(${svc.imageScale || 1})` }}
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                                {svc.iconUrl ? (
                                  <img src={svc.iconUrl} alt="" loading="lazy" className="w-10 h-10 object-contain" />
                                ) : (
                                  <span className="text-3xl">{svc.emoji}</span>
                                )}
                                <span className="text-[9px] text-white/30 font-bold text-center leading-tight">загрузить фото</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                              <span className="text-white text-xs font-bold">📷 Заменить</span>
                            </div>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const formData = new FormData();
                                formData.append('photo', file);
                                try {
                                  const res = await fetch('https://sever-18.ru/api/service-upload.php', {
                                    method: 'POST',
                                    body: formData,
                                  });
                                  const data = await res.json();
                                  if (data.url) {
                                    handleUpdateService(svc.id, 'imageUrl', data.url);
                                  }
                                } catch {
                                  alert('Ошибка загрузки фото');
                                }
                              }}
                            />
                          </label>

                          {/* Статус + удалить — отдельный слой поверх фото, не внутри label */}
                          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 pointer-events-none">
                            <button
                              type="button"
                              onClick={() => handleUpdateService(svc.id, 'isActive', !svc.isActive)}
                              title={svc.isActive ? 'Скрыть от клиентов' : 'Показать клиентам'}
                              className={`pointer-events-auto w-7 h-7 rounded-lg flex items-center justify-center text-xs backdrop-blur-sm transition cursor-pointer ${svc.isActive ? 'bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40' : 'bg-black/40 text-white/50 hover:bg-black/55'}`}
                            >
                              {svc.isActive ? '👁' : '🙈'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteService(svc.id, svc.title)}
                              className="pointer-events-auto w-7 h-7 rounded-lg bg-black/40 text-rose-400 hover:bg-rose-500/40 hover:text-white backdrop-blur-sm flex items-center justify-center transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Приблизить/отдалить фото — прямо на карточке, не только при
                              создании услуги (работает и для уже загруженных старых фото) */}
                          {svc.imageUrl && (
                            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 pointer-events-none">
                              <button
                                type="button"
                                onClick={() => handleUpdateService(svc.id, 'imageScale', Math.max(1, (svc.imageScale || 1) - 0.1))}
                                title="Отдалить"
                                className="pointer-events-auto w-6 h-6 rounded-md bg-black/45 hover:bg-black/60 text-white backdrop-blur-sm flex items-center justify-center text-xs font-black cursor-pointer transition"
                              >
                                −
                              </button>
                              <span className="pointer-events-none px-1 py-0.5 rounded-md bg-black/45 backdrop-blur-sm text-white text-[9px] font-bold">
                                {Math.round((svc.imageScale || 1) * 100)}%
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateService(svc.id, 'imageScale', Math.min(3, (svc.imageScale || 1) + 0.1))}
                                title="Приблизить"
                                className="pointer-events-auto w-6 h-6 rounded-md bg-black/45 hover:bg-black/60 text-white backdrop-blur-sm flex items-center justify-center text-xs font-black cursor-pointer transition"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 pt-2 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="relative w-8 h-8 shrink-0">
                              {svc.iconUrl ? (
                                <img src={svc.iconUrl} alt="" loading="lazy" className="w-full h-full object-contain border border-white/10 rounded-lg" />
                              ) : (
                                <input
                                  type="text"
                                  defaultValue={svc.emoji}
                                  onBlur={(e) => handleUpdateService(svc.id, 'emoji', e.target.value)}
                                  aria-label="Эмодзи услуги"
                                  className="w-full h-full text-center text-base bg-transparent border border-white/10 rounded-lg p-1 focus:outline-none focus:border-indigo-400"
                                  maxLength={2}
                                />
                              )}
                              <label
                                title={svc.iconUrl ? 'Заменить свою иконку' : 'Загрузить свою иконку'}
                                className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center cursor-pointer shadow-sm"
                              >
                                <Upload className="w-2 h-2 text-white" />
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleExistingServiceIconUpload(svc.id, file);
                                  }}
                                />
                              </label>
                              {svc.iconUrl && (
                                <button
                                  type="button"
                                  title="Убрать свою иконку"
                                  onClick={() => handleUpdateService(svc.id, 'iconUrl', '')}
                                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center cursor-pointer"
                                >
                                  <X className="w-2 h-2 text-white" />
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              defaultValue={svc.title}
                              onBlur={(e) => handleUpdateService(svc.id, 'title', e.target.value)}
                              aria-label="Название услуги"
                              className="w-full min-w-0 bg-transparent border-b border-white/10 text-xs font-bold text-white pb-1 focus:outline-none focus:border-indigo-400"
                              placeholder="Название услуги"
                            />
                          </div>
                          <input
                            type="text"
                            defaultValue={svc.description}
                            onBlur={(e) => handleUpdateService(svc.id, 'description', e.target.value)}
                            aria-label="Описание услуги"
                            className="w-full bg-transparent text-[11px] text-white/60 focus:outline-none focus:text-white/80 focus:ring-2 focus:ring-white/30 rounded"
                            placeholder="Краткое описание"
                          />
                          <input
                            type="text"
                            defaultValue={svc.price}
                            onBlur={(e) => handleUpdateService(svc.id, 'price', e.target.value)}
                            aria-label="Цена услуги"
                            className="w-full bg-transparent text-xs font-black text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 rounded"
                            placeholder="Цена, например: 20 ₽ / стр"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Новая услуга — всплывающее окно с явным сохранением */}
              {showAddServiceModal && (
                <div
                  className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in"
                  onClick={() => setShowAddServiceModal(false)}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="glass-window w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
                  >
                    <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
                      <h3 className="text-sm font-black text-slate-800 dark:text-white">Новая услуга</h3>
                      <button
                        onClick={() => setShowAddServiceModal(false)}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5 space-y-4 overflow-y-auto overscroll-contain">
                      {/* Фото — пропорции 1:1 с реальной карточкой услуги у клиента (h-40,
                          во всю ширину), чтобы превью точно показывало итоговый вид */}
                      <div>
                        <label className="relative h-40 rounded-t-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 cursor-pointer flex items-center justify-center overflow-hidden block">
                          {newServiceForm.imageUrl ? (
                            <img
                              src={newServiceForm.imageUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              style={{ transform: `scale(${newServiceForm.imageScale || 1})` }}
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-slate-400">
                              {newServiceUploading ? (
                                <RefreshCw className="w-6 h-6 animate-spin" />
                              ) : (
                                <>
                                  <span className="text-2xl">{newServiceForm.emoji}</span>
                                  <span className="text-[10px] font-bold">Загрузить фото (необязательно)</span>
                                </>
                              )}
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleNewServicePhotoUpload(file);
                            }}
                          />
                        </label>
                        {newServiceForm.imageUrl && (
                          <div className="flex items-center justify-center gap-2 p-2 rounded-b-xl border border-t-0 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                            <button
                              type="button"
                              onClick={() => setNewServiceForm(f => ({ ...f, imageScale: Math.max(1, (f.imageScale || 1) - 0.1) }))}
                              className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-white font-black flex items-center justify-center cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                              title="Отдалить"
                            >
                              −
                            </button>
                            <span className="text-[10px] font-bold text-slate-400 w-10 text-center">{Math.round((newServiceForm.imageScale || 1) * 100)}%</span>
                            <button
                              type="button"
                              onClick={() => setNewServiceForm(f => ({ ...f, imageScale: Math.min(3, (f.imageScale || 1) + 0.1) }))}
                              className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-white font-black flex items-center justify-center cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                              title="Приблизить"
                            >
                              +
                            </button>
                            {newServiceForm.imageScale !== 1 && (
                              <button
                                type="button"
                                onClick={() => setNewServiceForm(f => ({ ...f, imageScale: 1 }))}
                                className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 cursor-pointer ml-1"
                              >
                                Сбросить
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative w-12 h-11 shrink-0">
                          {newServiceForm.iconUrl ? (
                            <img src={newServiceForm.iconUrl} alt="" className="w-full h-full object-contain border border-slate-200 dark:border-white/10 rounded-lg" />
                          ) : (
                            <input
                              type="text"
                              value={newServiceForm.emoji}
                              onChange={(e) => setNewServiceForm(f => ({ ...f, emoji: e.target.value }))}
                              aria-label="Эмодзи услуги"
                              className="w-full h-full text-center text-lg bg-transparent border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:border-indigo-400"
                              maxLength={2}
                            />
                          )}
                          <label
                            title={newServiceForm.iconUrl ? 'Заменить свою иконку' : 'Загрузить свою иконку'}
                            className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center cursor-pointer shadow-sm"
                          >
                            <Upload className="w-2.5 h-2.5 text-white" />
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/svg+xml"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleNewServiceIconUpload(file);
                              }}
                            />
                          </label>
                          {newServiceForm.iconUrl && (
                            <button
                              type="button"
                              title="Убрать свою иконку"
                              onClick={() => setNewServiceForm(f => ({ ...f, iconUrl: '' }))}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5 text-white" />
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={newServiceForm.title}
                          onChange={(e) => setNewServiceForm(f => ({ ...f, title: e.target.value }))}
                          aria-label="Название услуги"
                          placeholder="Название услуги"
                          className="w-full min-w-0 bg-transparent border border-slate-200 dark:border-white/10 rounded-lg p-2 text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:border-indigo-400"
                          autoFocus
                        />
                      </div>

                      <textarea
                        value={newServiceForm.description}
                        onChange={(e) => setNewServiceForm(f => ({ ...f, description: e.target.value }))}
                        aria-label="Описание услуги"
                        placeholder="Краткое описание"
                        rows={2}
                        className="w-full bg-transparent border border-slate-200 dark:border-white/10 rounded-lg p-2 text-xs text-slate-700 dark:text-white/80 focus:outline-none focus:border-indigo-400 resize-none"
                      />

                      <input
                        type="text"
                        value={newServiceForm.price}
                        onChange={(e) => setNewServiceForm(f => ({ ...f, price: e.target.value }))}
                        aria-label="Цена услуги"
                        placeholder="Цена, например: 20 ₽ / стр"
                        className="w-full bg-transparent border border-slate-200 dark:border-white/10 rounded-lg p-2 text-sm font-black text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div className="p-5 border-t border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
                      <button
                        onClick={handleCreateService}
                        className="btn-holo-glass w-full py-3 rounded-xl font-black text-sm cursor-pointer"
                        style={{ color: '#1e293b' }}
                      >
                        Сохранить
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ARCHIVE TAB ── */}
          {activeTab === 'archive' && (
            <div className="p-5 space-y-4">
              <div>
                <h2 className="text-lg font-black text-white">Архив выданных</h2>
                <p className="text-xs text-white/50 mt-0.5">Заказы удаляются через 48 часов после выдачи</p>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={archiveSearch}
                  onChange={e => setArchiveSearch(e.target.value)}
                  placeholder="Поиск по сумме, имени, email или дате..."
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {(() => {
                const archivedOrders = database.orders
                  .filter(o => o.status === 'printed')
                  .filter(o => {
                    const q = archiveSearch.trim().toLowerCase();
                    if (!q) return true;
                    const completedAt = new Date(o.completedAt || o.orderDate);
                    const dateStr = completedAt.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
                    return (
                      String(o.totalCost).includes(q) ||
                      (o.userName || '').toLowerCase().includes(q) ||
                      (o.userEmail || '').toLowerCase().includes(q) ||
                      dateStr.includes(q)
                    );
                  })
                  .sort((a, b) => new Date(b.completedAt || b.orderDate).getTime() - new Date(a.completedAt || a.orderDate).getTime());

                if (archivedOrders.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                      <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-3xl">📦</div>
                      <div>
                        <p className="text-white font-bold text-sm">{archiveSearch ? 'Ничего не найдено' : 'Архив пуст'}</p>
                        <p className="text-white/40 text-xs mt-1">{archiveSearch ? 'Попробуйте другой запрос' : 'Выданные заказы появятся здесь'}</p>
                      </div>
                    </div>
                  );
                }

                return (
                <div className="space-y-3">
                  {archivedOrders
                    .map(order => {
                      const completedAt = new Date(order.completedAt || order.orderDate);
                      const deleteAt = new Date(completedAt.getTime() + 5 * 24 * 60 * 60 * 1000);
                      const daysLeft = Math.max(0, Math.ceil((deleteAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
                      return (
                        <div key={order.id} className="glass-panel rounded-2xl p-4 flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-black text-sm">{order.id}</span>
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-black">Выдан</span>
                            </div>
                            <p className="text-white/60 text-xs mt-0.5">{order.userName} · {order.userEmail}</p>
                            <p className="text-white/40 text-xs mt-1">
                              Выдан: {completedAt.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} в {completedAt.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'})}
                            </p>
                            <p className="text-amber-400/80 text-[10px] mt-0.5 font-bold">
                              🗑 Автоудаление через {daysLeft} {daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-emerald-400 font-black text-sm">{order.totalCost} ₽</p>
                            <button
                              onClick={async () => {
                                if (confirm(`Удалить заказ ${order.id}?`)) {
                                  await deleteOrderFromFirebase(order.id);
                                  onUpdateDatabase({ orders: database.orders.filter(o => o.id !== order.id) });
                                }
                              }}
                              className="mt-2 px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold transition cursor-pointer"
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
                );
              })()}
            </div>
          )}

        </div>
      </main>

    </div>
  );
}
