/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { User, Order, ChatMessage, Notification, PrintFile, FileFormatGroup, PaymentStatus, OrderStatus } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { RatingWidget } from './RatingWidget';
import { UserAvatar } from './UserAvatar';
import { EmojiPicker } from './EmojiPicker';
import logoImg from '../assets/logo.png';
import { 
  FileText, Upload, Trash2, MapPin, Sliders, FileType, CheckCircle, Clock, 
  Send, MessageSquare, AlertCircle, Sparkles, CreditCard, Shield, 
  FileCheck, LogOut, Check, ArrowDown, Bell, HelpCircle, Laptop, ArrowLeft,
  UserCheck, Layers, RefreshCw, Smartphone, Phone, Star, Trophy, Award, Share2, Copy, Mail, Gift,
  Maximize2, Eye, ZoomIn, ZoomOut, RotateCw, Printer
} from 'lucide-react';
import { 
  calculateOrderCost, getFileFormatGroup, formatFileSize, 
  formatDateTime, getStatusLabel, getStatusColor, 
  getPaymentStatusLabel, getPaymentStatusColor, printInvoiceHTML,
  getClientTierForUser, isWorkingHours, showBrowserNotification
} from '../utils';
import { db, doc, setDoc, storage, ref, uploadBytes, getDownloadURL } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

// Synthesized high-quality feedback sound chimes using Web Audio API
function playPlaceOrderSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, now); // E4
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.12); // E5
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } catch (err) {
    console.warn(err);
  }
}

function playOrderSuccessSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    // Play a beautiful dual-tone ascending success fanfare
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.15); // A5
    
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);
    
    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
        osc2.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.18); // C6
        
        gain2.gain.setValueAtTime(0.1, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.35);
      } catch (e) {}
    }, 80);
  } catch (err) {
    console.warn(err);
  }
}

// Helper function to count PDF pages client-side using cross-references scanner
async function countPdfPages(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          resolve(1);
          return;
        }
        const textDecoder = new TextDecoder('utf-8');
        const text = textDecoder.decode(new Uint8Array(arrayBuffer));
        // Search for Pages count attribute
        const pagesMatches = text.match(/\/Type\s*\/Pages\s*\/Count\s*(\d+)/g);
        if (pagesMatches && pagesMatches.length > 0) {
          const counts = pagesMatches.map(m => {
            const numMatch = m.match(/\d+/);
            return numMatch ? parseInt(numMatch[0], 10) : 1;
          });
          resolve(Math.max(...counts));
          return;
        }
        const countMatches = text.match(/\/Count\s*(\d+)/g);
        if (countMatches && countMatches.length > 0) {
          const counts = countMatches.map(m => {
            const numMatch = m.match(/\d+/);
            return numMatch ? parseInt(numMatch[0], 10) : 1;
          }).filter(c => c < 100000);
          if (counts.length > 0) {
            resolve(Math.max(...counts));
            return;
          }
        }
      } catch (err) {
        console.warn('PDF Count pages error:', err);
      }
      resolve(1);
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file);
  });
}

// Analyse color fill % from an image URL using Canvas API (0-100)
// Works precisely for raster images; for PDFs uses the first-page preview.
async function analyzeColorFill(imageUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const MAX = 200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(50); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let coloredPixels = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
          if (a < 30) continue;
          total++;
          const max = Math.max(r,g,b)/255, min = Math.min(r,g,b)/255;
          const saturation = max === 0 ? 0 : (max - min) / max;
          if (saturation > 0.15 && max < 0.97) coloredPixels++;
        }
        resolve(total === 0 ? 0 : Math.round((coloredPixels / total) * 100));
      } catch { resolve(50); }
    };
    img.onerror = () => resolve(50);
    img.src = imageUrl;
  });
}

// Map fill % → price per page for color print on plain paper
function colorFillPrice(pct: number) { return pct <= 20 ? 25 : pct <= 60 ? 40 : 65; }
function colorFillLabel(pct: number) { return pct <= 20 ? 'Мелкий цвет' : pct <= 60 ? '~50% заливка' : '100% заливка'; }

interface DashboardProps {
  user: User;
  onLogout: () => void;
  database: {
    users: User[];
    orders: Order[];
    chatMessages: ChatMessage[];
    notifications: Notification[];
  };
  onUpdateDatabase: (updatedData: {
    orders?: Order[];
    chatMessages?: ChatMessage[];
    notifications?: Notification[];
    users?: User[];
  }) => void;
  onDeleteAccount: (userId: string) => void;
}

export function Dashboard({ user, onLogout, database, onUpdateDatabase, onDeleteAccount }: DashboardProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<'upload' | 'orders' | 'chat' | 'profile' | 'contacts' | 'services'>('upload');
  const [dismissedRatings, setDismissedRatings] = React.useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dismissed_ratings') || '[]')); } catch { return new Set(); }
  });
  
  // Visual Theme Customizer
  const [designTheme, setDesignTheme] = useState<'blue' | 'kraft' | 'cyber'>(() => {
    return (localStorage.getItem('print_shop_design_theme') as 'blue' | 'kraft' | 'cyber') || 'cyber';
  });

  useEffect(() => {
    // 3D tilt effect on icon hover (mouse tracking)
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
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    
    if (designTheme === 'blue') {
      // Restore default blue/indigo enterprise colors
      root.style.removeProperty('--color-indigo-50');
      root.style.removeProperty('--color-indigo-100');
      root.style.removeProperty('--color-indigo-200');
      root.style.removeProperty('--color-indigo-300');
      root.style.removeProperty('--color-indigo-400');
      root.style.removeProperty('--color-indigo-500');
      root.style.removeProperty('--color-indigo-600');
      root.style.removeProperty('--color-indigo-700');
      root.style.removeProperty('--color-indigo-800');
      root.style.removeProperty('--color-indigo-900');
      root.style.removeProperty('--color-indigo-950');
      
      root.style.removeProperty('--color-slate-50');
      root.style.removeProperty('--color-slate-950');
    } else if (designTheme === 'kraft') {
      // Emerald Green variables for primary color
      root.style.setProperty('--color-indigo-50', '#ecfdf5');
      root.style.setProperty('--color-indigo-100', '#d1fae5');
      root.style.setProperty('--color-indigo-200', '#a7f3d0');
      root.style.setProperty('--color-indigo-300', '#6ee7b7');
      root.style.setProperty('--color-indigo-400', '#34d399');
      root.style.setProperty('--color-indigo-500', '#10b981');
      root.style.setProperty('--color-indigo-600', '#059669'); // Emerald Forest
      root.style.setProperty('--color-indigo-700', '#047857');
      root.style.setProperty('--color-indigo-800', '#065f46');
      root.style.setProperty('--color-indigo-900', '#064e3b');
      root.style.setProperty('--color-indigo-950', '#022c22');
      
      // Warm Recycled Creamy Kraft Paper background overrides
      root.style.setProperty('--color-slate-50', '#fdfbf7');
      root.style.setProperty('--color-slate-950', '#060a0f');
    } else if (designTheme === 'cyber') {
      // Glowing Neon Purple/Violet variables for primary color
      root.style.setProperty('--color-indigo-50', '#faf5ff');
      root.style.setProperty('--color-indigo-100', '#f3e8ff');
      root.style.setProperty('--color-indigo-200', '#e9d5ff');
      root.style.setProperty('--color-indigo-300', '#d8b4fe');
      root.style.setProperty('--color-indigo-400', '#c084fc');
      root.style.setProperty('--color-indigo-500', '#a855f7');
      root.style.setProperty('--color-indigo-600', '#8b5cf6'); // Violet Neon Pulse
      root.style.setProperty('--color-indigo-700', '#7c3aed');
      root.style.setProperty('--color-indigo-800', '#6d28d9');
      root.style.setProperty('--color-indigo-900', '#581c87');
      root.style.setProperty('--color-indigo-950', '#120224');
      
      // Absolute Cyber-Midnight Dark Background
      root.style.setProperty('--color-slate-50', '#f8f9fc');
      root.style.setProperty('--color-slate-950', '#020308');
    }
    
    // Dispatch custom event to broadcast design theme changes if other components need to listen
    window.dispatchEvent(new CustomEvent('print_shop_theme_changed', { detail: designTheme }));
    localStorage.setItem('print_shop_design_theme', designTheme);
  }, [designTheme]);
  
  // Profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // Онбординг — показываем только новым клиентам (не видевшим раньше)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('onboarding_seen');
  });
  const [activeLegalDoc, setActiveLegalDoc] = useState<'privacy' | 'terms' | 'delivery' | null>(null);
  const [editFullName, setEditFullName] = useState(user.fullName);
  const [editPhone, setEditPhone] = useState(user.phone || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(user.avatarUrl || '');
  const [editAvatarScale, setEditAvatarScale] = useState(user.avatarScale || 1);
  const [editAvatarX, setEditAvatarX] = useState(user.avatarX || 0);
  const [editAvatarY, setEditAvatarY] = useState(user.avatarY || 0);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    try {
      const fileRef = ref(storage, `avatars/${user.id}_${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);
      
      const updatedUsers = database.users.map(u => {
        if (u.id === user.id) {
          return {
            ...u,
            avatarUrl: downloadUrl
          };
        }
        return u;
      });
      
      setEditAvatarUrl(downloadUrl);
      onUpdateDatabase({ users: updatedUsers });
    } catch (err) {
      console.error('Error uploading avatar:', err);
    } finally {
      setAvatarUploading(false);
    }
  };

  // Keep edits synced with user updates
  useEffect(() => {
    setEditFullName(user.fullName);
    setEditPhone(user.phone || '');
    setEditAvatarUrl(user.avatarUrl || '');
    setEditAvatarScale(user.avatarScale || 1);
    setEditAvatarX(user.avatarX || 0);
    setEditAvatarY(user.avatarY || 0);
  }, [user.fullName, user.phone, user.avatarUrl, user.avatarScale, user.avatarX, user.avatarY]);

  // Keep client online status synced in Firestore
  useEffect(() => {
    if (!user || !user.id) return;
    
    const setOnlineState = async (online: boolean) => {
      try {
        const userDocRef = doc(db, 'users', user.id);
        await setDoc(userDocRef, { 
          isOnline: online, 
          lastActiveAt: new Date().toISOString() 
        }, { merge: true });
      } catch (err) {
        // Silent recovery
      }
    };

    setOnlineState(true);

    const interval = setInterval(() => {
      setOnlineState(true);
    }, 45000);

    const handleUnload = () => {
      setOnlineState(false);
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      setOnlineState(false);
    };
  }, [user.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFullName.trim()) return;

    const updatedUsers = database.users.map(u => {
      if (u.id === user.id) {
        return {
          ...u,
          fullName: editFullName.trim(),
          phone: editPhone.trim(),
          avatarUrl: editAvatarUrl.trim(),
          avatarScale: editAvatarScale,
          avatarX: editAvatarX,
          avatarY: editAvatarY
        };
      }
      return u;
    });

    onUpdateDatabase({ users: updatedUsers });
    setIsEditingProfile(false);
  };

  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(!!user.telegramChatId);

  const handleConnectTelegram = async () => {
    setTelegramLinking(true);
    try {
      // Генерируем уникальный код
      const code = 'u_' + user.id.slice(-6) + '_' + Math.random().toString(36).slice(2, 7);

      // Сохраняем код на сервере
      await fetch('https://www.sever-18.ru/api/telegram_link.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userId: user.id })
      });

      // Открываем бота с кодом — клиент просто нажмёт Отправить
      window.open(`https://t.me/photosever_bot?start=${code}`, '_blank');
    } catch {
      setShowInAppPush('Ошибка подключения. Попробуйте ещё раз.');
    } finally {
      setTelegramLinking(false);
    }
  };
  
  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<PrintFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Print properties state
  const [paperType, setPaperType] = useState<'standard' | 'glossy' | 'matte' | 'kraft' | 'standard_a3' | 'bw_a3'>('standard');
  const [photoSize, setPhotoSize] = useState<'10*15' | '13*18' | '15*20' | '20*30'>('10*15');
  const [previewFile, setPreviewFile] = useState<PrintFile | null>(null);
  const [paperDensity, setPaperDensity] = useState<string>('regular');
  const [printColor, setPrintColor] = useState<'bw' | 'color' | 'color_full'>('bw');
  const [copies, setCopies] = useState<number>(1);
  const [binding, setBinding] = useState<'none' | 'staple' | 'file' | 'spring_plastic' | 'spring_metal' | 'hard_cover'>('none');
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [selectedService, setSelectedService] = useState<{title: string; price: number} | null>(null);
  const [showTornPaperAnimation, setShowTornPaperAnimation] = useState(false);
  const [tornPromoCode, setTornPromoCode] = useState<string>('');


  const getActivePromo = () => {
    if (appliedPromo) return appliedPromo;
    const typed = promoCode.trim().toUpperCase();
    if (
      typed === 'PROMO10' ||
      typed === 'STUDENT15' ||
      typed === 'WELCOME5' ||
      typed === 'FIRSTFREE' ||
      typed === 'COPYMAX' ||
      (user.promoCode && typed === user.promoCode.trim().toUpperCase())
    ) {
      return typed;
    }
    return null;
  };

  const getActiveDiscountPercent = (activePromoCode: string | null) => {
    if (!activePromoCode) return 0;
    const code = activePromoCode.trim().toUpperCase();
    if (code === 'PROMO10') return 10;
    if (code === 'STUDENT15') return 15;
    if (code === 'WELCOME5') return 5;
    if (code === 'FIRSTFREE') return 20;
    if (code === 'COPYMAX') return 50;
    if (user.promoCode && code === user.promoCode.trim().toUpperCase()) {
      return user.promoDiscount || 0;
    }
    const match = code.match(/^GIFT(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 0;
  };

  // Gift Promo System state
  const [showPromoGiftModal, setShowPromoGiftModal] = useState(false);
  const [show3DMockupModal, setShow3DMockupModal] = useState(false);
  const [mockRotateX, setMockRotateX] = useState<number>(25);
  const [mockRotateY, setMockRotateY] = useState<number>(15);
  const [mockScale, setMockScale] = useState<number>(1.2);

  // Trigger gift modal when a new promo is gifted to user
  useEffect(() => {
    if (user.promoCode && user.promoGiftedSeen === false) {
      setShowPromoGiftModal(true);
    }
  }, [user.promoCode, user.promoGiftedSeen]);

  // Promo code weekly burn & push alerts check
  useEffect(() => {
    if (!user || !user.promoCode || !user.promoExpiresAt) return;

    const expirationDate = new Date(user.promoExpiresAt);
    const now = new Date();
    const diffTime = expirationDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      // Burned/Expired!
      showBrowserNotification(
        'Промокод сгорел ⏳',
        `Срок действия вашего промокода ${user.promoCode} истек.`
      );
      
      const updatedUsers = database.users.map(u => {
        if (u.id === user.id) {
          const newUser = { ...u };
          delete newUser.promoCode;
          delete newUser.promoDiscount;
          delete newUser.promoExpiresAt;
          delete newUser.promoGiftedSeen;
          return newUser;
        }
        return u;
      });
      onUpdateDatabase({ users: updatedUsers });
      
    } else if (diffDays <= 2) {
      // Expiring soon warning (e.g., within 2 days)
      const lastWarned = sessionStorage.getItem(`promo_burn_warned_${user.promoCode}`);
      if (!lastWarned) {
        showBrowserNotification(
          'Промокод скоро сгорит! 🔥',
          `Успейте использовать ваш промокод ${user.promoCode} (-${user.promoDiscount}%). Осталось всего ${diffDays} дн.!`
        );
        sessionStorage.setItem(`promo_burn_warned_${user.promoCode}`, 'true');
      }
    }
  }, [user, database.users]);

  // Auto-dismiss the tearing animation after 5 seconds
  useEffect(() => {
    if (showTornPaperAnimation) {
      const timer = setTimeout(() => {
        setShowTornPaperAnimation(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showTornPaperAnimation]);

  // Payment popup state
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'sbp' | 'qr' | 'on_receipt'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);

  // Live chat state
  const [chatInput, setChatInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Notification states
  const [pushConsent, setPushConsent] = useState<'default' | 'granted' | 'denied'>(() => {
    return (localStorage.getItem('print_shop_push_consent') as any) || 'default';
  });
  const [showInAppPush, setShowInAppPush] = useState<string | null>(null);

  // Filter state for orders
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Order file deletion state
  const [fileToConfirmDelete, setFileToConfirmDelete] = useState<{ orderId: string; fileId: string } | null>(null);

  const canDeleteFileFromOrder = (ord: Order) => {
    return ord.status === 'pending' || ord.status === 'approved';
  };

  const handleDeleteFileFromOrder = (orderId: string, fileId: string) => {
    const order = database.orders.find(o => o.id === orderId);
    if (!order) return;

    if (!canDeleteFileFromOrder(order)) return;

    const updatedFiles = order.files.filter(f => f.id !== fileId);

    let updatedOrders;
    if (updatedFiles.length === 0) {
      // If no files are left, delete the entire order
      updatedOrders = database.orders.filter(o => o.id !== orderId);
      
      const newNotif = {
        id: 'n_' + Date.now(),
        userId: user.id,
        title: "Заказ отменен",
        body: `Все файлы удалены. Заказ ${orderId} автоматически отменен и удален из базы.`,
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

      onUpdateDatabase({
        orders: updatedOrders
      });
    }
    setFileToConfirmDelete(null);
  };

  // Account Self-Delete Modal State
  const [showSelfDeleteModal, setShowSelfDeleteModal] = useState(false);
  const [isDeletingSelf, setIsDeletingSelf] = useState(false);
  const [selfDeleteError, setSelfDeleteError] = useState<string | null>(null);

  // Handle rating submission
  const handleRate = (orderId: string, rating: 1|2|3|4|5, comment: string) => {
    const updatedOrders = database.orders.map(o =>
      o.id === orderId ? { ...o, rating, ratingComment: comment } : o
    );
    onUpdateDatabase({ orders: updatedOrders });
    setDismissedRatings(prev => {
      const next = new Set(prev); next.add(orderId);
      localStorage.setItem('dismissed_ratings', JSON.stringify([...next]));
      return next;
    });
  };

  const handleDismissRating = (orderId: string) => {
    setDismissedRatings(prev => {
      const next = new Set(prev); next.add(orderId);
      localStorage.setItem('dismissed_ratings', JSON.stringify([...next]));
      return next;
    });
  };

  // Filter database objects belonging to this user
  const userOrders = database.orders.filter(o => o.userId === user.id);
  const userNotifications = database.notifications.filter(n => n.userId === user.id);
  const userChats = database.chatMessages.filter(c => c.userId === user.id);

  // Unread badge indicators
  const unreadChatsCount = userChats.filter(c => c.senderRole === 'admin' && !c.readByClient).length;
  const unreadNotificationsCount = userNotifications.filter(n => !n.read).length;

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, userChats.length]);

  // Mark chats as read when opening Chat tab
  useEffect(() => {
    if (activeTab === 'chat' && unreadChatsCount > 0) {
      const updatedChats = database.chatMessages.map(c => {
        if (c.userId === user.id && c.senderRole === 'admin') {
          return { ...c, readByClient: true };
        }
        return c;
      });
      onUpdateDatabase({ chatMessages: updatedChats });
    }
  }, [activeTab]);

  // Mark notifications as read when opening profile / or general
  const handleMarkNotificationsRead = () => {
    const updatedNotifs = database.notifications.map(n => {
      if (n.userId === user.id) {
        return { ...n, read: true };
      }
      return n;
    });
    onUpdateDatabase({ notifications: updatedNotifs });
  };

  // Monitor status updates in background and trigger browser / simulated push notifications
  const [lastCheckOrders, setLastCheckOrders] = useState<Record<string, string>>({});
  useEffect(() => {
    // Collect mapping of order id to status
    const currentStatuses: Record<string, string> = {};
    userOrders.forEach(o => {
      currentStatuses[o.id] = o.status;
    });

    // Check if any status changed since last check
    let changedOrder: { id: string; oldS: string; newS: string } | null = null;
    if (Object.keys(lastCheckOrders).length > 0) {
      for (const [id, s] of Object.entries(currentStatuses)) {
        if (lastCheckOrders[id] && lastCheckOrders[id] !== s) {
          changedOrder = { id, oldS: lastCheckOrders[id], newS: s };
          break;
        }
      }
    }

    if (changedOrder) {
      // Create notification record in DB list
      const title = 'Статус заказа обновлен!';
      const body = `Заказ ${changedOrder.id} изменил статус на: "${getStatusLabel(changedOrder.newS as any)}"`;
      
      const newNotif: Notification = {
        id: 'n_' + Date.now(),
        userId: user.id,
        title,
        body,
        timestamp: new Date().toISOString(),
        read: false,
        type: 'order_status'
      };

      onUpdateDatabase({
        notifications: [newNotif, ...database.notifications]
      });

      // Show in-app banner
      setShowInAppPush(`${title} \n ${body}`);
      setTimeout(() => setShowInAppPush(null), 5000);

      // Trigger actual HTML5 system Notification if permitted
      if (pushConsent === 'granted' && 'Notification' in window) {
        new window.Notification(title, { body });
      }
    }

    setLastCheckOrders(currentStatuses);
  }, [JSON.stringify(userOrders.map(o => o.status))]);

  // File Upload Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const uploadFileToFirebaseStorage = async (file: File, fileId: string) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.id);

      const response = await fetch('https://sever-18.ru/api/upload.php', {
        method: 'POST',
        body: formData,
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error('Сервер вернул ошибку: ' + response.status);
      }

      const data = await response.json();
      if (!data.success || !data.url) {
        throw new Error(data.error || 'Не удалось загрузить файл');
      }

      setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, url: data.url } : f));
    } catch (error: any) {
      console.error('Server upload error for fileId ' + fileId + ':', error);
      const errMsg = error?.message || String(error) || 'Неизвестная ошибка';
      setUploadError(`Ошибка: ${errMsg}`);
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    }
  };

  const handleFiles = (filesList: FileList | File[]) => {
    if (!isWorkingHours()) {
      setUploadError("К сожалению, приём файлов приостановлен во внерабочее время. Мы работаем: Пн-Пт 09:00-19:00, Сб-Вс 10:00-19:00.");
      return;
    }
    setUploadError(null);
    const newFiles: PrintFile[] = [];
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const formatGroup = getFileFormatGroup(file.name);
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const fileId = 'file_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000);
      
      let previewUrl = '';
      if (file.type.startsWith('image/') || formatGroup === 'image' || isPdf) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch (e) {
          console.error('Error creating object URL:', e);
        }
      }

      newFiles.push({
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        formatGroup,
        pageCount: isPdf ? undefined : 1,
        previewUrl: previewUrl || undefined
      });

      if (isPdf) {
        countPdfPages(file).then(pages => {
          setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, pageCount: pages } : f));
        });
      }

      // Auto-detect color fill % for images and PDFs (using preview)
      if (previewUrl) {
        analyzeColorFill(previewUrl).then(pct => {
          setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, colorFillPercent: pct } : f));
        });
      }

      // Upload file directly to Firebase Storage bucket asynchronously
      uploadFileToFirebaseStorage(file, fileId);
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);

    // Create system notification for uploaded file
    const newNotif: Notification = {
      id: 'n_up_' + Date.now(),
      userId: user.id,
      title: 'Успешная загрузка',
      body: `Загружено файлов: ${filesList.length} шт. Добавьте параметры печати для заказа.`,
      timestamp: new Date().toISOString(),
      read: false,
      type: 'profile'
    };
    onUpdateDatabase({
      notifications: [newNotif, ...database.notifications]
    });
  };

  // Add listener for PWA Web Share Target
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('shared-target')) {
      // Clear query params immediately
      window.history.replaceState({}, '', '/');

      const processSharedItems = async () => {
        try {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('PWA_Share_Target_DB', 1);
            request.onsuccess = (e: any) => resolve(e.target.result);
            request.onerror = (e: any) => reject(e.target.error);
          });

          if (!db.objectStoreNames.contains('shared_items')) {
            return;
          }

          const items: any[] = await new Promise((resolve, reject) => {
            const transaction = db.transaction('shared_items', 'readonly');
            const store = transaction.objectStore('shared_items');
            const requestAll = store.getAll();
            requestAll.onsuccess = () => resolve(requestAll.result);
            requestAll.onerror = (e: any) => reject(e.target.error);
          });

          if (items && items.length > 0) {
            const filesToImport: File[] = [];

            for (const item of items) {
              if (item.file) {
                // Reconstruct actual file object
                const reconstructedFile = new File([item.file], item.name || 'shared_document', { 
                  type: item.type || 'application/octet-stream' 
                });
                filesToImport.push(reconstructedFile);
              } else if (item.text) {
                // Shared search text or shared urls
                const textFile = new File([item.text], 'shared_text.txt', { 
                  type: 'text/plain' 
                });
                filesToImport.push(textFile);
              }
            }

            if (filesToImport.length > 0) {
              handleFiles(filesToImport);
              setActiveTab('upload');
            }

            // Clear database store so we don't reload items
            const clearTransaction = db.transaction('shared_items', 'readwrite');
            const clearStore = clearTransaction.objectStore('shared_items');
            clearStore.clear();
          }
        } catch (err) {
          console.error('Error importing shared files via Web Share Target:', err);
        }
      };

      const t = setTimeout(() => {
        processSharedItems();
      }, 600);
      return () => clearTimeout(t);
    }
  }, []);

  const removeUploadedFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Build the order from uploaded files
  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWorkingHours()) {
      setUploadError("К сожалению, отправка заказов приостановлена во внерабочее время. Мы работаем: Пн-Пт 09:00-19:00, Сб-Вс 10:00-19:00.");
      return;
    }
    if (uploadedFiles.length === 0) return;

    const stillUploading = uploadedFiles.some(f => !f.url);
    if (stillUploading) {
      setUploadError("Пожалуйста, подождите, пока все файлы загрузятся в облако.");
      return;
    }

    // Проверяем что для фотобумаги выбран размер
    const missingSize = uploadedFiles.find(f => f.paperType === 'photo' && !f.photoSize);
    if (missingSize || (paperType === 'glossy' || paperType === 'matte') && !photoSize) {
      setUploadError("Пожалуйста, выберите размер фотографии (10×15, 13×18, 15×21 и т.д.) перед отправкой заказа.");
      return;
    }

    const finalPromo = getActivePromo();
    const finalDiscount = finalPromo ? getActiveDiscountPercent(finalPromo) : undefined;

    // Считаем итоговую стоимость из per-file настроек
    const photoSizePrices: Record<string, number> = {
      '10x15': 20, 'polaroid': 30, '13x18': 50, '15x21': 70, '20x30': 100, '30x40': 250
    };
    const subtotal = uploadedFiles.reduce((acc, f) => {
      const isPhotoFile = f.paperType === 'photo';
      const fileCopies = f.fileCopies || 1;
      const pages = f.pageCount || 1;
      const fillPct = f.colorFillPercent ?? 50;
      const isA3 = f.format === 'a3';
      const pp = isPhotoFile
        ? (photoSizePrices[f.photoSize || '10x15'] || 20)
        : ((f.printColor || 'bw') === 'bw'
          ? (isA3 ? 100 : 20)
          : (isA3 ? 150 : (fillPct <= 20 ? 25 : fillPct <= 60 ? 40 : 65)));
      return acc + pp * (isPhotoFile ? 1 : pages) * fileCopies;
    }, 0);
    const totalCost = finalDiscount ? Math.round(subtotal * (1 - finalDiscount / 100)) : subtotal;

    // Если заказ из витрины услуг — добавляем цену услуги
    const serviceExtra = selectedService?.price || 0;
    const finalTotalCost = totalCost + serviceExtra;

    const orderId = `ORD-${1000 + database.orders.length + 1}`;

    const newOrder: Order = {
      id: orderId,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      files: uploadedFiles,
      orderDate: new Date().toISOString(),
      status: 'pending',
      totalCost: finalTotalCost,
      paymentStatus: 'unpaid',
      paperType: uploadedFiles[0]?.paperType === 'photo' ? 'glossy' : 'standard',
      paperDensity: 'regular',
      printColor: (uploadedFiles[0]?.printColor || 'bw') as 'bw' | 'color' | 'color_full',
      copies: uploadedFiles[0]?.fileCopies || 1,
      notes: notes.trim(),
      binding: 'none',
      promoCode: finalPromo || undefined,
      promoDiscount: finalDiscount
    };

    const isPersonalPromo = user.promoCode && finalPromo === user.promoCode.trim().toUpperCase();
    let updatedUsers = database.users;

    if (isPersonalPromo) {
      setTornPromoCode(user.promoCode || '');
      setShowTornPaperAnimation(true);
      
      updatedUsers = database.users.map(u => {
        if (u.id === user.id) {
          const updatedUser = { ...u };
          delete updatedUser.promoCode;
          delete updatedUser.promoDiscount;
          delete updatedUser.promoGiftedSeen;
          return updatedUser;
        }
        return u;
      });
    }

    // Сохраняем данные заказа временно в sessionStorage
    // Заказ будет создан в Firebase только после успешной оплаты
    const pendingOrder = {
      ...newOrder,
      files: newOrder.files.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        url: f.url || '',
        paperType: f.paperType || 'plain',
        printColor: f.printColor || 'bw',
        fileCopies: f.fileCopies || 1,
        photoSize: f.photoSize || null,
        formatGroup: f.formatGroup || 'other',
        pageCount: f.pageCount || 1,
        colorFillPercent: f.colorFillPercent || 0,
      }))
    };
    sessionStorage.setItem('pending_order', JSON.stringify(pendingOrder));

    // Показываем что идёт обработка
    setUploadError('');
    const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (btn) { btn.disabled = true; btn.textContent = 'Создаём платёж...'; }

    // Создаём платёж в ЮKassa
    (async () => {
      try {
        const res = await fetch('https://sever-18.ru/api/payment-create.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: finalTotalCost, email: user.email }),
        });
        const data = await res.json();

        if (data.paymentUrl && data.paymentId) {
          const updated = { ...pendingOrder, transactionId: data.paymentId };
          sessionStorage.setItem('pending_order', JSON.stringify(updated));
          setUploadedFiles([]);
          setNotes('');
          setBinding('none');
          setAppliedPromo(null);
          setPromoCode('');
          setPromoError(null);
          setSelectedService(null);
          setActiveTab('orders');
          window.location.href = data.paymentUrl;
        } else {
          // ЮKassa недоступна — сохраняем заказ и показываем модалку
          await setDoc(doc(db, 'orders', orderId), pendingOrder);
          onUpdateDatabase({ orders: [newOrder, ...database.orders], users: updatedUsers });
          setUploadedFiles([]);
          setNotes('');
          setBinding('none');
          setAppliedPromo(null);
          setPromoCode('');
          setPromoError(null);
          setActiveTab('orders');
          setPayingOrder(newOrder);
        }
      } catch (err) {
        console.error('Payment error:', err);
        setUploadError('Ошибка создания платежа. Попробуйте ещё раз.');
        if (btn) { btn.disabled = false; btn.textContent = 'Оформить заказ'; }
      }
    })();

    // Play a gentle confirm alert sound
    playPlaceOrderSound();
  };

  const handleApplyPromo = () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    if (
      code === 'PROMO10' || 
      code === 'STUDENT15' || 
      code === 'WELCOME5' ||
      code === 'FIRSTFREE' ||
      code === 'COPYMAX' ||
      (user.promoCode && code === user.promoCode.trim().toUpperCase()) ||
      code.match(/^GIFT\d+$/)
    ) {
      setAppliedPromo(code);
      setPromoError(null);
      playPlaceOrderSound();
    } else {
      setPromoError('Неверный или истекший промокод');
      setAppliedPromo(null);
    }
  };

  const handleDismissPromoGift = (andApply: boolean = false) => {
    setShowPromoGiftModal(false);
    
    // Copy to clipboard
    if (user.promoCode) {
      navigator.clipboard.writeText(user.promoCode).catch(() => {});
      if (andApply) {
        setPromoCode(user.promoCode);
        setAppliedPromo(user.promoCode);
        setPromoError(null);
        playPlaceOrderSound();
      }
    }

    const updatedUsers = database.users.map(u => {
      if (u.id === user.id) {
        return {
          ...u,
          promoGiftedSeen: true
        };
      }
      return u;
    });
    onUpdateDatabase({ users: updatedUsers });
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCode('');
    setPromoError(null);
  };

  // Simulated Payment Systems Checkout Processor
  const processSecurePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingOrder) return;

    setIsProcessingPayment(true);

    setTimeout(() => {
      // Transition out
      setIsProcessingPayment(false);
      setPaymentCompleted(true);
      setConfettiActive(true);
      setTimeout(() => setConfettiActive(false), 5000);

      setTimeout(() => {
        // Play payment success chime
        playOrderSuccessSound();
        
        // Complete the order state update in db
        const txnId = 'TXN-' + Math.floor(100000000 + Math.random() * 900000000);
        const isOnReceipt = paymentMethod === 'on_receipt';
        
        const updatedOrders = database.orders.map(ord => {
          if (ord.id === payingOrder.id) {
            return {
              ...ord,
              paymentStatus: (isOnReceipt ? 'unpaid' : 'paid') as PaymentStatus,
              paymentMethod: paymentMethod === 'card' 
                ? 'Банковская карта' 
                : paymentMethod === 'sbp' 
                ? 'СБП (Система быстрых платежей)' 
                : paymentMethod === 'qr' 
                ? 'Оплата по QR-коду' 
                : 'При получении (Наличные/Карта)',
              transactionId: isOnReceipt ? undefined : txnId,
              status: 'approved' as const // change pending to approved after payment or on_receipt confirmation
            };
          }
          return ord;
        });

        // Push print notifications
        const successNotif: Notification = {
          id: 'pay_' + Date.now(),
          userId: user.id,
          title: isOnReceipt ? 'Заказ подтвержден!' : 'Оплата получена!',
          body: isOnReceipt 
            ? `Заказ ${payingOrder.id} принят к печати. Оплата ₽${payingOrder.totalCost} производится при получении в филиале.`
            : `Заказ ${payingOrder.id} успешно оплачен на сумму ₽${payingOrder.totalCost}. Копии отправлены на ПК для печати.`,
          timestamp: new Date().toISOString(),
          read: false,
          type: 'payment'
        };

        onUpdateDatabase({
          orders: updatedOrders,
          notifications: [successNotif, ...database.notifications]
        });

        // Close modal
        setPayingOrder(null);
        setPaymentCompleted(false);
        setCardNumber('');
        setCardExpiry('');
        setCardCvv('');

      }, 1500);

    }, 2000);
  };

  // Client side message sending
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const newMsg: ChatMessage = {
      id: 'c_' + Date.now(),
      userId: user.id,
      senderId: user.id,
      senderRole: 'client',
      senderName: user.fullName,
      message: chatInput.trim(),
      timestamp: new Date().toISOString(),
      readByAdmin: false,
      readByClient: true
    };

    onUpdateDatabase({
      chatMessages: [...database.chatMessages, newMsg]
    });

    setChatInput('');
  };

  // Отправка стикера клиентом — уходит сразу же по клику
  const handleSendSticker = (sticker: { src: string; label: string }) => {
    const fullUrl = window.location.origin + sticker.src;
    const newMsg: ChatMessage = {
      id: 'c_sticker_' + Date.now(),
      userId: user.id,
      senderId: user.id,
      senderRole: 'client',
      senderName: user.fullName,
      message: '[STICKER]:' + fullUrl,
      timestamp: new Date().toISOString(),
      readByAdmin: false,
      readByClient: true
    };

    onUpdateDatabase({
      chatMessages: [...database.chatMessages, newMsg]
    });
  };

  const handleRequestPushPermission = () => {
    if ('Notification' in window) {
      window.Notification.requestPermission().then(status => {
        setPushConsent(status);
        localStorage.setItem('print_shop_push_consent', status);
      });
    } else {
      setPushConsent('denied');
    }
  };

  // Clean Account Delete
  const handleDeleteSelf = () => {
    setShowSelfDeleteModal(true);
  };

  const confirmDeleteSelf = async () => {
    setIsDeletingSelf(true);
    setSelfDeleteError(null);
    try {
      await onDeleteAccount(user.id);
    } catch (err) {
      console.error('Failed to self delete account:', err);
      setSelfDeleteError('Не удалось удалить личный кабинет. Пожалуйста, проверьте интернет-соединение и попробуйте еще раз.');
      setIsDeletingSelf(false);
    }
  };

  return (
    <div id="client-dashboard-root" className="liquid-glass-bg min-h-screen md:h-screen text-slate-800 dark:text-slate-100 flex flex-col md:flex-row transition-colors duration-300 relative overflow-x-hidden overflow-y-auto md:overflow-hidden">
      
      {/* Neutral frosted glow accents (no color tint) */}
      

      {/* Floating 3D Frosted Glass Orbs mirroring the uploaded design */}
      <div className="glass-bg-orb w-[200px] h-[200px] top-[15%] left-[10%] opacity-65 animate-[float-slow_24s_infinite_ease-in-out]" style={{ backdropFilter: 'blur(15px) saturate(120%)' }} />
      <div className="glass-bg-orb w-[250px] h-[250px] bottom-[25%] right-[12%] opacity-80 animate-[float-reverse_28s_infinite_ease-in-out]" style={{ backdropFilter: 'blur(20px) saturate(130%)' }} />
      <div className="glass-bg-orb w-[150px] h-[150px] top-[65%] left-[-2%] opacity-60 animate-[float-slow_30s_infinite_ease-in-out]" style={{ backdropFilter: 'blur(12px) saturate(110%)' }} />
      <div className="glass-bg-orb w-[110px] h-[110px] top-[35%] right-[22%] opacity-50 animate-[float-reverse_26s_infinite_ease-in-out]" style={{ backdropFilter: 'blur(10px) saturate(100%)' }} />

      {/* Visual In-App Toast Indicator */}
      {showInAppPush && (
        <div className="fixed top-5 right-5 z-55 max-w-sm bg-blue-600 text-white p-4 rounded-xl shadow-2xl flex items-start gap-3 border border-blue-500 animate-bounce">
          <Bell className="w-5 h-5 shrink-0 text-white animate-pulse mt-0.5 unicode-3d-svg" />
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider">УВЕДОМЛЕНИЕ О ЗАКАЗЕ</h4>
            <p className="text-xs text-blue-100 whitespace-pre-line mt-1">{showInAppPush}</p>
          </div>
        </div>
      )}

      {/* LEFT NAVIGATION COLUMN - Responsive Responsive Sidebar */}
      <aside className="w-full md:w-64 shrink-0 flex flex-row md:flex-col justify-between p-3 md:py-6 md:px-4 transition-colors relative z-10" style={{background:"rgba(255,255,255,0.06)",backdropFilter:"blur(40px)",borderRight:"1px solid rgba(255,255,255,0.1)",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
        
        {/* Brand / Mini Logo */}
        <div className="hidden md:flex items-center gap-3 mb-8">
          <img src={logoImg} alt="Фото-Север" className="w-10 h-10 shrink-0 object-contain drop-shadow-lg" />
          <div>
            <h2 className="text-md font-bold tracking-tight text-white leading-tight">Фото-Север</h2>
            <span className="text-[10px] uppercase font-bold tracking-widest text-white/60">Северное шоссе, 18</span>
          </div>
        </div>

        {/* Sync Indicator */}
        <div className="hidden md:flex items-center gap-2 mb-6 px-3 py-2 bg-slate-900/40 dark:bg-black/30 border border-slate-800 dark:border-slate-850 rounded-xl text-[11px] text-[#cbd5e1]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400 icon-3d-svg" />
          <span className="font-medium">Синхронизация данных</span>
        </div>

        {/* Nav Links */}
        <nav className="flex md:flex-col flex-1 gap-1 md:gap-1 justify-around md:justify-start w-full relative">
          <button
            onClick={() => setActiveTab('upload')}
            className={`relative flex items-center gap-2 md:gap-3 px-3 py-2.5 md:py-3 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start flex-1 md:flex-initial cursor-pointer ${
              activeTab === 'upload' 
                ? 'font-black' 
                : 'hover:text-white'
            }`}
            style={{
              color: activeTab === 'upload' ? '#e8f000' : 'rgba(255,255,255,0.55)',
            }}
          >
            {activeTab === 'upload' && (
              <motion.div 
                layoutId="active-sidebar-pill"
                className="absolute inset-0 rounded-2xl -z-10 nav-holo-pill" style={{background:"rgba(255,255,255,0.14)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.25)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.15)"}}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div className={`glass-icon-capsule capsule-glow-purple shrink-0 ${activeTab === 'upload' ? 'scale-105' : 'opacity-90'}`}>
              <Upload className="w-4.5 h-4.5 text-white icon-3d-svg" />
            </div>
            <span className="hidden sm:inline z-10">Загрузка и Заказ</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`relative flex items-center gap-2 md:gap-3 px-3 py-2.5 md:py-3 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start flex-1 md:flex-initial cursor-pointer ${
              activeTab === 'orders' 
                ? 'font-black' 
                : 'hover:text-white'
            }`}
            style={{
              color: activeTab === 'orders' ? '#e8f000' : 'rgba(255,255,255,0.55)',
            }}
          >
            {activeTab === 'orders' && (
              <motion.div 
                layoutId="active-sidebar-pill"
                className="absolute inset-0 rounded-2xl -z-10 nav-holo-pill" style={{background:"rgba(255,255,255,0.14)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.25)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.15)"}}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div className={`glass-icon-capsule capsule-glow-indigo shrink-0 relative ${activeTab === 'orders' ? 'scale-105' : 'opacity-90'}`}>
              <Clock className="w-4.5 h-4.5 text-white icon-3d-svg" />
              {userOrders.filter(o => o.status !== 'printed').length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#ef4444] z-10 animate-ping border border-white" />
              )}
            </div>
            <span className="hidden sm:inline z-10">Мои Заказы</span>
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`relative flex items-center gap-2 md:gap-3 px-3 py-2.5 md:py-3 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start flex-1 md:flex-initial cursor-pointer ${
              activeTab === 'chat' 
                ? 'font-black' 
                : 'hover:text-white'
            }`}
            style={{
              color: activeTab === 'chat' ? '#e8f000' : 'rgba(255,255,255,0.55)',
            }}
          >
            {activeTab === 'chat' && (
              <motion.div 
                layoutId="active-sidebar-pill"
                className="absolute inset-0 rounded-2xl -z-10 nav-holo-pill" style={{background:"rgba(255,255,255,0.14)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.25)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.15)"}}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div className={`glass-icon-capsule capsule-glow-green shrink-0 relative ${activeTab === 'chat' ? 'scale-105' : 'opacity-90'}`}>
              <MessageSquare className="w-4.5 h-4.5 text-white icon-3d-svg" />
              {unreadChatsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center z-10 animate-bounce border border-white shadow-md">
                  {unreadChatsCount}
                </span>
              )}
            </div>
            <span className="hidden sm:inline z-10">Чат с печатником</span>
          </button>

          <button
            onClick={() => { setActiveTab('profile'); handleMarkNotificationsRead(); }}
            className={`relative flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start flex-1 md:flex-initial cursor-pointer ${
              activeTab === 'profile' 
                ? 'text-white font-black' 
                : 'text-[#cbd5e1] hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            {activeTab === 'profile' && (
              <motion.div 
                layoutId="active-sidebar-pill"
                className="absolute inset-0 rounded-2xl -z-10 nav-holo-pill" style={{background:"rgba(255,255,255,0.14)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.25)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.15)"}}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div className={`glass-icon-capsule capsule-glow-rainbow shrink-0 relative ${activeTab === 'profile' ? 'scale-105' : 'opacity-90'}`}>
              <UserCheck className="w-4.5 h-4.5 text-white icon-3d-svg" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center z-10 border border-white shadow-md">
                  {unreadNotificationsCount}
                </span>
              )}
            </div>
            <span className="hidden sm:inline z-10">Кабинет & Инфо</span>
          </button>

          <button
            onClick={() => setActiveTab('contacts')}
            className={`relative flex items-center gap-2 md:gap-3 px-3 py-2.5 md:py-3 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start flex-1 md:flex-initial cursor-pointer ${
              activeTab === 'contacts' 
                ? 'font-black' 
                : 'hover:text-white'
            }`}
            style={{
              color: activeTab === 'contacts' ? '#e8f000' : 'rgba(255,255,255,0.55)',
            }}
          >
            {activeTab === 'contacts' && (
              <motion.div 
                layoutId="active-sidebar-pill"
                className="absolute inset-0 rounded-2xl -z-10 nav-holo-pill" style={{background:"rgba(255,255,255,0.14)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.25)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.15)"}}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div className={`glass-icon-capsule capsule-glow-cyan shrink-0 ${activeTab === 'contacts' ? 'scale-105' : 'opacity-90'}`}>
              <Phone className="w-4.5 h-4.5 text-white icon-3d-svg" />
            </div>
            <span className="hidden sm:inline z-10">Контакты</span>
          </button>

          <button
            onClick={() => setActiveTab('services')}
            className={`relative flex items-center gap-1.5 md:gap-3 px-3 py-2 md:py-2.5 text-xs sm:text-sm font-semibold rounded-2xl transition-all duration-200 justify-center md:justify-start flex-1 md:flex-initial cursor-pointer ${
              activeTab === 'services'
                ? 'text-white font-black'
                : 'text-[#cbd5e1] hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            {activeTab === 'services' && (
              <motion.div
                layoutId="active-sidebar-pill"
                className="absolute inset-0 rounded-2xl -z-10 nav-holo-pill" style={{background:"rgba(255,255,255,0.14)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.25)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.15)"}}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div className={`glass-icon-capsule capsule-glow-orange shrink-0 ${activeTab === 'services' ? 'scale-105' : 'opacity-90'}`}>
              <Printer className="w-4.5 h-4.5 text-white icon-3d-svg" />
            </div>
            <span className="hidden sm:inline z-10">Услуги</span>
          </button>


        </nav>

        {/* Short info bottom */}
        <div className="hidden md:block border-t border-slate-850 pt-5 mt-auto">
          <div className="flex items-center gap-3">
            <UserAvatar
              user={user}
              className="w-10 h-10 rounded-xl ring-2 ring-indigo-500/20 shrink-0"
            />
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user.fullName}</p>
              <p className="text-[10px] text-[#cbd5e1] truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-rose-450 hover:text-white hover:bg-rose-600 rounded-xl transition-all border border-rose-900/40 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Выйти из кабинета
          </button>
          <div className="flex justify-center gap-2.5 mt-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-800/50 pt-2.5">
            <button onClick={() => setActiveLegalDoc('privacy')} className="hover:text-indigo-400 cursor-pointer transition-colors">Политика</button>
            <span>&bull;</span>
            <button onClick={() => setActiveLegalDoc('terms')} className="hover:text-indigo-400 cursor-pointer transition-colors">Оферта</button>
            <span>&bull;</span>
            <button onClick={() => setActiveLegalDoc('delivery')} className="hover:text-indigo-400 cursor-pointer transition-colors">Возврат</button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50/40 dark:bg-slate-950/50 backdrop-blur-md relative z-10">
        
        {/* Top bar on small / medium devices for header */}
        <header id="dashboard-header" className="md:hidden flex items-center justify-between px-4 py-3 glass-panel">
          <div className="flex items-center gap-2">
            {activeTab !== 'upload' ? (
              <button
                onClick={() => setActiveTab('upload')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Назад
              </button>
            ) : (
              <>
                <div className="squircle-3d-tile tile-3d-orange w-8 h-8 shrink-0 shadow-sm">
                  <FileText className="w-4 h-4 text-white icon-3d-svg" />
                </div>
                <h1 className="text-sm font-black text-slate-900 dark:text-white leading-none font-bold">Фото-Север</h1>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={onLogout}
              className="p-1 px-2.5 bg-rose-50 border border-rose-200 dark:border-rose-950/40 text-rose-600 text-xs rounded-xl font-bold dark:bg-rose-950/20"
            >
              Выйти
            </button>
          </div>
        </header>

        <header className="hidden md:flex items-center justify-between px-8 py-5 glass-panel">
          <div className="flex items-center gap-4">
            {activeTab !== 'upload' && (
              <button
                onClick={() => setActiveTab('upload')}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-slate-700 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer shrink-0 border border-slate-200/40 dark:border-slate-800"
              >
                <ArrowLeft className="w-4 h-4" />
                Вернуться назад
              </button>
            )}
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                {activeTab === 'upload' && 'Загрузка документов для печати'}
                {activeTab === 'orders' && 'Статус печати в реальном времени'}
                {activeTab === 'chat' && 'Диалог с оператором типографии'}
                {activeTab === 'profile' && 'Личный кабинет и безопасность'}
                {activeTab === 'contacts' && 'Контакты студии'}
                {activeTab === 'services' && 'Наши услуги'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {activeTab === 'upload' && 'Загружайте любые форматы файлов и отправляйте нам'}
                {activeTab === 'orders' && 'Выгрузка актов, проведение защищенных интернет-транзакций, отслеживание выполнения заказа'}
                {activeTab === 'chat' && 'Моментальная обратная связь, согласование правок, уведомление об изменениях'}
                {activeTab === 'profile' && 'Управление учетными записями, очистка кеша, социальные связи'}
                {activeTab === 'contacts' && 'Мы всегда на связи — звоните или пишите'}
                {activeTab === 'services' && 'Печать документов, фотографий, чертежей — всё на Северном шоссе, 18'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Native system notification requester */}
            {pushConsent === 'default' && (
              <button
                onClick={handleRequestPushPermission}
                className="flex items-center justify-center w-9 h-9 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl transition-all"
                title="Включить уведомления о статусе заказа"
              >
                <Bell className="w-4 h-4" />
              </button>
            )}
            {pushConsent === 'granted' && (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-bold">
                <Check className="w-3.5 h-3.5" /> Push включены
              </span>
            )}
            
            <ThemeToggle />
            <div className="text-indigo-600 dark:text-white bg-slate-100 dark:bg-slate-800 rounded-xl w-9 h-9 flex items-center justify-center font-bold text-sm">
              {user.fullName[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* WORKSPACE SECTIONS */}
        <div className="flex-1 p-4 md:p-8 space-y-6 max-w-6xl w-full mx-auto min-h-0 flex flex-col md:overflow-hidden">
          {user.promoCode && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-3xl p-5 border border-emerald-500/30 shadow-lg shadow-emerald-500/10 cursor-pointer relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-300 animate-pulse-slow"
              onClick={() => setShowPromoGiftModal(true)}
            >
              {/* background decorative shapes */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>
              
              <div className="flex items-center gap-4 relative z-10">
                <div className="p-3 bg-white/10 dark:bg-slate-900/40 rounded-2xl border border-white/20 text-white shrink-0 animate-bounce">
                  <Gift className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider">У Вас есть персональный подарок! 🎁</h4>
                  <p className="text-xs text-white/80 mt-1 font-medium select-none">
                    Администратор подарил Вам новогодний промокод со скидкой <strong className="text-white text-sm">-{user.promoDiscount}%</strong>! Нажмите, чтобы открыть праздничную открытку со своим подарком.
                  </p>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPromoGiftModal(true);
                }}
                className="px-5 py-2.5 bg-white hover:bg-slate-50 text-emerald-700 font-black text-xs rounded-xl shadow-md transition shrink-0 relative z-10 cursor-pointer"
              >
                Открыть подарок 🎁
              </button>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {/* TAB 1: FILE UPLOADER & PROPERTIES */}
            {activeTab === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full md:overflow-y-auto md:flex-1 min-h-0 pr-1"
              >
                
                {/* Interactive Step Timeline Indicator */}
                <div className="lg:col-span-12 glass-panel rounded-3xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 md:px-8 relative overflow-hidden">
                  {/* Decorative faint background glowing pattern */}
                  <div className="absolute top-0 right-0 w-44 h-44 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
                  
                  <div className="flex items-center gap-3.5 z-10">
                    <div className={`w-9 h-9 rounded-2xl font-black text-xs flex items-center justify-center border transition-all duration-300 ${
                      uploadedFiles.length > 0
                        ? 'bg-emerald-500 text-white border-emerald-555'
                        : 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/10'
                    }`}>
                      {uploadedFiles.length > 0 ? <Check className="w-4 h-4" /> : '1'}
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-1.5">
                        Шаг 1. Загрузка
                        {uploadedFiles.length > 0 && <span className="text-[9px] text-emerald-500 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-md">ГОТОВО</span>}
                      </h4>
                      <p className="text-[10px] text-slate-400 dark:text-slate-450 mt-0.5 font-bold">PDF, Скан-копии, Фото</p>
                    </div>
                  </div>

                  <div className="hidden md:block flex-1 h-[2px] border-t-2 border-dashed border-slate-200 dark:border-slate-800 mx-4" />

                  <div className="flex items-center gap-3.5 z-10">
                    <div className={`w-9 h-9 rounded-2xl font-black text-xs flex items-center justify-center border transition-all duration-300 ${
                      uploadedFiles.length > 0
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/10 animate-pulse'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-400 border-slate-150 dark:border-slate-850'
                    }`}>
                      2
                    </div>
                    <div>
                      <h4 className={`text-[11px] font-black uppercase tracking-wider ${
                        uploadedFiles.length > 0 ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-600'
                      }`}>Шаг 2. Опции печати</h4>
                      <p className="text-[10px] text-slate-400 dark:text-slate-450 mt-0.5 font-bold">Бумага, Цвет, Переплет</p>
                    </div>
                  </div>

                  <div className="hidden md:block flex-1 h-[2px] border-t-2 border-dashed border-slate-200 dark:border-slate-800 mx-4" />

                  <div className="flex items-center gap-3.5 z-10">
                    <div className={`w-9 h-9 rounded-2xl font-black text-xs flex items-center justify-center border transition-all duration-300 ${
                      uploadedFiles.length > 0
                        ? 'bg-gradient-to-br from-indigo-500 to-indigo-755 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-400 border-slate-150 dark:border-slate-850'
                    }`}>
                      3
                    </div>
                    <div>
                      <h4 className={`text-[11px] font-black uppercase tracking-wider ${
                        uploadedFiles.length > 0 ? 'text-slate-800 dark:text-white flex items-center gap-1' : 'text-slate-400 dark:text-slate-600'
                      }`}>
                        Шаг 3. Итог & Чек
                      </h4>
                      <p className="text-[10px] text-slate-400 dark:text-slate-450 mt-0.5 font-bold">Быстрая оплата онлайн</p>
                    </div>
                  </div>
                </div>
              
              {/* Uploader Card */}
              <div className="lg:col-span-7 glass-cozy-card p-6 md:p-8 rounded-[32px] space-y-6">
                <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-3">
                  <div className="icon-3d-badge p-2 bg-indigo-50 dark:bg-indigo-950/40">
                    <Upload className="w-4 h-4 text-indigo-600 icon-3d-svg" />
                  </div>
                  <span>Шаг 1. Перетащите файлы</span>
                </h3>

                {!isWorkingHours() && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 p-5 rounded-2xl border border-rose-150 dark:border-rose-900/30 text-xs flex gap-3 shadow-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 animate-bounce" />
                    <div>
                      <p className="font-extrabold text-sm">Копи-Центр сейчас закрыт!</p>
                      <p className="mt-1 leading-relaxed opacity-90">Мы принимаем файлы и оформляем новые заказы только в рабочие часы:</p>
                      <ul className="mt-1.5 space-y-1 font-extrabold text-[11px]">
                        <li>📅 Понедельник — Пятница: 09:00 — 19:00</li>
                        <li>📅 Суббота — Воскресенье: 10:00 — 19:00</li>
                      </ul>
                      <p className="mt-2.5 text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-450">Приём файлов и заказов временно заблокирован.</p>
                    </div>
                  </div>
                )}

                {uploadError && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 p-4 rounded-2xl border border-rose-200/40 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Drag zone Area */}
                <div
                  onDragEnter={!isWorkingHours() ? undefined : handleDrag}
                  onDragOver={!isWorkingHours() ? undefined : handleDrag}
                  onDragLeave={!isWorkingHours() ? undefined : handleDrag}
                  onDrop={!isWorkingHours() ? undefined : handleDrop}
                  onClick={!isWorkingHours() ? undefined : () => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 md:p-12 text-center transition-all ${
                    !isWorkingHours()
                      ? 'border-rose-250 bg-rose-50/10 dark:bg-rose-950/5 cursor-not-allowed opacity-60'
                      : dragActive 
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 scale-98 cursor-pointer' 
                      : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500/60 dark:hover:border-indigo-500/40 bg-slate-50/50 dark:bg-slate-950/20 cursor-pointer'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                    accept=".zip,.rar,.7z,.doc,.docx,.pdf,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.heic,.heif,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  />
                  
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    !isWorkingHours()
                      ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-505 dark:text-rose-400'
                      : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                  }`}>
                    {!isWorkingHours() ? <Clock className="w-8 h-8 animate-pulse text-rose-600" /> : <Upload className="w-8 h-8" />}
                  </div>
                  
                  <p className={`text-sm font-bold ${!isWorkingHours() ? 'text-rose-650 dark:text-rose-450' : 'text-slate-800 dark:text-white'}`}>
                    {!isWorkingHours() ? 'Прием файлов приостановлен (Центр Закрыт)' : 'Выберите файлы или перетащите их сюда'}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    {!isWorkingHours() 
                      ? 'Мы принимаем файлы только в рабочие часы Пн-Пт 09:00 - 19:00, Сб-Вс 10:00 - 19:00. Приходите к нам завтра!' 
                      : 'Поддерживаются любые типы форматов: архивы (zip, rar), изображения (jpg, png) и документы (pdf, docx, xlsx, txt) до 100 МБ.'
                    }
                  </p>
                </div>

                {/* Uploaded Queue Items */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/40 p-3 rounded-2xl">
                      <span className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                        Список к отправке на печать ({uploadedFiles.length})
                      </span>
                      <button
                        onClick={() => setUploadedFiles([])}
                        className="text-xs text-rose-500 hover:text-rose-605 font-bold cursor-pointer"
                      >
                        Очистить всё
                      </button>
                    </div>

                    <div className="space-y-3 pr-1">
                      {uploadedFiles.map(file => {
                        const isPhoto = file.paperType === 'photo';
                        const updateFile = (updates: Partial<typeof file>) => {
                          setUploadedFiles(prev => prev.map(f => f.id === file.id ? { ...f, ...updates } : f));
                        };
                        const photoSizes = [
                          { key: '10x15', label: '10×15', sub: 'стандарт', price: 20 },
                          { key: 'polaroid', label: 'Полароид', sub: 'квадрат', price: 30 },
                          { key: '13x18', label: '13×18', sub: 'средний', price: 50 },
                          { key: '15x21', label: '15×21', sub: 'большой', price: 70 },
                          { key: '20x30', label: '20×30', sub: 'постер', price: 100 },
                          { key: '30x40', label: '30×40', sub: 'большой постер', price: 250 },
                        ] as const;
                        const selSize = photoSizes.find(s => s.key === (file.photoSize || '10x15')) || photoSizes[0];
                        const copies = file.fileCopies || 1;
                        const pages = file.pageCount || 1;
                        const fillPct = file.colorFillPercent ?? 50;
                        const isA3 = file.format === 'a3';
                        const filePP = isPhoto ? selSize.price
                          : (file.printColor === 'bw'
                            ? (isA3 ? 100 : 20)
                            : (isA3 ? 150 : colorFillPrice(fillPct)));
                        const fileCost = filePP * (isPhoto ? 1 : pages) * copies;

                        return (
                          <div key={file.id} className="glass-panel rounded-2xl overflow-hidden">
                            {/* Строка файла */}
                            <div className="flex items-center gap-3 p-3.5">
                              <div className="p-2.5 glass-icon-capsule glass-icon-indigo shrink-0">
                                <FileType className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white truncate">{file.name}</p>
                                <span className="text-[10px] text-white/40 block mt-0.5">
                                  {formatFileSize(file.size)} · {file.formatGroup.toUpperCase()}
                                  {file.pageCount !== undefined ? ` · ${file.pageCount} стр.` : ' · сканирование...'}
                                  {file.url ? ' · ✓ Загружено' : ' · Загрузка...'}
                                  {file.colorFillPercent !== undefined && (file.printColor || 'bw') !== 'bw' && !isPhoto && (
                                    <span className="text-amber-400 font-black ml-1"> · 🎨 {colorFillLabel(file.colorFillPercent)} ({file.colorFillPercent}%)</span>
                                  )}
                                  {file.previewUrl && <span onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }} className="text-indigo-400 font-black ml-1.5 cursor-pointer hover:underline">· 👁 Предпросмотр</span>}
                                </span>
                              </div>
                              <button type="button" onClick={() => removeUploadedFile(file.id)}
                                className="p-1.5 text-white/25 hover:text-rose-400 transition-colors cursor-pointer shrink-0">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Настройки печати */}
                            <div className="border-t border-white/8 p-3.5 space-y-3">
                              <div className="grid grid-cols-2 gap-2.5">
                                {/* Цветность */}
                                <div>
                                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1.5">Цветность</p>
                                  <div className="flex gap-1.5">
                                    {(['bw','color'] as const).map(v => {
                                      const isPhoto = file.paperType === 'photo';
                                      const isDisabled = v === 'bw' && isPhoto;
                                      return (
                                        <button key={v}
                                          onClick={() => {
                                            if (isDisabled) return;
                                            updateFile({ printColor: v });
                                          }}
                                          disabled={isDisabled}
                                          title={isDisabled ? 'Для фотобумаги доступна только цветная печать' : ''}
                                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                                            isDisabled
                                              ? 'bg-white/3 border-white/8 text-white/20 cursor-not-allowed opacity-40'
                                              : (file.printColor || 'bw') === v
                                              ? 'option-pill-active cursor-pointer'
                                              : 'option-pill-inactive cursor-pointer'
                                          }`}>
                                          {v === 'bw' ? 'Ч/Б' : 'Цвет'}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                {/* Бумага */}
                                <div>
                                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1.5">Бумага</p>
                                  <div className="flex gap-1.5">
                                    {(['plain','photo'] as const).map(v => (
                                      <button key={v} onClick={() => updateFile({ 
                                        paperType: v, 
                                        photoSize: v === 'photo' ? (file.photoSize || '10x15') : undefined,
                                        printColor: v === 'photo' ? 'color' : file.printColor, // фото = только цвет
                                      })}
                                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                                          (file.paperType || 'plain') === v
                                            ? 'option-pill-active'
                                            : 'option-pill-inactive'}`}>
                                        {v === 'plain' ? 'Обычная' : 'Фото 🖼'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {/* Формат — только для обычной бумаги */}
                                {!isPhoto && (
                                  <div>
                                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1.5">Формат</p>
                                    <div className="flex gap-1.5">
                                      {(['a4','a3'] as const).map(v => (
                                        <button key={v} onClick={() => updateFile({ format: v })}
                                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                                            (file.format || 'a4') === v
                                              ? 'option-pill-active'
                                              : 'option-pill-inactive'}`}>
                                          {v.toUpperCase()}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Копии */}
                                <div>
                                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1.5">Копий</p>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => updateFile({ fileCopies: Math.max(1, copies - 1) })}
                                      className="w-6 h-6 rounded-lg bg-white/8 border border-white/15 text-white text-sm font-black cursor-pointer hover:bg-white/18 flex items-center justify-center">−</button>
                                    <span className="text-sm font-black text-white min-w-[18px] text-center">{copies}</span>
                                    <button onClick={() => updateFile({ fileCopies: copies + 1 })}
                                      className="w-6 h-6 rounded-lg bg-white/8 border border-white/15 text-white text-sm font-black cursor-pointer hover:bg-white/18 flex items-center justify-center">+</button>
                                  </div>
                                </div>
                              </div>

                              {/* Блок размеров фото */}
                              {isPhoto && (
                                <div className="pt-2 border-t border-white/8 space-y-2.5">
                                  <p className="text-[9px] font-black text-rose-400/90 uppercase tracking-widest">📸 Размер фотографии</p>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {photoSizes.map(s => (
                                      <button key={s.key} onClick={() => updateFile({ photoSize: s.key })}
                                        className={`photo-size-pill ${
                                          (file.photoSize || '10x15') === s.key
                                            ? 'photo-size-pill-active'
                                            : 'photo-size-pill-inactive'}`}>
                                        <div className="text-xs font-black">{s.label}</div>
                                        <div className="text-[9px] opacity-60 mt-0.5">{s.sub}</div>
                                        <div className={`text-[10px] font-black mt-1 ${(file.photoSize || '10x15') === s.key ? 'photo-size-price-active' : 'opacity-50'}`}>{s.price} ₽</div>
                                      </button>
                                    ))}
                                  </div>
                                  {/* Поверхность */}
                                  <div>
                                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1.5">Поверхность</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {([['glossy','✨','Глянцевая','Яркие насыщенные цвета'],['matte','🔲','Матовая','Без отпечатков пальцев']] as const).map(([v,icon,name,desc]) => (
                                        <button key={v} onClick={() => updateFile({ photoFinish: v })}
                                          className={`surface-pill ${
                                            (file.photoFinish || 'glossy') === v
                                              ? 'surface-pill-active'
                                              : 'surface-pill-inactive'}`}>
                                          <div className="text-lg">{icon}</div>
                                          <div className="text-[11px] font-black mt-1">{name}</div>
                                          <div className="text-[9px] text-white/38 mt-0.5">{desc}</div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Стоимость файла */}
                            <div className="px-3.5 pb-3 flex justify-between items-center text-[10px] text-white/40">
                              <span>{isPhoto ? `${selSize.label} × ${selSize.price} ₽ × ${copies} шт.` : `${pages} стр. × ${filePP} ₽ × ${copies} шт.`}</span>
                              <strong className="text-white text-sm">{fileCost} ₽</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* INTERACTIVE PRINT MOCKUP PREVIEW VISUALIZER */}
                {uploadedFiles.length > 0 && (
                  <div className="pt-5 border-t border-slate-100 dark:border-slate-850 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        <span>Интерактивный 3D-макет партии</span>
                      </h4>
                      <span className="text-[10px] font-bold text-slate-405 dark:text-slate-550 italic">
                        Обновляется в реальном времени
                      </span>
                    </div>

                    <div 
                      onClick={() => setShow3DMockupModal(true)}
                      className="relative w-full aspect-video bg-gradient-to-br from-slate-150 to-slate-200 dark:from-slate-950 dark:to-slate-900 rounded-3xl border border-slate-200 dark:border-slate-850 p-6 flex items-center justify-center overflow-hidden shadow-inner cursor-pointer group hover:border-indigo-500/50 hover:shadow-indigo-500/5 transition-all duration-305"
                      title="Нажмите для подробного 3D-осмотра макета партии"
                    >
                      {/* Grid representation */}
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:16px_16px] opacity-25" />

                      {/* Explicit Interactive Focus Overlay */}
                      <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/15 dark:group-hover:bg-slate-950/30 flex items-center justify-center transition-all duration-300 z-30">
                        <div className="bg-white/95 dark:bg-slate-900/95 text-[11px] font-black text-indigo-600 dark:text-indigo-400 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transform translate-y-1 group-hover:translate-y-0 transition-all duration-300 border border-slate-200/55 dark:border-slate-800/80">
                          <Maximize2 className="w-3.5 h-3.5 animate-pulse" />
                          <span>Открыть макет во весь экран (ВТЧ в фокусе) 🔍</span>
                        </div>
                      </div>

                      {/* Stack effect loop */}
                      <div className="relative transition-transform duration-300 hover:scale-105 select-none my-6">
                        {Array.from({ length: Math.min(6, copies) }).map((_, i) => {
                          const isLast = i === Math.min(6, copies) - 1;
                          const offsetValueX = i * 4;
                          const offsetValueY = i * -4;
                          
                          let paperBg = 'bg-white text-slate-800'; 
                          if (paperType === 'kraft') {
                            paperBg = 'bg-[#eedbc5] dark:bg-[#c6a982] text-amber-955';
                          } else if (paperType === 'glossy') {
                            paperBg = 'bg-slate-50 text-slate-900';
                          } else if (paperType === 'matte') {
                            paperBg = 'bg-[#faf8f5] dark:bg-[#eae6df] text-slate-900';
                          }

                          return (
                            <div
                              key={i}
                              className={`rounded-xl border transition-all duration-300 flex flex-col justify-between p-4.5 shadow-[2px_2px_12px_rgba(0,0,0,0.1)] dark:shadow-[4px_4px_16px_rgba(0,0,0,0.4)] ${paperBg}`}
                              style={{
                                width: paperType === 'standard_a3' || paperType === 'bw_a3' ? '200px' : '170px',
                                height: paperType === 'standard_a3' || paperType === 'bw_a3' ? '280px' : '230px',
                                position: i === 0 ? 'relative' : 'absolute',
                                left: `${offsetValueX}px`,
                                bottom: `${offsetValueY}px`,
                                top: i === 0 ? 'auto' : `calc(0px + ${offsetValueY}px)`,
                                zIndex: i + 1,
                                borderWidth: '1px',
                                borderColor: paperType === 'kraft' ? '#b49265' : 'rgba(148, 163, 184, 0.4)',
                              }}
                            >
                              {/* Glare effect on Glossy paper */}
                              {paperType === 'glossy' && (
                                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 rounded-xl pointer-events-none" />
                              )}

                              {/* Staple simulation */}
                              {binding === 'staple' && isLast && (
                                <div className="absolute top-2.5 left-2.5 w-6 h-1.5 bg-slate-300 dark:bg-slate-400 border border-slate-400/80 -rotate-45 rounded-xs shadow-xs z-10" />
                              )}

                              {/* File sleeve simulation */}
                              {binding === 'file' && isLast && (
                                <div className="absolute inset-0 bg-sky-200/20 dark:bg-sky-400/10 border-2 border-sky-400/40 rounded-xl z-20 pointer-events-none shadow-inner" style={{ backdropFilter: 'blur(1px)' }}>
                                  <div className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full border border-sky-500/20 flex items-center justify-center bg-white/70 shadow-xs text-sky-650 font-bold text-[8px] animate-pulse">
                                    5₽
                                  </div>
                                </div>
                              )}

                              {/* Plastic/Metal Spiral simulation */}
                              {(binding === 'spring_plastic' || binding === 'spring_metal') && isLast && (
                                <div className="absolute top-0 bottom-0 left-1 w-2.5 flex flex-col justify-around items-center z-10">
                                  {Array.from({ length: 12 }).map((_, rIdx) => (
                                    <div 
                                      key={rIdx} 
                                      className={`w-3 h-1.5 rounded-full border ${
                                        binding === 'spring_plastic' 
                                          ? 'bg-slate-900 border-slate-800' 
                                          : 'bg-slate-200 border-slate-350 shadow-xs'
                                      }`} 
                                    />
                                  ))}
                                </div>
                              )}

                              {/* Hard cover simulation */}
                              {binding === 'hard_cover' && isLast && (
                                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 rounded-xl flex flex-col justify-between p-4 shadow-xl text-slate-100 border border-slate-750">
                                  <div className="border border-slate-705 p-1 bg-slate-800/40 rounded-lg text-center text-[9px] font-bold uppercase tracking-widest mt-1.5">
                                    Твердый переплет
                                  </div>
                                  <div className="space-y-1 my-auto">
                                    <div className="h-1 bg-slate-500/30 rounded-full w-3/4 mx-auto" />
                                    <div className="h-1 bg-slate-505/30 rounded-full w-1/2 mx-auto" />
                                  </div>
                                  <div className="text-[8px] text-center text-slate-400 font-mono tracking-wider font-extrabold pb-1">
                                    * ПРЕМИУМ КОРЕШОК *
                                  </div>
                                </div>
                              )}

                              {/* Front cover layout components */}
                              {isLast && binding !== 'hard_cover' && (
                                <div className="w-full h-full flex flex-col justify-between pointer-events-none relative">
                                  {uploadedFiles[0] && (uploadedFiles[0].previewUrl || (uploadedFiles[0].formatGroup === 'image' && uploadedFiles[0].url)) ? (
                                    // True Uploaded Image Preview
                                    <div className="absolute inset-0 p-1 flex flex-col justify-between bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
                                      <div className="w-full h-[82%] relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                                        <img 
                                          src={uploadedFiles[0].previewUrl || uploadedFiles[0].url} 
                                          className="w-full h-full object-cover" 
                                          alt={uploadedFiles[0].name}
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute top-1 right-1 bg-indigo-650/85 text-white text-[6px] font-black tracking-widest px-1 py-0.5 rounded-sm">
                                          ПЕЧАТЬ ИЗОБРАЖЕНИЯ
                                        </div>
                                      </div>
                                      <div className="flex justify-between items-center text-[6px] font-bold text-slate-500 font-mono px-0.5">
                                        <span className="truncate max-w-[110px]">{uploadedFiles[0].name}</span>
                                        <span>{formatFileSize(uploadedFiles[0].size)}</span>
                                      </div>
                                    </div>
                                  ) : uploadedFiles[0] ? (
                                    // Real Uploaded Document Preview Layout
                                    <div className="w-full h-full flex flex-col justify-between">
                                      <div className="flex justify-between items-center text-[7px] font-mono text-indigo-650 dark:text-indigo-400 font-bold uppercase tracking-wider">
                                        <span>{paperType === 'standard_a3' || paperType === 'bw_a3' ? 'A3 FORMAT' : 'A4 FORMAT'}</span>
                                        <span>PDF/DOCX</span>
                                      </div>
                                      
                                      <div className="my-auto py-2.5 flex flex-col items-center justify-center space-y-1 bg-slate-50/70 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-150 dark:border-slate-800">
                                        <FileText className="w-6 h-6 text-indigo-500" />
                                        <span className="text-[7.5px] font-black text-slate-805 dark:text-slate-100 text-center truncate w-full max-w-[130px]">
                                          {uploadedFiles[0].name}
                                        </span>
                                        <span className="text-[6.5px] font-mono text-slate-450 dark:text-slate-500">
                                          {formatFileSize(uploadedFiles[0].size)}
                                        </span>
                                      </div>

                                      <div className="flex justify-between items-end border-t border-slate-250/50 dark:border-slate-800/50 pt-1 text-[6.5px] font-mono text-slate-450">
                                        <span>Тираж: {copies} шт</span>
                                        <span>{paperDensity === 'thick' ? '160г' : '80г'}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    // Fallback standard render
                                    <>
                                      <div className="flex justify-between items-center text-[7px] font-mono text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                                        <span>{paperType === 'standard_a3' || paperType === 'bw_a3' ? 'A3 FORMAT' : 'A4 FORMAT'}</span>
                                        <span>{uploadedFiles.length} doc(s)</span>
                                      </div>

                                      <div className="my-auto py-4 flex flex-col items-center justify-center space-y-1">
                                        {printColor === 'bw' ? (
                                          <div className="w-14 h-14 bg-slate-50 dark:bg-slate-905 rounded-xl border border-slate-200/90 flex flex-col items-center justify-center p-2">
                                            <div className="w-full h-1.5 bg-slate-300 dark:bg-slate-600 rounded-xs mb-1" />
                                            <div className="w-5/6 h-1 bg-slate-300 dark:bg-slate-700 rounded-xs mb-1" />
                                            <div className="w-full h-1 bg-slate-350 dark:bg-slate-700 rounded-sub mb-2" />
                                            <div className="w-8 h-8 rounded-full border-4 border-slate-300 flex items-center justify-center text-[7px] font-black text-slate-405">
                                              Ч/Б
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="w-14 h-14 bg-gradient-to-tr from-amber-400 via-rose-455 to-indigo-500 rounded-xl flex flex-col items-center justify-center p-1.5 text-white shadow-sm ring-1 ring-white/10 animate-pulse">
                                            <div className="w-full h-1 bg-white/40 rounded-xs mb-1" />
                                            <div className="w-5/6 h-0.5 bg-white/20 rounded-xs mb-1" />
                                            <span className="text-[7.5px] font-black uppercase tracking-widest text-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                                              {printColor === 'color_full' ? '100% ЦВЕТ' : 'ЦВЕТНОЙ'}
                                            </span>
                                          </div>
                                        )}

                                        <div className="text-[7.5px] font-semibold text-slate-400 dark:text-slate-500 tracking-wide pt-1">
                                          Приоритет: {paperDensity === 'thick' ? 'Плотный 160г' : 'Обычный 80г'}
                                        </div>
                                      </div>

                                      <div className="flex justify-between items-end border-t border-slate-200/50 dark:border-slate-800/50 pt-1.5">
                                        <div className="text-left leading-none">
                                          <span className="text-[7px] text-slate-400 dark:text-slate-500 block uppercase font-bold tracking-wider">Тираж:</span>
                                          <span className="text-[10px] font-extrabold text-slate-800 dark:text-white leading-none">{copies} шт</span>
                                        </div>
                                        <div className="text-right leading-none">
                                          <span className="text-[7px] text-slate-400 dark:text-slate-500 block uppercase font-bold tracking-wider font-mono">МАТЕРИАЛ</span>
                                          <span className="text-[8px] font-extrabold font-mono text-indigo-650 dark:text-indigo-400 leading-none">
                                            {paperType === 'standard' ? 'ОФИСНЫЙ' : paperType === 'kraft' ? 'КРАФТ' : 'ФОТО'}
                                          </span>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Visual details summary list under mockup wrapper */}
                    <div className="grid grid-cols-2 gap-2 text-[10.5px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/35 p-3 rounded-2xl border border-slate-150/50 dark:border-slate-850/30">
                      <div>
                        <strong>Формат:</strong> {(() => {
                          const isPhoto = uploadedFiles[0]?.paperType === 'photo';
                          if (isPhoto) {
                            const sz = uploadedFiles[0]?.photoSize || '10x15';
                            const labels: Record<string,string> = { '10x15':'10×15 см', 'polaroid':'Polaroid', '13x18':'13×18 см', '15x21':'15×21 см', '20x30':'20×30 см', '30x40':'30×40 см' };
                            return labels[sz] || sz;
                          }
                          return paperType === 'standard_a3' || paperType === 'bw_a3' ? 'А3 (Большой)' : 'А4 (Стандарт)';
                        })()}
                      </div>
                      <div>
                        <strong>Плотность:</strong> {uploadedFiles[0]?.paperType === 'photo' ? '230 г/м² (Фото)' : paperDensity === 'thick' ? '160 г/м² (Плотная)' : '80 г/м² (Стандартная)'}
                      </div>
                      <div>
                        <strong>Покрытие:</strong> {uploadedFiles[0]?.paperType === 'photo' ? 'Фотобумага' : paperType === 'glossy' ? 'Глянцевая' : paperType === 'matte' ? 'Матовая' : paperType === 'kraft' ? 'Крафтовая' : 'Обычное'}
                      </div>
                      <div>
                        <strong>Отделка:</strong> {binding === 'none' ? 'Без скрепления' : binding === 'staple' ? 'Степлер (угол)' : binding === 'file' ? 'Файлик' : binding === 'spring_metal' ? 'Металлическая пружина' : binding === 'spring_plastic' ? 'Пластиковая пружина' : 'Твёрдый переплет'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Printing Properties Form */}
              <div className="lg:col-span-5 glass-cozy-card p-6 md:p-8 rounded-[32px] space-y-6">
                <h3 className="text-lg font-black text-white flex items-center gap-3">
                  <div className="glass-icon-capsule glass-icon-indigo p-2">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <span>Шаг 2. Оформление</span>
                </h3>

                <form onSubmit={handlePlaceOrder} className="space-y-5">

                  {/* Промокод */}
                  <div>
                    <label className="block text-[10px] font-black text-white/50 uppercase tracking-widest mb-2">
                      Промокод
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={e => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="Введите промокод..."
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                      {!appliedPromo ? (
                        <button type="button" onClick={handleApplyPromo}
                          className="px-4 py-2.5 bg-indigo-500/30 hover:bg-indigo-500/50 border border-indigo-400/40 text-indigo-200 font-black text-xs rounded-xl cursor-pointer transition-all">
                          Применить
                        </button>
                      ) : (
                        <button type="button" onClick={handleRemovePromo}
                          className="px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-300 font-black text-xs rounded-xl cursor-pointer transition-all">
                          Сбросить
                        </button>
                      )}
                    </div>
                    {promoError && <p className="text-[10px] text-rose-400 font-bold mt-1.5 animate-pulse">{promoError}</p>}
                    {appliedPromo && <p className="text-[10px] text-emerald-400 font-bold mt-1.5">✓ Скидка применена!</p>}
                  </div>

                  {/* Заметки */}
                  <div>
                    <label className="block text-[10px] font-black text-white/50 uppercase tracking-widest mb-2">
                      Заметки печатнику
                    </label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Например: двухсторонняя, скрепка в углу, первая страница — обложка..."
                      rows={3}
                      className="block w-full p-3.5 rounded-xl bg-white/8 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
                    />
                  </div>

                  {/* Чек */}
                  {uploadedFiles.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest text-center">* РАСЧЁТ СТОИМОСТИ *</p>

                      <div className="space-y-2 text-xs">
                        {/* Список файлов с ценами */}
                        {uploadedFiles.map((f, idx) => {
                          const isPhotoFile = f.paperType === 'photo';
                          const photoSizes = [
                            { key: '10x15', label: '10×15', price: 20 },
                            { key: 'polaroid', label: 'Полароид', price: 30 },
                            { key: '13x18', label: '13×18', price: 50 },
                            { key: '15x21', label: '15×21', price: 70 },
                            { key: '20x30', label: '20×30', price: 100 },
                            { key: '30x40', label: '30×40', price: 250 },
                          ] as const;
                          const selSize = photoSizes.find(s => s.key === (f.photoSize || '10x15')) || photoSizes[0];
                          const fileCopies = f.fileCopies || 1;
                          const pages = f.pageCount || 1;
                          const fillPct = f.colorFillPercent ?? 50;
                          const isA3 = f.format === 'a3';
                          const pp = isPhotoFile ? selSize.price
                            : ((f.printColor || 'bw') === 'bw'
                              ? (isA3 ? 100 : 20)
                              : (isA3 ? 150 : (fillPct <= 20 ? 25 : fillPct <= 60 ? 40 : 65)));
                          const fileCost = pp * (isPhotoFile ? 1 : pages) * fileCopies;
                          return (
                            <div key={f.id} className="flex justify-between items-start gap-2 text-white/70">
                              <span className="truncate max-w-[160px] text-white/60">{idx+1}. {f.name}</span>
                              <span className="font-black text-white shrink-0">{fileCost} ₽</span>
                            </div>
                          );
                        })}

                        <div className="border-t border-white/10 pt-2 mt-1">
                          {/* Итог */}
                          {(() => {
                            const activePromo = getActivePromo();
                            const subtotal = uploadedFiles.reduce((acc, f) => {
                              const isPhotoFile = f.paperType === 'photo';
                              const photoSizes = [
                                { key: '10x15', price: 20 }, { key: 'polaroid', price: 30 },
                                { key: '13x18', price: 50 }, { key: '15x21', price: 70 },
                                { key: '20x30', price: 100 }, { key: '30x40', price: 250 },
                              ] as const;
                              const selSize = (photoSizes as readonly {key: string; price: number}[]).find(s => s.key === (f.photoSize || '10x15')) || photoSizes[0];
                              const fileCopies = f.fileCopies || 1;
                              const pages = f.pageCount || 1;
                              const fillPct = f.colorFillPercent ?? 50;
                              const isA3 = f.format === 'a3';
                              const pp = isPhotoFile ? selSize.price
                                : ((f.printColor || 'bw') === 'bw'
                                  ? (isA3 ? 100 : 20)
                                  : (isA3 ? 150 : (fillPct <= 20 ? 25 : fillPct <= 60 ? 40 : 65)));
                              return acc + pp * (isPhotoFile ? 1 : pages) * fileCopies;
                            }, 0);
                            const discount = activePromo ? getActiveDiscountPercent(activePromo) : 0;
                            const total = Math.round(subtotal * (1 - discount / 100));
                            const savings = subtotal - total;
                            return (
                              <>
                                {savings > 0 && (
                                  <div className="flex justify-between text-rose-400 font-bold text-[11px]">
                                    <span>Промокод ({activePromo}):</span>
                                    <span>−{savings} ₽</span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">Итого:</span>
                                  <span className="text-2xl font-black text-white">₽{total}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Штрихкод */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <div className="flex items-center gap-[1.5px] h-4 opacity-30">
                          {[1,3,1,2,4,1,2,3,1,4,2,1,3,1,2,4,1,3,2,1,4,1,3,1].map((w,i) => (
                            <div key={i} className="bg-white h-full" style={{width:`${w*0.75}px`}}/>
                          ))}
                        </div>
                        <span className="text-[8px] font-mono tracking-widest text-white/25">* ORD-{1000 + database.orders.length + 1} *</span>
                      </div>
                    </div>
                  )}

                  {/* Кнопка заказа */}
                  {/* Показываем выбранную услугу если есть */}
                  {selectedService && (
                    <div className="flex items-center justify-between p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🛍</span>
                        <div>
                          <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest">Услуга</p>
                          <p className="text-white font-bold text-xs">{selectedService.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-black text-sm">+{selectedService.price} ₽</span>
                        <button onClick={() => { setSelectedService(null); setNotes(''); }} className="text-white/30 hover:text-white/60 text-xs cursor-pointer">✕</button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={uploadedFiles.length === 0 || !isWorkingHours() || uploadedFiles.some(f => !f.url)}
                    className={`w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl font-black text-sm text-white transition-all ${
                      uploadedFiles.length > 0 && isWorkingHours() && !uploadedFiles.some(f => !f.url)
                        ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                        : 'bg-white/10 text-white/30 cursor-not-allowed'
                    }`}
                  >
                    <FileCheck className="w-5 h-5" />
                    {!isWorkingHours()
                      ? 'Оформление временно недоступно'
                      : uploadedFiles.some(f => !f.url)
                        ? 'Загрузка файлов...'
                        : 'Оформить заказ'}
                  </button>
                  {uploadedFiles.length === 0 && (
                    <p className="text-center text-[11px] text-white/30 mt-2">
                      ↑ Сначала загрузите файл на шаге 1
                    </p>
                  )}
                </form>
              </div>

              </motion.div>
            )}

            {/* TAB 2: ACTIVE AND HISTORIC ORDERS */}
            {activeTab === 'orders' && (
              <motion.div
                key="orders"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="space-y-6 w-full md:overflow-y-auto md:flex-1 min-h-0 pr-1"
              >
              
              {/* Filter controls and top line */}
              <div className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="flex flex-wrap gap-1 w-full sm:w-auto">
                  {[
                    { id: 'all', label: 'Все заказы' },
                    { id: 'active', label: 'В процессе' },
                    { id: 'completed', label: 'Выданы' }
                  ].map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => setOrderFilter(btn.id as any)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors w-full sm:w-auto ${
                        orderFilter === btn.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>


              </div>

              {/* Rating widgets for completed orders */}
              {userOrders
                .filter(o => o.status === 'printed' && !o.rating && !dismissedRatings.has(o.id))
                .slice(0, 2)
                .map(o => (
                  <RatingWidget
                    key={o.id}
                    order={o}
                    onRate={handleRate}
                    onDismiss={handleDismissRating}
                  />
                ))
              }

              {/* Order Lists Rendering */}
              {userOrders.length === 0 ? (
                <div className="text-center glass-panel rounded-3xl p-12 max-w-lg mx-auto">
                  <div className="bg-slate-100 dark:bg-slate-950 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                    <FileCheck className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-black text-slate-800 dark:text-white">У вас еще нет заказов</h4>
                  <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
                    Загружайте ваши учебные файлы, рефераты, фотографии или архивы чертежей на первом шаге и отправляйте их администратору.
                  </p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="mt-6 font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all"
                  >
                    Начать загрузку
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {userOrders
                    .filter(ord => {
                      if (orderFilter === 'active') return ord.status !== 'printed';
                      if (orderFilter === 'completed') return ord.status === 'printed';
                      return true;
                    })
                    .map(ord => (
                      <div
                        key={ord.id}
                        className="glass-panel rounded-3xl overflow-hidden"
                      >
                        {/* Upper Section */}
                        <div className="p-5 border-b border-slate-150 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col sm:flex-row justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-black text-slate-800 dark:text-white uppercase">
                                {ord.id}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {formatDateTime(ord.orderDate)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-450">
                              Файлов: <strong>{ord.files.length} шт.</strong> | {ord.copies} {ord.copies === 1 ? 'копия' : ord.copies < 5 ? 'копии' : 'копий'} &bull; Бумага: <strong>{ord.paperType.toUpperCase()}</strong> &bull; Цветность: <strong>{ord.printColor === 'bw' ? 'Черно-белая' : 'Цветная'}</strong>
                            </div>
                          </div>

                          {/* Order Status Badges indicators */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${getStatusColor(ord.status)}`}>
                              {getStatusLabel(ord.status)}
                            </span>
                            <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${getPaymentStatusColor(ord.paymentStatus)}`}>
                              {getPaymentStatusLabel(ord.paymentStatus)}
                            </span>
                          </div>
                        </div>

                        {/* Mid Section - Files & Notes */}
                        <div className="p-5 space-y-4">
                          <div className="space-y-2">
                            <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">Загруженный комплект:</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {ord.files.map(f => (
                                <div key={f.id} className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-between gap-2.5 text-xs relative group">
                                  <div className="flex items-center gap-2.5 overflow-hidden">
                                    <FileType className="w-4.5 h-4.5 text-indigo-505" />
                                    <div className="overflow-hidden">
                                      <span className="font-bold block truncate text-slate-700 dark:text-slate-350">{f.name}</span>
                                      <span className="text-[9px] text-slate-400 block">{formatFileSize(f.size)}</span>
                                    </div>
                                  </div>

                                  {canDeleteFileFromOrder(ord) && (
                                    <div className="shrink-0 flex items-center">
                                      {fileToConfirmDelete?.orderId === ord.id && fileToConfirmDelete?.fileId === f.id ? (
                                        <div className="flex items-center gap-1">
                                          <span className="text-[9px] font-black text-rose-500 uppercase mr-1 animate-pulse">Удалить?</span>
                                          <button
                                            onClick={() => handleDeleteFileFromOrder(ord.id, f.id)}
                                            className="bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition"
                                          >
                                            Да
                                          </button>
                                          <button
                                            onClick={() => setFileToConfirmDelete(null)}
                                            className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition"
                                          >
                                            Нет
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setFileToConfirmDelete({ orderId: ord.id, fileId: f.id })}
                                          className="p-1 px-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-850 rounded transition cursor-pointer"
                                          title="Удалить файл из заказа"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {ord.notes && (
                            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                              {ord.notes.startsWith('Услуга:') ? (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">🛍</span>
                                    <div>
                                      <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest">Услуга</p>
                                      <p className="text-white font-bold text-xs">{ord.notes.replace('Услуга: ', '').split(' — ')[0]}</p>
                                    </div>
                                  </div>
                                  <span className="text-emerald-400 font-black text-sm">{ord.notes.split(' — ')[1]}</span>
                                </div>
                              ) : (
                                <div className="text-[11px]">
                                  <span className="font-bold text-slate-500 dark:text-slate-400">Требования к распечатке:</span> {ord.notes}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Bottom Actions Row */}
                        <div className="p-5 bg-slate-50/20 dark:bg-slate-950/10 border-t border-slate-150 dark:border-slate-800/80 flex flex-col sm:flex-row justify-between items-center gap-3">
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs text-slate-400 font-bold">К оплате:</span>
                            <span className="text-md font-black text-slate-800 dark:text-white">₽{ord.totalCost}</span>
                          </div>

                          <div className="flex gap-2 w-full sm:w-auto">
                            {/* PDF Invoice Button */}
                            <button
                              onClick={() => printInvoiceHTML(ord)}
                              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold px-3.5 py-2.5 rounded-xl transition"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Накладная
                            </button>

                            {/* ЮKassa Pay Button — показываем только если заказ не оплачен */}
                            {ord.paymentStatus === 'unpaid' && (
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await fetch('https://sever-18.ru/api/payment-create.php', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        orderId: ord.id,
                                        amount: ord.totalCost,
                                        email: user.email,
                                      }),
                                    });
                                    const data = await res.json();
                                    if (data.paymentUrl) {
                                      window.location.href = data.paymentUrl;
                                    } else {
                                      alert('Ошибка создания платежа. Попробуйте ещё раз.');
                                    }
                                  } catch {
                                    alert('Ошибка соединения. Проверьте интернет и попробуйте снова.');
                                  }
                                }}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-black px-4.5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 transition"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                Оплатить онлайн
                              </button>
                            )}

                            {/* Если уже оплачено — показываем зелёный статус вместо кнопки */}
                            {ord.paymentStatus === 'paid' && (
                              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-black px-3 py-2.5">
                                <CheckCircle className="w-4 h-4" />
                                Оплачено
                              </div>
                            )}

                            {/* Status/Receipt Trigger */}
                            <button
                              onClick={() => setPayingOrder(ord)}
                              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-4.5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/10 transition justify-center"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Статус обработки
                            </button>
                          </div>
                        </div>

                      </div>
                    ))}
                </div>
              )}

              </motion.div>
            )}

            {/* TAB 3: LIVE FEEDBACK INTEGRATED CHAT */}
            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="glass-panel rounded-3xl flex flex-col h-[550px] md:h-full md:flex-1 min-h-0 md:min-h-0 overflow-hidden transition-all duration-300 w-full"
              >
              
              {/* Operator info header */}
              <div className="p-4 border-b border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/25 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src="/logo-192.png"
                      alt="Фото-Север"
                      className="w-10 h-10 rounded-xl object-cover shrink-0 ring-2 ring-emerald-500/30"
                    />
                    {(() => {
                      const adminUser = database.users.find(u => u.role === 'admin');
                      const isAdminOnline = adminUser?.isOnline === true;
                      return (
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${isAdminOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      );
                    })()}
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-white">Оператор</h4>
                    {(() => {
                      const adminUser = database.users.find(u => u.role === 'admin');
                      const isAdminOnline = adminUser?.isOnline === true;
                      return isAdminOnline ? (
                        <span className="text-[10px] text-emerald-600 font-bold dark:text-emerald-400 uppercase tracking-widest block mt-0.5 animate-pulse">● В сети — отвечает быстро</span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mt-0.5">● Не в сети — ответит позже</span>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="tel:+79680508800"
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 dark:text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 rounded-xl transition-all shadow-sm shadow-emerald-600/10"
                    title="Связаться по телефону"
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>Связаться</span>
                  </a>
                  
                  <div className="hidden lg:block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-2">
                    Шифрование SSL
                  </div>
                </div>
              </div>

              {/* Chat Messages Log */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/30 dark:bg-slate-950/10 chat-message-log">
                {userChats.length === 0 ? (
                  <div className="h-full flex flex-col justify-center items-center text-center p-8">
                    <div className="bg-slate-100 dark:bg-slate-900 w-14 h-14 rounded-full flex items-center justify-center text-slate-400 mb-3">
                      <MessageSquare className="w-7 h-7" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white">Чат пуст. Начните диалог первым!</p>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
                      Вы можете уточнить статус заказа, согласовать перенос времени или заказать брошюровку у оператора в реальном времени.
                    </p>
                  </div>
                ) : (
                  userChats.map(msg => {
                    const isAdmin = msg.senderRole === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[85%] ${isAdmin ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
                      >
                        {isAdmin ? (
                          <UserAvatar
                            fallbackText="Оператор"
                            className="w-8 h-8 rounded-lg shrink-0"
                          />
                        ) : (
                          <UserAvatar
                            user={user}
                            className="w-8 h-8 rounded-lg shrink-0 ring-2 ring-indigo-505/20 border border-white dark:border-slate-900"
                          />
                        )}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 px-1">
                            <span>{msg.senderName} &bull; {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                            {!isAdmin && (
                              <span className="inline-flex items-center ml-0.5" title={msg.readByAdmin ? "Прочитано" : "Доставлено"}>
                                {msg.readByAdmin ? (
                                  <span className="text-sky-450 dark:text-sky-400 flex items-center relative w-4.5 h-3">
                                    <svg className="w-3 h-3 absolute left-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <svg className="w-3 h-3 absolute left-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500 flex items-center w-3 h-3">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                          {msg.message.startsWith('[STICKER]:') ? (
                            <div className="msg-sticker">
                              <img src={msg.message.substring(10)} className="msg-sticker__img" alt="Стикер" />
                            </div>
                          ) : (
                          <div
                            className={`p-3.5 rounded-2xl text-xs leading-relaxed font-medium shadow-sm border ${
                              isAdmin
                                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-100 dark:border-slate-800 rounded-tl-none'
                                : 'bg-indigo-600 text-white border-transparent rounded-tr-none'
                            }`}
                          >
                            {msg.message.startsWith('[IMAGE]:') ? (
                              <div className="space-y-1 my-0.5">
                                <img
                                  src={msg.message.substring(8)}
                                  className="rounded-xl max-w-[200px] sm:max-w-xs cursor-pointer hover:opacity-90 shadow-sm border border-slate-200 dark:border-slate-800"
                                  alt="Пример готового продукта"
                                />
                                <span className="text-[9px] opacity-70 block italic">Защищено водяным знаком &bull; ПРИМЕР</span>
                              </div>
                            ) : (
                              msg.message
                            )}
                          </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat inputs panel */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 glass-panel flex gap-2">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(v => !v)}
                    className="bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 font-bold p-3 rounded-xl transition flex items-center justify-center border border-slate-200 dark:border-slate-850 h-full"
                    title="Эмодзи"
                  >
                    <span className="text-base leading-none">😊</span>
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
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Задайте ваш вопрос оператору..."
                  className="flex-1 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:dark:bg-slate-850 text-white py-3 px-4.5 rounded-xl font-bold text-xs flex items-center justify-center transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
              </motion.div>
            )}

            {/* TAB 4: USER CABINET & DEVICE SYNCHRONIZATION DATA */}
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="space-y-6 w-full md:overflow-y-auto md:flex-1 min-h-0 pr-1"
              >
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* User Stats Card */}
                <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-6">
                  {isEditingProfile ? (
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                      <div className="text-center space-y-4">
                        {/* Live adjusted avatar preview */}
                        <div className="flex justify-center">
                          <UserAvatar
                            user={{
                              fullName: editFullName,
                              avatarUrl: editAvatarUrl,
                              avatarScale: editAvatarScale,
                              avatarX: editAvatarX,
                              avatarY: editAvatarY
                            }}
                            className="w-24 h-24 rounded-2xl ring-4 ring-indigo-500/15"
                          />
                        </div>

                        {/* Sliders for precise alignment */}
                        <div className="max-w-xs mx-auto bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-xl p-3 space-y-3">
                          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-1.5">
                            <span className="text-[10px] font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-widest">Разметка и наклон лица</span>
                            <button
                              onClick={() => {
                                setEditAvatarScale(1);
                                setEditAvatarX(0);
                                setEditAvatarY(0);
                              }}
                              type="button"
                              className="text-[9px] font-bold text-slate-400 hover:text-indigo-600 cursor-pointer uppercase transition-colors"
                            >
                              Сбросить
                            </button>
                          </div>

                          {/* Scale Slider */}
                          <div className="space-y-1 text-left">
                            <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              <span>Масштаб (Приближение):</span>
                              <span className="font-mono text-indigo-500">{(editAvatarScale * 100).toFixed(0)}%</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="3"
                              step="0.02"
                              value={editAvatarScale}
                              onChange={(e) => setEditAvatarScale(parseFloat(e.target.value))}
                              className="w-full accent-indigo-600 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          {/* X Offset Slider */}
                          <div className="space-y-1 text-left">
                            <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              <span>Влево ↔ Вправо:</span>
                              <span className="font-mono text-indigo-500">{editAvatarX > 0 ? `+${editAvatarX}` : editAvatarX}px</span>
                            </div>
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              step="1"
                              value={editAvatarX}
                              onChange={(e) => setEditAvatarX(parseInt(e.target.value))}
                              className="w-full accent-indigo-600 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          {/* Y Offset Slider */}
                          <div className="space-y-1 text-left">
                            <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              <span>Вверх ↕ Вниз:</span>
                              <span className="font-mono text-indigo-500">{editAvatarY > 0 ? `+${editAvatarY}` : editAvatarY}px</span>
                            </div>
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              step="1"
                              value={editAvatarY}
                              onChange={(e) => setEditAvatarY(parseInt(e.target.value))}
                              className="w-full accent-indigo-600 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>

                        <span className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-2">Выберите быстрый аватар:</span>
                        <div className="grid grid-cols-6 gap-2 mb-3 max-w-xs mx-auto">
                          {[
                            "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80",
                            "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80",
                            "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80",
                            "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80",
                            "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&auto=format&fit=crop&q=80",
                            "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80"
                          ].map((urlPreset, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setEditAvatarUrl(urlPreset);
                                // Reset offsets for presets
                                setEditAvatarScale(1);
                                setEditAvatarX(0);
                                setEditAvatarY(0);
                              }}
                              className={`w-10 h-10 rounded-xl object-cover overflow-hidden border-2 transition cursor-pointer ${
                                editAvatarUrl === urlPreset ? 'border-indigo-600 scale-105 shadow-md' : 'border-transparent hover:scale-102'
                              }`}
                            >
                              <img src={urlPreset} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </button>
                          ))}
                        </div>

                        <div className="space-y-1 text-left">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Или укажите свою ссылку на изображение:</label>
                          <input
                            type="text"
                            value={editAvatarUrl}
                            onChange={(e) => {
                              setEditAvatarUrl(e.target.value);
                              // Reset offsets for custom URL to keep initial layout clean
                              setEditAvatarScale(1);
                              setEditAvatarX(0);
                              setEditAvatarY(0);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="https://example.com/avatar.jpg"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Ваше Имя и Фамилия:</label>
                          <input
                            type="text"
                            required
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                            placeholder="Иван Иванов"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Контактный телефон:</label>
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                            placeholder="+7 999 123-45-67"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingProfile(false);
                            setEditFullName(user.fullName);
                            setEditPhone(user.phone || '');
                            setEditAvatarUrl(user.avatarUrl || '');
                          }}
                          className="py-2 px-3 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          type="submit"
                          className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                        >
                          Сохранить
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="relative group text-center">
                        <div className="relative inline-block">
                          <div 
                            title="Кликните, чтобы загрузить новое фото"
                            onClick={() => avatarInputRef.current?.click()}
                            className="relative cursor-pointer group active:scale-95 transition-transform duration-150"
                          >
                            <UserAvatar
                              user={user}
                              className="w-20 h-20 rounded-2xl ring-4 ring-indigo-500/20 mx-auto mb-3 transition"
                            />
                            <div className="absolute inset-0 max-w-[80px] h-20 rounded-2xl bg-slate-950/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200 mx-auto mb-3">
                              <Upload className="w-4 h-4 text-indigo-250 mb-0.5" />
                              <span className="text-[8px] font-black uppercase tracking-wider text-slate-100">Фото</span>
                            </div>
                            {avatarUploading && (
                              <div className="absolute inset-0 max-w-[80px] h-20 rounded-2xl bg-[#0f172a]/85 flex items-center justify-center text-white mx-auto mb-3">
                                <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
                              </div>
                            )}
                          </div>
                          
                          <input 
                            type="file" 
                            ref={avatarInputRef} 
                            onChange={handleAvatarFileChange} 
                            accept="image/*" 
                            className="hidden" 
                          />

                          {/* Visual loyalty rank float indicator */}
                          <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-md ${
                            getClientTierForUser(user.id, database.orders).tierCode === 'vip' ? 'bg-amber-500 text-white' :
                            getClientTierForUser(user.id, database.orders).tierCode === 'loyal' ? 'bg-slate-300 text-slate-800' : 'bg-indigo-600 text-white'
                          }`}>
                            {getClientTierForUser(user.id, database.orders).tierCode === 'vip' ? <Sparkles className="w-4 h-4 text-emerald-100" /> :
                             getClientTierForUser(user.id, database.orders).tierCode === 'loyal' ? <Trophy className="w-4 h-4 text-emerald-100" /> : <Star className="w-4 h-4 text-emerald-100" />}
                          </div>
                        </div>
                        <h3 className="text-base font-black text-slate-800 dark:text-white mt-1">{user.fullName}</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{user.role === 'admin' ? 'Администратор' : 'Клиент Копи-Центра'}</p>
                        
                        {/* Interactive dynamic loyalty badge */}
                        <div className="mt-2.5 flex justify-center">
                          <span className={getClientTierForUser(user.id, database.orders).badgeClass}>
                            {getClientTierForUser(user.id, database.orders).tierCode === 'vip' ? <Sparkles className="w-3 h-3 text-slate-950" /> :
                             getClientTierForUser(user.id, database.orders).tierCode === 'loyal' ? <Trophy className="w-3.5 h-3.5 text-amber-650" /> : <Star className="w-3 h-3 text-indigo-100" />}
                            {getClientTierForUser(user.id, database.orders).name}
                          </span>
                        </div>
                      </div>

                      {/* Dynamic Loyalty Goal Meter */}
                      <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 space-y-2">
                        {(() => {
                          const paidTotal = userOrders.reduce((acc, current) => acc + (current.paymentStatus === 'paid' ? current.totalCost : 0), 0);
                          const tier = getClientTierForUser(user.id, database.orders);
                          let nextGoal = 5000;
                          let progress = (paidTotal / 5000) * 100;
                          let goalLabel = 'Постоянный клиент';
                          
                          if (paidTotal >= 50000) {
                            nextGoal = 50000;
                            progress = 100;
                            goalLabel = 'Максимальный VIP';
                          } else if (paidTotal >= 5000) {
                            nextGoal = 50000;
                            progress = ((paidTotal - 5000) / 45000) * 100;
                            goalLabel = 'VIP статус (Приоритет печати)';
                          }
                          
                          return (
                            <>
                              <div className="flex justify-between items-baseline text-[10px] font-bold">
                                <span className="text-slate-400 uppercase tracking-widest">Прогресс лояльности:</span>
                                <span className="text-slate-500 font-black">{paidTotal} ₽ / {nextGoal} ₽</span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    tier.tierCode === 'vip' ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                                    tier.tierCode === 'loyal' ? 'bg-gradient-to-r from-indigo-500 to-amber-400' : 'bg-indigo-600'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(8, progress))}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[9px] font-bold text-slate-400">
                                <span>{tier.name}</span>
                                {paidTotal < 50000 ? (
                                  <span className="text-indigo-600 dark:text-indigo-400">До статуса {goalLabel}: {(nextGoal - paidTotal).toLocaleString()} ₽</span>
                                ) : (
                                  <span className="text-amber-500 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Приоритетная VIP-печать включена</span>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <div className="border-t border-slate-150 dark:border-slate-800 pt-5 space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Ваш Email:</span>
                          <span className="font-bold text-slate-805 dark:text-slate-300">{user.email}</span>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Номер телефона:</span>
                          <span className="font-bold text-slate-805 dark:text-slate-300">{user.phone || '+7 (---) ----**-**'}</span>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-[10px] text-slate-400">Дата регистрации:</span>
                          <span className="font-bold text-slate-805 dark:text-slate-300">{formatDateTime(user.createdAt)}</span>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Всего заказов:</span>
                          <span className="font-bold text-slate-805 dark:text-slate-300">{userOrders.length} шт.</span>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Сумма трат:</span>
                          <span className="font-bold text-slate-855 dark:text-slate-300">₽{userOrders.reduce((acc, current) => acc + (current.paymentStatus === 'paid' ? current.totalCost : 0), 0)}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-3.5 border-t border-slate-150 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setIsEditingProfile(true)}
                            className="py-2.5 px-3 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Sliders className="w-3.5 h-3.5" /> Изменить профиль
                          </button>
                          
                          <a
                            href="tel:+79680508800"
                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            Позвонить
                          </a>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Secure System & Synchronization Details */}
                <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-6">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">Безопасность и Настройки</h3>
                  
                  <div className="space-y-4">
                    
                    {/* Device Sync State Panel */}
                    <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/30 dark:border-indigo-900/30 rounded-2xl flex items-start gap-3">
                      <RefreshCw className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5 animate-spin" />
                      <div>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-white flex items-center gap-1.5">
                          Авто-синхронизания активна 
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                          Кабинет автоматически синхронизируется между вашими устройствами и вкладками браузера в реальном времени. Изменения на ПК моментально отобразятся на смартфоне.
                        </p>
                      </div>
                    </div>

                    {/* Social connection options */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-850">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Связанные соцсети</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                          user.isSocial 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' 
                            : 'bg-slate-100 border-slate-200 text-slate-550 dark:bg-slate-900 dark:text-slate-400'
                        }`}>
                          {user.isSocial ? 'Подключено через OAuth' : 'Локальный Email пароль'}
                        </span>
                      </div>
                    </div>

                    {/* Self Account deletion */}
                    <div className="p-4 border border-rose-100 dark:border-rose-950/40 rounded-2xl bg-rose-50/50 dark:bg-rose-950/10 space-y-3">
                      <span className="text-[10px] uppercase font-bold text-rose-500 tracking-wider block">Удаление профиля согласно GDPR</span>
                      <p className="text-[10px] text-rose-700/80 dark:text-rose-400/80">
                        Вы можете навсегда удалить все ваши учетные данные, загруженные файлы и историю из базы данных Копи-Центра.
                      </p>
                      <button
                        onClick={handleDeleteSelf}
                        className="py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-lg transition"
                      >
                        Применить удаление данных
                      </button>
                    </div>
                  </div>
                </div>

                {/* 📋 Telegram Notifications Panel */}
                <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-5">
                  <div className="flex items-center gap-2">
                    <Send className="w-4.5 h-4.5 text-sky-500" />
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Telegram-уведомления</h3>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                    Получайте моментальные сообщения от нашего бота-ассистента в Telegram, когда меняется статус вашего заказа (Принят, В печати, Готов к выдаче) или поступают важные сообщения от оператора в чате.
                  </p>

                  <div className="space-y-4 pt-1">
                    {/* Status Toggle option */}
                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
                      <div>
                        <span className="text-xs font-black text-white block">Включить уведомления</span>
                        <span className="text-[9px] text-white/40 mt-0.5 block">Уведомления о заказах</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={!!user.telegramNotificationsEnabled}
                          onChange={(e) => {
                            const updatedUsers = database.users.map(u =>
                              u.id === user.id ? { ...u, telegramNotificationsEnabled: e.target.checked } : u
                            );
                            onUpdateDatabase({ users: updatedUsers });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500" />
                      </label>
                    </div>

                    {/* Кнопка подключения Telegram */}
                    <div className="space-y-3">
                      {telegramLinked || user.telegramChatId ? (
                        <div className="flex items-center gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl">
                          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                          <div>
                            <p className="text-xs font-black text-emerald-400">Telegram подключён</p>
                            <p className="text-[10px] text-white/50 mt-0.5">Вы будете получать уведомления в Telegram</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] text-white/50 leading-relaxed">
                            Нажмите кнопку — откроется бот в Telegram. Там просто нажмите <b className="text-white/80">«Отправить»</b> и всё готово.
                          </p>
                          <button
                            type="button"
                            onClick={handleConnectTelegram}
                            disabled={telegramLinking}
                            className="w-full py-3 px-4 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-black text-sm rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {telegramLinking ? (
                              <><RefreshCw className="w-4 h-4 animate-spin" /> Открываем бота...</>
                            ) : (
                              <>
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-1-.65-.35-1 .22-1.6 1.5-1.55 2.75-2.91 3.75-3.95.44-.45.89-.96.44-.96-.45 0-1.18.3-2.18.97-1 .68-1.86 1.25-3.5 2.33-.53.35-.95.53-1.34.52-.42 0-1.22-.23-1.82-.42-.74-.24-1.33-.36-1.28-.77.03-.21.32-.43.88-.67 3.44-1.5 5.74-2.49 6.89-2.98 3.29-1.37 3.98-1.61 4.43-1.62.1 0 .32.02.46.14.12.1.15.24.17.34.02.13.02.43 0 .52z"/></svg>
                                Подключить Telegram
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Theme Customizer Card */}
                <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4.5 h-4.5 text-indigo-650" />
                      <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Индивидуальный Стиль и Тема</h3>
                    </div>
                    
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                      Выберите эксклюзивное оформление для вашего кабинета. Все три варианта полностью совместимы с дневным и ночным режимами. Нажмите для мгновенного превью:
                    </p>

                    <div className="space-y-2.5 pt-1">
                      {/* Theme: Blue */}
                      <button
                        type="button"
                        onClick={() => setDesignTheme('blue')}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          designTheme === 'blue'
                            ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
                            : 'bg-slate-50/50 dark:bg-slate-950/30 border-slate-150 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shrink-0 shadow-inner font-extrabold text-[10px]">
                          🔵
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-black text-slate-800 dark:text-white leading-tight">Бизнес-Портал (Синий)</h4>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate uppercase font-bold tracking-wider">Классический строгий интерфейс</p>
                        </div>
                        {designTheme === 'blue' && (
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                        )}
                      </button>

                      {/* Theme: Kraft */}
                      <button
                        type="button"
                        onClick={() => setDesignTheme('kraft')}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          designTheme === 'kraft'
                            ? 'bg-emerald-50/20 dark:bg-emerald-950/20 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                            : 'bg-slate-50/50 dark:bg-slate-950/30 border-slate-150 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shrink-0 shadow-inner font-extrabold text-[10px]">
                          🌿
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-black text-slate-800 dark:text-white leading-tight">Эко-Крафт / Уютная Типография (Зеленый)</h4>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate uppercase font-bold tracking-wider">Теплый кремовый фон и лесной изумруд</p>
                        </div>
                        {designTheme === 'kraft' && (
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        )}
                      </button>

                      {/* Theme: Cyber */}
                      <button
                        type="button"
                        onClick={() => setDesignTheme('cyber')}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          designTheme === 'cyber'
                            ? 'bg-purple-50/20 dark:bg-purple-950/20 border-purple-500 shadow-md ring-2 ring-purple-500/20'
                            : 'bg-slate-50/50 dark:bg-slate-950/30 border-slate-150 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-600 to-purple-800 flex items-center justify-center text-white shrink-0 shadow-inner font-extrabold text-[10px]">
                          🔮
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-black text-slate-800 dark:text-white leading-tight">Киберпанк / Неоновый Космос (Фиолетовый)</h4>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate uppercase font-bold tracking-wider">Глубокий темный и светящийся неон-нектар</p>
                        </div>
                        {designTheme === 'cyber' && (
                          <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse shrink-0" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-850 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                    <span>Текущий выбор:</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-white text-[9px] font-black ${
                      designTheme === 'blue' ? 'bg-indigo-600' :
                      designTheme === 'kraft' ? 'bg-emerald-600' : 'bg-purple-600'
                    }`}>
                      {designTheme === 'blue' ? 'Pro Blue Active' :
                       designTheme === 'kraft' ? 'Nordic Kraft Active' : 'Cyber Midnight Active'}
                    </span>
                  </div>
                </div>

                {/* Social Share Referral Widget Card */}
                <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-5">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4.5 h-4.5 text-indigo-650" />
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Поделиться Сервисом</h3>
                  </div>
                  
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                    Порекомендуйте наш удобный онлайн Копи-Центр друзьям. Поделитесь ссылкой в один клик через WhatsApp, Telegram, VKontakte или Email.
                  </p>

                  <div className="grid grid-cols-4 gap-2.5">
                    {/* WhatsApp share */}
                    <a
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent('Привет! Пользуюсь классным сайтом для онлайн заказа распечатки в Копи-Центре (А4, фото, чертежи, брошюровка). Загрузка файлов прямо с телефона. Попробуй сам: ' + window.location.origin)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl border border-slate-100 dark:border-slate-850 bg-slate-50/30 hover:bg-emerald-50/20 dark:bg-slate-950/20 dark:hover:bg-emerald-950/20 hover:border-emerald-250 transition-all duration-200 group cursor-pointer"
                      title="Поделиться в WhatsApp"
                    >
                      <svg className="w-5 h-5 text-emerald-605 group-hover:scale-110 transition duration-200" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.456L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.843.002-2.628-1.022-5.1-2.885-6.964C16.588 1.94 14.116.916 11.5.914 6.066.914 1.644 5.334 1.64 10.758c-.001 1.71.455 3.38 1.321 4.843L1.87 21.08l5.88-1.543zm12.353-8.156c-.334-.167-1.971-.972-2.275-1.082-.303-.11-.525-.164-.746.168-.221.332-.856 1.082-1.05 1.302-.193.222-.387.247-.72.08-1.53-.762-2.658-1.32-3.714-3.13-.28-.48.28-.445.8-.1.353-.284.582-.44.825-.94.24-.5.12-.94-.03-1.272-.15-.332-1.272-3.07-1.742-4.2-.459-1.1-.92-1.05-1.272-1.055-.3-.004-.643-.004-.985-.004-.34 0-.895.127-1.36.64-.462.513-1.766 1.727-1.766 4.21s1.807 4.88 2.057 5.214C8.42 16.52 11.92 21.5 17.5 23.513c3.27 1.18 4.254 1.139 5.332.96 1.05-.17 2.275-.928 2.595-1.785.32-.857.32-1.593.224-1.785-.096-.192-.352-.303-.687-.47z" />
                      </svg>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">WhatsApp</span>
                    </a>

                    {/* Telegram share */}
                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent('Привет! Рекомендую этот онлайн-сервис заказа быстрой распечатки документов и фотографий. Файлы можно слать прямо с телефона!')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl border border-slate-100 dark:border-slate-850 bg-slate-50/30 hover:bg-sky-50/20 dark:bg-slate-950/20 dark:hover:bg-sky-950/20 hover:border-sky-250 transition-all duration-200 group cursor-pointer"
                      title="Поделиться в Telegram"
                    >
                      <svg className="w-5 h-5 text-sky-500 group-hover:scale-110 transition duration-200" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-1-.65-.35-1 .22-1.6 1.5-1.55 2.75-2.91 3.75-3.95.44-.45.89-.96.44-.96-.45 0-1.18.3-2.18.97-1 .68-1.86 1.25-3.5 2.33-.53.35-.95.53-1.34.52-.42 0-1.22-.23-1.82-.42-.74-.24-1.33-.36-1.28-.77.03-.21.32-.43.88-.67 3.44-1.5 5.74-2.49 6.89-2.98 3.29-1.37 3.98-1.61 4.43-1.62.1 0 .32.02.46.14.12.1.15.24.17.34.02.13.02.43 0 .52z" />
                      </svg>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">Telegram</span>
                    </a>

                    {/* VK share - corrected custom vector icon & color path */}
                    <a
                      href={`https://vk.com/share.php?url=${encodeURIComponent(window.location.origin)}&title=${encodeURIComponent('Копи-Центр ОНЛАЙН')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl border border-slate-100 dark:border-slate-850 bg-slate-50/30 hover:bg-blue-50/20 dark:bg-slate-950/20 dark:hover:bg-blue-950/20 hover:border-blue-250 transition-all duration-200 group cursor-pointer"
                      title="Поделиться во ВКонтакте"
                    >
                      <svg className="w-5 h-5 text-[#0077FF] dark:text-[#3f94ff] group-hover:scale-110 transition duration-200" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.024 19.141c-5.748 0-10.354-4.57-10.457-11.141H7.5c.071 4.795 2.203 6.829 3.882 7.247V8h2.824v4.132c1.729-.184 3.473-2.073 4.086-4.132h2.824a10.22 10.22 0 01-3.765 5.518c1.376.623 3.153 2.296 4.141 5.623h-3.035c-.776-2.39-2.706-4.247-4.259-4.39V19.14h-.012z"/>
                      </svg>
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">ВКонтакте</span>
                    </a>

                    {/* Email share */}
                    <a
                      href={`mailto:?subject=${encodeURIComponent('Онлайн Копи-Центр ОНЛАЙН')}&body=${encodeURIComponent('Привет! Стал заказывать распечатку документов и фотографий онлайн с доставкой/брошюровкой на этом сайте. Рекомендую и тебе: ' + window.location.origin)}`}
                      className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl border border-slate-100 dark:border-slate-850 bg-slate-50/30 hover:bg-indigo-50/20 dark:bg-slate-950/20 dark:hover:bg-indigo-950/20 hover:border-indigo-250 transition-all duration-200 group cursor-pointer"
                      title="Отправить по Email"
                    >
                      <Mail className="w-5 h-5 text-indigo-650 group-hover:scale-110 transition duration-200" />
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">Email</span>
                    </a>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(window.location.origin);
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 2000);
                      } catch (err) {
                        // Silent recovery
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950/50 hover:text-slate-900 dark:hover:text-white font-bold text-xs rounded-xl transition duration-200 cursor-pointer"
                  >
                    {shareCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-500 animate-bounce" />
                        <span className="text-emerald-500">Ссылка скопирована!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-450" />
                        <span>Скопировать ссылку сайта для отправки</span>
                      </>
                    )}
                  </button>
                </div>

              </div>

              {/* In App Notifications Journal */}
              <div className="glass-panel rounded-3xl p-6 md:p-8">
                <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-150 dark:border-slate-800">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Bell className="w-4.5 h-4.5 text-indigo-650" /> Журнал уведомлений
                  </h3>
                  <button
                    onClick={handleMarkNotificationsRead}
                    className="text-xs text-indigo-600 hover:text-indigo-500 font-bold"
                  >
                    Пометить всё как прочитанное
                  </button>
                </div>

                {userNotifications.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Журнал уведомлений пуст. Все статусы в порядке!</p>
                ) : (
                  <div className="space-y-3.5 max-h-72 overflow-y-auto">
                    {userNotifications.map(notif => (
                      <div
                        key={notif.id}
                        className={`p-3.5 rounded-2xl border flex items-start gap-3 transition ${
                          notif.read 
                            ? 'bg-slate-50/50 dark:bg-slate-950/10 border-slate-100 dark:border-slate-850 opacity-60' 
                            : 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-100/30'
                        }`}
                      >
                        <div className="bg-white dark:bg-slate-950 p-2 rounded-xl text-indigo-605 shadow-sm">
                          <Bell className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-800 dark:text-white truncate">{notif.title}</h4>
                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-1">{new Date(notif.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{notif.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>

      {/* File Preview Modal */}
      {previewFile && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewFile(null)}
        >
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30">
              <div className="overflow-hidden mr-2">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider truncate">
                  Предпросмотр: {previewFile.name}
                </h3>
                <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                  Размер: {formatFileSize(previewFile.size)} &bull; Формат: {previewFile.formatGroup.toUpperCase()}
                </span>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-205 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white text-lg font-black transition-colors cursor-pointer shrink-0"
              >
                &times;
              </button>
            </div>

            {/* Content area */}
            <div className="p-4 md:p-6 overflow-y-auto flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950/20 min-h-[260px]">
              {previewFile.type.startsWith('image/') || previewFile.formatGroup === 'image' ? (
                <img
                  src={previewFile.previewUrl || previewFile.url}
                  alt={previewFile.name}
                  className="max-w-full max-h-[50vh] object-contain rounded-xl shadow-md border border-slate-200/50 dark:border-slate-850"
                  referrerPolicy="no-referrer"
                />
              ) : previewFile.type === 'application/pdf' || previewFile.name.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewFile.previewUrl || previewFile.url}
                  title={previewFile.name}
                  className="w-full h-[50vh] rounded-xl border border-slate-200/50 dark:border-slate-850 bg-white"
                />
              ) : (
                <div className="text-center p-8 max-w-md">
                  <div className="text-slate-400 dark:text-slate-500 text-4xl mb-3">📄</div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Прямой предпросмотр для этого формата недоступен.
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    Но вы можете отправить его на печать! Мы поддерживаем чертежи, текстовые документы и архивы.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-150 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-950/30">
              <button
                onClick={() => setPreviewFile(null)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-sm"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PREMIUM HIGH-FIDELITY INTERACTIVE 3D MOCKUP INSPECTOR MODAL --- */}
      {show3DMockupModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6 animate-fade-in text-slate-800 dark:text-slate-100"
          onClick={() => setShow3DMockupModal(false)}
        >
          <div 
            className="bg-white dark:bg-[#080d24] w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-150 dark:border-indigo-950/50 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-150 dark:border-slate-850 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Layers className="w-5 h-5 text-indigo-500 animate-spin-slow" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>Интерактивный 3D-осмотр тиража партии</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-250/30">В ФОКУСЕ 100%</span>
                  </h3>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block mt-0.5 leading-none">
                    Реалистичная симуляция физического носителя и его комплектации
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShow3DMockupModal(false)}
                className="w-10 h-10 rounded-full bg-slate-105 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white text-xl font-black transition-all cursor-pointer shrink-0 border border-slate-200/40 dark:border-slate-800/60"
              >
                &times;
              </button>
            </div>

            {/* Content area splitting into Canvas on left, controls on right */}
            <div className="flex-1 overflow-y-auto p-5 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-50/40 dark:bg-slate-950/20">
              
              {/* Left Panel: 3D stage with zero blur, maximum size and detailed textures */}
              <div className="lg:col-span-7 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-850/50 p-6 flex flex-col justify-between relative min-h-[380px] md:min-h-[460px] overflow-hidden shadow-inner">
                {/* Simulated clean laboratory layout grid */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 pointer-events-none" />

                {/* Perspective scale center container */}
                <div 
                  className="my-auto mx-auto flex items-center justify-center transition-all duration-300 relative"
                  style={{
                    transform: `perspective(1000px) rotateX(${mockRotateX}deg) rotateY(${mockRotateY}deg) scale(${mockScale})`,
                    transformStyle: 'preserve-3d',
                  }}
                >
                  {/* Dynamic stacked shadow loop */}
                  {Array.from({ length: Math.min(8, copies) }).map((_, idx) => {
                    const isTopPage = idx === Math.min(8, copies) - 1;
                    const shiftX = idx * 3.5;
                    const shiftY = idx * -3.5;

                    let paperBgClass = 'bg-white text-slate-850';
                    if (paperType === 'kraft') {
                      paperBgClass = 'bg-[#f4e2cb] dark:bg-[#d0b490] text-amber-950';
                    } else if (paperType === 'glossy') {
                      paperBgClass = 'bg-slate-50 text-slate-900';
                    } else if (paperType === 'matte') {
                      paperBgClass = 'bg-[#fbfaf7] dark:bg-[#efede9] text-slate-900';
                    }

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border transition-all duration-200 p-5 flex flex-col justify-between shadow-[4px_4px_16px_rgba(0,0,0,0.12)] border-slate-300/40 dark:border-slate-700/30 ${paperBgClass}`}
                        style={{
                          width: paperType === 'standard_a3' || paperType === 'bw_a3' ? '280px' : '230px',
                          height: paperType === 'standard_a3' || paperType === 'bw_a3' ? '390px' : '310px',
                          position: idx === 0 ? 'relative' : 'absolute',
                          left: `${shiftX}px`,
                          bottom: `${shiftY}px`,
                          top: idx === 0 ? 'auto' : `calc(0px + ${shiftY}px)`,
                          zIndex: idx + 1,
                          transform: 'translateZ(' + (idx * 2) + 'px)',
                        }}
                      >
                        {/* Shimmer reflection for glossy surfaces */}
                        {paperType === 'glossy' && (
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/40 rounded-xl pointer-events-none z-10" />
                        )}

                        {/* Staple simulation for active staple binding */}
                        {binding === 'staple' && isTopPage && (
                          <div className="absolute top-3 left-3 w-8 h-2 bg-slate-350 dark:bg-slate-400 border border-slate-400/80 -rotate-45 rounded-xs shadow-md z-20" />
                        )}

                        {/* Sleeve File simulation */}
                        {binding === 'file' && isTopPage && (
                          <div className="absolute inset-0 bg-sky-200/15 dark:bg-sky-400/5 border-2 border-sky-400/30 rounded-xl z-20 pointer-events-none shadow-inner" style={{ backdropFilter: 'blur(0.5px)' }}>
                            <div className="absolute top-2 right-2 w-4 h-4 rounded-full border border-sky-500/15 flex items-center justify-center bg-white/90 shadow-md text-sky-600 font-extrabold text-[9px]">
                              5₽
                            </div>
                          </div>
                        )}

                        {/* Plastic and Metal spiral simulation */}
                        {(binding === 'spring_plastic' || binding === 'spring_metal') && isTopPage && (
                          <div className="absolute top-0 bottom-0 left-1 w-3.5 flex flex-col justify-around items-center z-20">
                            {Array.from({ length: 14 }).map((_, cIdx) => (
                              <div 
                                key={cIdx} 
                                className={`w-3.5 h-2 rounded-full border ${
                                  binding === 'spring_plastic' 
                                    ? 'bg-slate-900 border-slate-950 shadow-xs' 
                                    : 'bg-gradient-to-r from-slate-200 to-slate-400 border-slate-400'
                                }`} 
                              />
                            ))}
                          </div>
                        )}

                        {/* Hard cover binder simulation */}
                        {binding === 'hard_cover' && isTopPage && (
                          <div className="absolute inset-0 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 rounded-xl flex flex-col justify-between p-5 text-slate-100 z-20 shadow-xl border-t border-b border-indigo-900/40">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                              <span className="text-[7.5px] font-mono tracking-widest text-[#d4af37] font-extrabold">КОПИ-СПЕЦИАЛИСТ</span>
                              <span className="text-[7.5px] font-mono font-bold">ОТДЕЛКА СЕМЕЙНАЯ</span>
                            </div>
                            <div className="my-auto space-y-2 text-center p-2 border border-slate-800/60 bg-slate-950/45 rounded-xl">
                              <div className="text-[9.5px] text-[#d4af37] font-black uppercase tracking-widest leading-normal">
                                Твёрдый переплёт премиум
                              </div>
                              <div className="text-[7.5px] text-slate-400 italic">
                                * Текстурная кожаная обложка *
                              </div>
                            </div>
                            <div className="flex justify-between items-end border-t border-slate-800 pt-2 text-[7px] text-slate-400 font-mono">
                              <span>РАЗМЕР А4</span>
                              <span>МАТЕРИАЛ КНИЖНЫЙ</span>
                            </div>
                          </div>
                        )}

                        {/* Crisp interior content mockup - perfectly legible */}
                        {isTopPage && binding !== 'hard_cover' && (
                          <div className="w-full h-full flex flex-col justify-between text-left select-none relative p-1.5 pointer-events-none">
                            {uploadedFiles[0] && (uploadedFiles[0].previewUrl || (uploadedFiles[0].formatGroup === 'image' && uploadedFiles[0].url)) ? (
                              // Real Uploaded Image Preview
                              <div className="absolute inset-0 p-1 bg-white dark:bg-slate-900 rounded-xl overflow-hidden flex flex-col justify-between">
                                <div className="w-full h-[85%] relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                                  <img 
                                    src={uploadedFiles[0].previewUrl || uploadedFiles[0].url} 
                                    className="w-full h-full object-cover" 
                                    alt={uploadedFiles[0].name}
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute top-1.5 right-1.5 bg-indigo-600 px-2 py-0.5 text-white text-[7px] font-black tracking-widest rounded-md">
                                    ОРИГИНАЛ МАКЕТА
                                  </div>
                                </div>
                                <div className="flex justify-between items-center text-[7.5px] font-bold text-slate-500 font-mono px-0.5">
                                  <span className="truncate max-w-[170px]">{uploadedFiles[0].name}</span>
                                  <span>{formatFileSize(uploadedFiles[0].size)}</span>
                                </div>
                              </div>
                            ) : uploadedFiles[0] ? (
                              // Real Uploaded Document Preview Layout
                              <div className="w-full h-full flex flex-col justify-between">
                                {/* Paper top metadata stamp */}
                                <div className="flex justify-between items-center text-[7.5px] font-mono font-black text-indigo-500 uppercase tracking-widest">
                                  <span>Копи-Север • 2026</span>
                                  <span>{paperType === 'standard_a3' || paperType === 'bw_a3' ? 'ФОРМАТ А3' : 'ФОРМАТ А4'}</span>
                                </div>

                                {/* Crisp graphics and title simulator */}
                                <div className="my-auto py-2.5 space-y-2.5">
                                  {/* Simulated clean stamp or header */}
                                  <div className="border border-dashed border-indigo-400/40 bg-indigo-50/10 p-2.5 rounded-xl space-y-1">
                                    <div className="text-[10px] font-black tracking-wide text-indigo-700 dark:text-indigo-400">
                                      {uploadedFiles[0].name.toUpperCase()}
                                    </div>
                                    <div className="text-[7.5px] text-slate-500 dark:text-slate-400 font-bold font-mono">
                                      {formatFileSize(uploadedFiles[0].size)} • {uploadedFiles[0].pageCount || 1} стр.
                                    </div>
                                  </div>

                                  {/* Simulated detailed paragraph blocks */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-3 h-3 rounded-full bg-indigo-505 flex items-center justify-center text-[7px] text-white font-black">1</div>
                                      <p className="text-[8.5px] font-extrabold text-slate-750 dark:text-slate-300">Реальные параметры партии:</p>
                                    </div>
                                    <div className="pl-4 space-y-1">
                                      <div className="h-1 bg-slate-300 dark:bg-slate-700 rounded-full w-full" />
                                      <div className="h-1 bg-slate-300 dark:bg-slate-700 rounded-full w-5/6" />
                                      <div className="h-1 bg-slate-350 dark:bg-slate-650 rounded-full w-11/12" />
                                    </div>
                                  </div>

                                  {/* Real parameters stamped inside mockup page */}
                                  <div className="bg-slate-100/50 dark:bg-slate-900/55 p-2 rounded-lg text-[7px] font-mono space-y-0.5 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/40">
                                    <div>Плотность: {paperDensity === 'thick' ? 'Плотная 160 г/м²' : 'Стандартная 80 г/м²'}</div>
                                    <div>Тираж: {copies} шт • Страниц: {uploadedFiles.reduce((acc, f) => acc + (f.pageCount || 1), 0)}</div>
                                    <div>Скрепление: {binding === 'none' ? 'Нет' : binding === 'staple' ? 'Степлер (угол)' : binding === 'file' ? 'Файлик' : binding === 'spring_metal' ? 'Металлическая пружина' : binding === 'spring_plastic' ? 'Пластиковая пружина' : 'Твёрдый переплет'}</div>
                                  </div>
                                </div>

                                {/* Stamps or bottom seals */}
                                <div className="flex justify-between items-end border-t border-slate-200/60 dark:border-slate-800/60 pt-2 text-[7px] font-bold text-slate-400">
                                  <div className="space-y-0.5">
                                    <span className="block italic">Подготовлено в печать:</span>
                                    <span className="block font-mono text-indigo-650 dark:text-indigo-400">{user.fullName || 'Гость-Клиент'}</span>
                                  </div>
                                  
                                  {/* Colored Visual circle stamp */}
                                  {printColor === 'bw' ? (
                                    <div className="w-8 h-8 rounded-full border border-double border-slate-400 flex items-center justify-center text-[6.5px] font-bold font-mono text-slate-400 -rotate-12 transform">
                                      Ч/Б СТАНДАРТ
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full border border-double border-indigo-500 flex items-center justify-center text-[6.5px] font-mono font-black text-indigo-500 -rotate-12 transform bg-indigo-50/25 animate-pulse">
                                      100% ЦВЕТ
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              // Fallback standard render
                              <>
                                {/* Paper top metadata stamp */}
                                <div className="flex justify-between items-center text-[7.5px] font-mono font-black text-indigo-500 uppercase tracking-widest">
                                  <span>Копи-Север • 2026</span>
                                  <span>{paperType === 'standard_a3' || paperType === 'bw_a3' ? 'ФОРМАТ А3' : 'ФОРМАТ А4'}</span>
                                </div>

                                <div className="my-auto py-2.5 space-y-2.5">
                                  <div className="border border-dashed border-indigo-400/40 bg-indigo-50/10 p-2 rounded-lg space-y-1">
                                    <div className="text-[9px] font-black tracking-wide text-slate-800 dark:text-slate-200">
                                      DOCUMENT_REPORT.PDF
                                    </div>
                                    <div className="text-[7px] text-slate-450 dark:text-slate-500 font-medium">
                                      Типография: Северное шоссе, 18 • 1.04 MB • 1 стр.
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex items-center justify-center text-[6px] text-white font-black">1</div>
                                      <p className="text-[8px] font-semibold text-slate-750 dark:text-slate-300">Спецификация партии на печать:</p>
                                    </div>
                                    <div className="pl-4 space-y-1">
                                      <div className="h-1 bg-slate-300 dark:bg-slate-700 rounded-full w-full" />
                                      <div className="h-1 bg-slate-300 dark:bg-slate-700 rounded-full w-5/6" />
                                    </div>
                                  </div>

                                  <div className="bg-slate-100/50 dark:bg-slate-900/55 p-2 rounded-lg text-[7px] font-mono space-y-0.5 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/40">
                                    <div>Плотность: {paperDensity === 'thick' ? 'Плотная 160 г/м²' : 'Стандартная 80 г/м²'}</div>
                                    <div>Тираж: {copies} шт • Страниц: 1</div>
                                    <div>Скрепление: {binding === 'none' ? 'Нет' : binding === 'staple' ? 'Степлер (угол)' : binding === 'file' ? 'Файлик' : binding === 'spring_metal' ? 'Металлическая пружина' : binding === 'spring_plastic' ? 'Пластиковая пружина' : 'Твёрдый переплет'}</div>
                                  </div>
                                </div>

                                <div className="flex justify-between items-end border-t border-slate-200/60 dark:border-slate-800/60 pt-2 text-[7px] font-bold text-slate-400">
                                  <div className="space-y-0.5">
                                    <span className="block italic">Подготовлено в печать:</span>
                                    <span className="block font-mono text-indigo-600 dark:text-indigo-400">{user.fullName || 'Гость-Клиент'}</span>
                                  </div>
                                  
                                  {printColor === 'bw' ? (
                                    <div className="w-8 h-8 rounded-full border border-double border-slate-400 flex items-center justify-center text-[6.5px] font-bold font-mono text-slate-400 -rotate-12 transform">
                                      Ч/Б СТАНДАРТ
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full border border-double border-indigo-500 flex items-center justify-center text-[6.5px] font-mono font-black text-indigo-500 -rotate-12 transform bg-indigo-50/25 animate-pulse">
                                      100% ЦВЕТ
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Perspective stats overlay on the bottom left of canvas */}
                <div className="absolute bottom-4 left-4 bg-slate-900/90 text-white font-mono text-[9px] p-2.5 rounded-xl space-y-0.5 border border-slate-800 z-30 shadow-lg select-none backdrop-blur-xs">
                  <div>X-ROTATION: {mockRotateX}°</div>
                  <div>Y-ROTATION: {mockRotateY}°</div>
                  <div>ZOOM-LEVEL: {mockScale.toFixed(2)}x</div>
                </div>
              </div>

              {/* Right Panel: Controls & sliders & custom settings in full focus */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
                
                {/* 3D stage rotation and tilt controls */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800 space-y-4">
                  <h4 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-850 pb-2.5">
                    <Sliders className="w-4 h-4 text-indigo-500" />
                    <span>Управление 3D-манекеном</span>
                  </h4>

                  {/* Horizontal rotation input slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-350">Вращение по горизонтали:</span>
                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{mockRotateY}°</span>
                    </div>
                    <input 
                      type="range"
                      min="-75"
                      max="75"
                      value={mockRotateY}
                      onChange={(e) => setMockRotateY(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>СЛЕВА (-75°)</span>
                      <span>ФРОНТ (0°)</span>
                      <span>СПРАВА (75°)</span>
                    </div>
                  </div>

                  {/* Pitch tilt input slider */}
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-350">Наклон по вертикали:</span>
                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{mockRotateX}°</span>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="75"
                      value={mockRotateX}
                      onChange={(e) => setMockRotateX(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>ВИД СБОКУ (0°)</span>
                      <span>ИДЕАЛЬНЫЙ НАКЛОН (25°)</span>
                      <span>ВИД СВЕРХУ (75°)</span>
                    </div>
                  </div>

                  {/* Zoom slider */}
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-350">Масштабирование (Zoom):</span>
                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{mockScale.toFixed(2)}x</span>
                    </div>
                    <input 
                      type="range"
                      min="0.8"
                      max="2.0"
                      step="0.05"
                      value={mockScale}
                      onChange={(e) => setMockScale(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>ОТДАЛИТЬ (0.8x)</span>
                      <span>ПРИБЛИЗИТЬ (2.0x)</span>
                    </div>
                  </div>
                </div>

                {/* Live Info card */}
                <div className="p-4.5 bg-indigo-50/50 dark:bg-slate-900/60 rounded-2xl border border-indigo-100/50 dark:border-indigo-950/45 text-xs text-indigo-805 dark:text-indigo-305 space-y-1.5 leading-relaxed">
                  <p className="font-extrabold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                    <span>Совет по 3D-макету:</span>
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Макет отображается в реальном времени под прямым освещением («в фокусе»). Вы можете детально изучить зазоры под пружинную брошюровку, глазурованный блеск глянцевой текстуры и угол наклона листов перед проведением платежа.
                  </p>
                </div>
              </div>

            </div>

            {/* Footer with actions */}
            <div className="p-4 border-t border-slate-150 dark:border-slate-850 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-950/45 shrink-0">
              <button
                onClick={() => {
                  setMockRotateX(25);
                  setMockRotateY(15);
                  setMockScale(1.2);
                }}
                className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-850 text-xs font-bold transition-all cursor-pointer text-slate-650 dark:text-slate-350"
              >
                Сбросить вращение
              </button>
              <button
                onClick={() => setShow3DMockupModal(false)}
                className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs transition-colors cursor-pointer shadow-md shadow-indigo-600/10"
              >
                Готово, вернуться к заказу
              </button>
            </div>
          </div>
        </div>
      )}
      {payingOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden text-left transform transition-all relative">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">ЗАКАЗ В ОБРАБОТКЕ: <strong>{payingOrder.id}</strong></span>
              </div>
              <button
                onClick={() => setPayingOrder(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold text-lg"
              >
                &times;
              </button>
            </div>

            <div className="p-6 text-center space-y-6">
              {/* Graphic Pulsing Icon */}
              <div className="mx-auto w-16 h-16 bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200/50 dark:border-emerald-900/50 text-emerald-500 rounded-full flex items-center justify-center animate-pulse shadow-md">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              {/* Text info */}
              <div className="space-y-2">
                <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wide">Заказ принят на обработку!</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                  Ваш заказ успешно принят. Мы уже получили файлы и начинаем предпечатную подготовку оборудования на Северном шоссе, 18.
                </p>
                <p className="text-xs text-indigo-650 dark:text-indigo-400 font-black">
                  Вам придет уведомление в чате и пуш-уведомление, как только оператор приступит к печати.
                </p>
              </div>

              {/* Order Details Briefing */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-150 dark:border-slate-850 text-left text-xs space-y-2 font-semibold">
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-850 pb-1.5 text-slate-400">
                  <span>Номер заказа:</span>
                  <strong className="text-slate-700 dark:text-slate-300">{payingOrder.id}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-850 pb-1.5 text-slate-400">
                  <span>Стоимость:</span>
                  <strong className="text-slate-800 dark:text-white">₽{payingOrder.totalCost}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-850 pb-1.5 text-slate-400">
                  <span>Бумага:</span>
                  <strong className="text-slate-700 dark:text-slate-300 uppercase">{payingOrder.paperType}</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Цветность:</span>
                  <strong className="text-slate-700 dark:text-slate-300">{payingOrder.printColor === 'bw' ? 'Черно-белая' : 'Цветная'}</strong>
                </div>
              </div>

              {/* Back Button */}
              <button
                type="button"
                onClick={() => setPayingOrder(null)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Вернуться назад</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CUSTOM SELF DELETE CONFIRMATION MODAL */}
      {showSelfDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-150 dark:border-slate-850 shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500 dark:text-rose-400 mb-4">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-100/50 dark:border-rose-900/35">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white">Удаление аккаунта</h3>
                <p className="text-[10px] text-slate-400 font-bold">Это действие невозможно отменить</p>
              </div>
            </div>

            <div className="space-y-3 my-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80 text-xs text-slate-650 dark:text-slate-300 leading-relaxed font-semibold">
                Вы действительно хотите навсегда удалить ваш личный кабинет и стереть все загруженные файлы?
                <p className="mt-2 text-rose-600 dark:text-rose-400 font-extrabold">
                  &bull; Вы потеряете доступ к истории заказов и активной переписке с печатным центром.
                </p>
              </div>
              {selfDeleteError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-xs font-bold text-rose-650 border border-rose-200/50 rounded-xl leading-relaxed">
                  {selfDeleteError}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSelfDeleteModal(false);
                  setSelfDeleteError(null);
                }}
                disabled={isDeletingSelf}
                className="flex-1 py-3 border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-bold transition hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                Отменить
              </button>
              <button
                onClick={confirmDeleteSelf}
                disabled={isDeletingSelf}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/10"
              >
                {isDeletingSelf ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Удалить аккаунт</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFETTI DELIGHT BURST OVERLAY */}
      {confettiActive && (
        <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => {
            const left = Math.random() * 100; // random percentage
            const delay = Math.random() * 1.2;
            const duration = 2.5 + Math.random() * 2.5;
            const size = 5 + Math.random() * 11;
            const rotate = Math.random() * 360;
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f43f5e', '#a855f7'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            return (
              <motion.div
                key={i}
                initial={{ y: -50, x: `${left}vw`, rotate: 0, opacity: 1 }}
                animate={{ 
                  y: '105vh', 
                  x: `${left + (Math.random() * 24 - 12)}vw`, 
                  rotate: rotate + 720, 
                  opacity: [1, 1, 0.8, 0] 
                }}
                transition={{ 
                  duration, 
                  delay, 
                  ease: [0.1, 0.8, 0.3, 1] 
                }}
                style={{
                  position: 'absolute',
                  width: size,
                  height: size * (Math.random() > 0.45 ? 1 : 1.6),
                  backgroundColor: color,
                  borderRadius: Math.random() > 0.5 ? '50%' : '3px',
                }}
              />
            );
          })}
        </div>
      )}

      {/* GIFT PROMO MODAL FOR CLIENT */}
      {/* Онбординг для новых клиентов */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)'}}>
          <div className="w-full max-w-sm glass-panel rounded-3xl p-7 flex flex-col items-center gap-6 animate-fade-in">
            {/* Логотип */}
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-3xl shadow-lg">
              🖨️
            </div>
            <div className="text-center">
              <h2 className="text-xl font-black text-white mb-1">Добро пожаловать!</h2>
              <p className="text-sm text-white/50">Фото-Север — печать онлайн за 3 шага</p>
            </div>

            {/* 3 шага */}
            <div className="w-full space-y-3">
              {[
                { num: '1', icon: '📁', title: 'Загрузите файл', desc: 'Фото, документ, чертёж — любой формат' },
                { num: '2', icon: '💳', title: 'Оплатите онлайн', desc: 'Безопасная оплата через ЮKassa' },
                { num: '3', icon: '✅', title: 'Заберите готовое', desc: 'Северное шоссе, 18 — следите за статусом' },
              ].map(step => (
                <div key={step.num} className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/10">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/30 flex items-center justify-center text-lg shrink-0">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{step.title}</p>
                    <p className="text-white/40 text-[11px]">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                localStorage.setItem('onboarding_seen', '1');
                setShowOnboarding(false);
              }}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm transition-all cursor-pointer"
            >
              Начать — загрузить файл →
            </button>
            <button
              onClick={() => {
                localStorage.setItem('onboarding_seen', '1');
                setShowOnboarding(false);
              }}
              className="text-white/30 text-xs cursor-pointer hover:text-white/50 transition-colors"
            >
              Пропустить
            </button>
          </div>
        </div>
      )}

      {showPromoGiftModal && user.promoCode && (
        <div id="promo-postcard-modal" className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 180 }}
            className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl overflow-hidden max-w-md w-full shadow-2xl relative flex flex-col"
          >
            {/* Christmas/Gift Ribbon Visual Banner */}
            <div className="h-44 relative overflow-hidden bg-slate-100 dark:bg-slate-950">
              <img 
                src="https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=600&auto=format&fit=crop" 
                alt="Подарочная упаковка" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
              
              <div className="absolute bottom-4 left-5 right-5 flex justify-between items-end">
                <span className="bg-emerald-500 text-white text-[10px] uppercase font-black px-2.5 py-1 rounded-full border border-emerald-400/40 tracking-wider">
                  Персональный Подарок 🎁
                </span>
                <span className="font-mono text-xs text-white/70 font-semibold">Копи-точка А4 / А3</span>
              </div>

              {/* Floating absolute decorative absolute shapes */}
              <div className="absolute top-3 left-4 text-xl animate-bounce">🎁</div>
              <div className="absolute top-2 right-4 text-lg animate-bounce delay-150">🎉</div>
            </div>

            {/* Postcard Body */}
            <div className="p-6 sm:p-8 space-y-5 text-center">
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-slate-850 dark:text-white uppercase tracking-wider font-sans">
                  Праздничная Открытка!
                </h3>
                <p className="text-xs text-slate-400 font-bold">
                  Специально для пользователя: <span className="text-slate-700 dark:text-slate-200">{user.fullName}</span>
                </p>
              </div>

              <div className="border-t border-dashed border-slate-200 dark:border-slate-800 my-1" />

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
                Администратор нашего копи-центра приготовил для Вас уникальный подарок в благодарность за доверие к нашему сервису!
              </p>

              {/* Glowing Coupon Display */}
              <div className="bg-emerald-50/20 dark:bg-emerald-950/15 border border-dashed border-emerald-500/30 rounded-2xl p-5 space-y-3 relative overflow-hidden">
                <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 tracking-widest block uppercase">Ваш личный промокод:</span>
                
                <h2 className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-widest bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 py-2.5 px-4 rounded-xl shadow-xs inline-block">
                  {user.promoCode}
                </h2>

                <div className="text-[11px] font-black text-emerald-650 bg-emerald-50 dark:bg-emerald-900/30 py-1.5 px-3 rounded-xl border border-emerald-500/10 inline-flex items-center gap-1.5">
                  Скидка на все услуги печати: <span className="text-sm font-extrabold text-amber-500">-{user.promoDiscount}%</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                Скопируйте промокод и примените его при оформлении следующего заказа, чтобы применить скидку в {user.promoDiscount}%!
              </p>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => handleDismissPromoGift(false)}
                  className="py-3 px-4 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-705 dark:text-slate-300 rounded-2xl transition cursor-pointer"
                >
                  Просто закрыть
                </button>
                <button
                  onClick={() => handleDismissPromoGift(true)}
                  className="py-3 px-4 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg shadow-emerald-600/15 transition cursor-pointer"
                >
                  🎁 Скопировать и применить!
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}

      {/* TORN PAPER PROMO CODE EFFECT OVERLAY */}
      {showTornPaperAnimation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 z-[10000] overflow-hidden">
          {/* Confetti or dust particles from tearing */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 30 }).map((_, i) => {
              const angle = Math.random() * Math.PI * 2;
              const distance = 100 + Math.random() * 200;
              const delay = 0.2 + Math.random() * 0.4;
              return (
                <motion.div
                  key={i}
                  initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                  animate={{ 
                    x: Math.cos(angle) * distance, 
                    y: Math.sin(angle) * distance + 50, 
                    scale: 0, 
                    opacity: 0,
                    rotate: 360 
                  }}
                  transition={{ duration: 1.5, delay, ease: "easeOut" }}
                  className="absolute left-1/2 top-1/2 w-2 h-2 rounded-sm bg-[#faf9f5]"
                  style={{ transform: 'translate(-50%, -50%)' }}
                />
              );
            })}
          </div>

          <div className="text-center space-y-4 mb-10 z-10">
            <motion.h3 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl sm:text-2xl font-black text-rose-500 uppercase tracking-widest"
            >
              ✂️ Промокод успешно использован!
            </motion.h3>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-white/70 text-xs font-semibold max-w-xs mx-auto"
            >
              Ваш персональный купон разрывается, скидка зафиксирована в заказе! Повторное применение заблокировано.
            </motion.p>
          </div>

          {/* Ticket Wrapper */}
          <div className="relative w-full max-w-sm h-64 flex justify-between gap-1 select-none overflow-hidden pr-2">
            
            {/* LEFT HALF */}
            <motion.div
              initial={{ x: 0, rotate: 0, opacity: 1 }}
              animate={{ x: -160, rotate: -12, opacity: 0 }}
              transition={{ duration: 1.4, ease: [0.36, 0, 0.66, -0.1], delay: 0.5 }}
              className="w-1/2 h-full bg-[#fcfbfa] dark:bg-slate-900 border-y border-l border-dashed border-rose-500/30 rounded-l-3xl p-6 relative flex flex-col justify-between overflow-hidden shadow-2xl"
            >
              {/* Decorative side punch notch */}
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-black rounded-full"></div>
              
              <div className="space-y-2">
                <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Активация</div>
                <div className="text-2xl font-black text-slate-850 dark:text-slate-205 font-mono">
                  {tornPromoCode.slice(0, Math.ceil(tornPromoCode.length / 2))}
                </div>
              </div>

              <div className="text-[10px] font-bold text-slate-450 font-mono">
                КОПИ-ЦЕНТР
              </div>

              {/* Ripped Edge inside Right Margin */}
              <div className="absolute right-0 top-0 bottom-0 w-2 flex flex-col justify-between overflow-hidden pointer-events-none">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="w-4 h-4 bg-black rounded-full -mr-3" />
                ))}
              </div>
            </motion.div>

            {/* RIGHT HALF */}
            <motion.div
              initial={{ x: 0, rotate: 0, opacity: 1 }}
              animate={{ x: 160, rotate: 12, opacity: 0 }}
              transition={{ duration: 1.4, ease: [0.36, 0, 0.66, -0.1], delay: 0.5 }}
              className="w-1/2 h-full bg-[#fcfbfa] dark:bg-slate-900 border-y border-r border-dashed border-rose-500/30 rounded-r-3xl p-6 relative flex flex-col justify-between overflow-hidden shadow-2xl"
            >
              {/* Decorative side punch notch */}
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-black rounded-full"></div>
              
              <div className="space-y-2 text-right">
                <div className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Скидка</div>
                <div className="text-2xl font-black text-slate-850 dark:text-slate-205 font-mono">
                  {tornPromoCode.slice(Math.ceil(tornPromoCode.length / 2))}
                </div>
              </div>

              <div className="text-[10px] font-black text-emerald-650 font-mono text-right">
                -ОДОБРЕНО-
              </div>

              {/* Ripped Edge inside Left Margin */}
              <div className="absolute left-0 top-0 bottom-0 w-2 flex flex-col justify-between overflow-hidden pointer-events-none">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="w-4 h-4 bg-black rounded-full -ml-3" />
                ))}
              </div>
            </motion.div>

          </div>

          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8 }}
            onClick={() => setShowTornPaperAnimation(false)}
            className="mt-10 px-8 py-3 bg-white hover:bg-slate-50 text-slate-900 text-xs font-black rounded-2xl shadow-lg cursor-pointer transform hover:scale-[1.03] transition z-10"
          >
            Отлично, продолжить 👍
          </motion.button>
        </div>
      )}

      {/* Interactive Compliance Documents Modal */}
      {activeLegalDoc && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 md:p-8 flex flex-col max-h-[85vh] border border-slate-150 dark:border-slate-800 shadow-2xl relative">
            <button 
              onClick={() => setActiveLegalDoc(null)} 
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-450 dark:text-slate-400 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-850 dark:text-white border-b border-slate-100 dark:border-slate-850 pb-3 mb-4 select-none text-left">
              {activeLegalDoc === 'privacy' && 'Политика конфиденциальности (152-ФЗ РФ)'}
              {activeLegalDoc === 'terms' && 'Договор публичной оферты'}
              {activeLegalDoc === 'delivery' && 'Условия оплаты, доставки и возврата средств'}
            </h2>
            
            <div className="overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium md:pr-2 text-left">
              {activeLegalDoc === 'privacy' && (
                <>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">1. Общие положения</p>
                  <p>Настоящая политика обработки персональных данных составлена в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных» и определяет порядок обработки персональных данных и меры по осуществлению безопасности персональных данных ИП Оганнисян Д.В. (Фото-Север).</p>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">2. Собираемые данные</p>
                  <p>Мы обрабатываем исключительно данные, необходимые для авторизации и доставки выполненных заказов печати: ФИО, номер телефона, адрес электронной почты, отправляемые к печати файлы, детали параметров печати.</p>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">3. Цели сбора</p>
                  <p>Персональные данные Пользователя обрабатываются для идентификации клиента, отправки оповещений о готовности через встроенный пуш-интерфейс, выполнения логистики и расчетов в соответствии с правилами Visa, MasterCard и МИР.</p>
                </>
              )}
              {activeLegalDoc === 'terms' && (
                <>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">Публичная оферта на оказание услуг фотопечати и полиграфии</p>
                  <p>Данный документ является официальным предложением (публичной офертой) ИП Оганнисян Д.В. и содержит все существенные условия по предоставлению услуг распечатки документов различных типов и широкоформатной фотопечати через удаленную систему On-line заказов.</p>
                  <p>Акцептом данной оферты признается создание заказа, загрузка файлов и произведение оплаты на сайте с использованием встроенных расчетных шлюзов банков ( acquiring ).</p>
                  <p>Исполнитель обязуется напечатать предоставленные файлы СТРОГО в соответствии со спецификацией и качеством, согласованными в системе заказа. Оплата услуг производится в российских рублях.</p>
                </>
              )}
              {activeLegalDoc === 'delivery' && (
                <>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">1. Способы оплаты заказа</p>
                  <p>Оплата заказов осуществляется через Сертифицированный банковский эквайринг (МИР, Visa, MasterCard) после подтверждения характеристик файла. Опционально возможна быстрая оплата на кассе или через СБП QR в пункте выдачи.</p>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">2. Условия выдачи и доставки</p>
                  <p>Выдача заказов производится по адресу: Вологда, Северное шоссе, д. 18. Возможна курьерская доставка по согласованию с оператором.</p>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">3. Политика отмены и возврата денежных средств</p>
                  <p>Клиент вправе отменить заказ до момента его ухода в производство с полной компенсацией средств. В случае обнаружения дефектов печати или несовпадения с заданными параметрами, Копи-Центр обязуется осуществить повторную бесплатную печать либо инициировать полный возврат на банковскую карту плательщика в течении 1 рабочего дня (срок зачисления банка составляет от 1 до 3 рабочих дней).</p>
                </>
              )}
            </div>
            
            <button 
              onClick={() => setActiveLegalDoc(null)} 
              className="mt-6 w-full py-3 bg-slate-900 hover:bg-slate-850 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-white rounded-2xl cursor-pointer"
            >
              Понятно, закрыть
            </button>
          </div>
        </div>
      )}

          {/* ── CONTACTS TAB ── */}
          {activeTab === 'contacts' && (
          <motion.div
            key="contacts"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.22 }}
            className="space-y-5 pb-8 md:overflow-y-auto md:flex-1 min-h-0 pr-1 w-full overflow-x-hidden"
          >
            <div className="mb-6">
              <h2 className="text-xl font-black text-white mb-1">Контакты студии</h2>
              <p className="text-sm text-slate-400">Мы всегда рады помочь вам!</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="glass-panel rounded-2xl p-5 flex gap-4 items-start">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Адрес</p>
                <p className="text-white font-bold text-base">Северное шоссе, 18</p>
                <p className="text-slate-400 text-sm">Раменское, Московская область</p>
                <a href="https://yandex.ru/maps/?text=Раменское+Северное+шоссе+18" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold">
                  Открыть на карте →
                </a>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-5 flex gap-4 items-start">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Телефон</p>
                <a href="tel:+79680508800" className="text-white font-bold text-base hover:text-emerald-400 transition-colors">
                  +7 (968) 050-88-00
                </a>
                <p className="text-slate-400 text-sm mt-0.5">Звонки и WhatsApp</p>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-5 flex gap-4 items-start">
              <div className="w-11 h-11 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Telegram</p>
                <a href="https://t.me/photosever18" target="_blank" rel="noopener noreferrer" className="text-white font-bold text-base hover:text-sky-400 transition-colors">
                  @photosever18
                </a>
                <p className="text-slate-400 text-sm mt-0.5">Пишите в любое время</p>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-5 flex gap-4 items-start">
              <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div className="w-full">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">Часы работы</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 text-sm">Понедельник — Пятница</span>
                    <span className="text-white font-bold text-sm">9:00 — 19:00</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 text-sm">Суббота</span>
                    <span className="text-white font-bold text-sm">10:00 — 19:00</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 text-sm">Воскресенье</span>
                    <span className="text-white font-bold text-sm">10:00 — 19:00</span>
                  </div>
                </div>
              </div>
            </div>
            </div>

            <a href="tel:+79680508800" className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm hover:opacity-90 transition-opacity">
              <Phone className="w-4 h-4" />
              Позвонить нам
            </a>

          </motion.div>
          )}

          {/* ── SERVICES TAB ── */}
          {activeTab === 'services' && (
          <motion.div
            key="services"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.22 }}
            className="space-y-5 pb-8 md:overflow-y-auto md:flex-1 min-h-0 pr-1 w-full overflow-x-hidden"
          >
            <div className="mb-6">
              <h2 className="text-xl font-black text-white mb-1">Наши услуги</h2>
              <p className="text-sm text-slate-400">Всё что мы делаем в Фото-Север на Северном шоссе, 18</p>
            </div>

            {(!database.services || database.services.filter(s => s.isActive).length === 0) && (
              <div className="text-center py-16 text-slate-400">
                <Printer className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold">Витрина услуг пока пуста</p>
                <p className="text-sm mt-1">Скоро здесь появятся все наши услуги</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {(database.services || [])
                .filter(s => s.isActive)
                .map(svc => {
                  // Генерируем 3D SVG иконку по эмодзи/названию
                  const get3DIcon = (emoji: string, title: string) => {
                    const t = title.toLowerCase();
                    const e = emoji;
                    // Фото на документы
                    if ((t.includes('фото') && (t.includes('докум') || t.includes('документ'))) || e === '🪪' || e === '📷') return (
                      <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 8px 16px rgba(168,85,247,0.35))'}}>
                        <defs>
                          <linearGradient id={`g2-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#c084fc"/><stop offset="100%" stopColor="#a855f7"/></linearGradient>
                          <linearGradient id={`g2t-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#e9d5ff"/><stop offset="100%" stopColor="#c084fc"/></linearGradient>
                        </defs>
                        <ellipse cx="40" cy="74" rx="20" ry="4" fill="rgba(168,85,247,0.2)"/>
                        <rect x="10" y="38" width="60" height="24" rx="10" fill="#7c3aed"/>
                        <rect x="10" y="26" width="60" height="20" rx="10" fill={`url(#g2-${svc.id})`}/>
                        <rect x="28" y="20" width="20" height="10" rx="5" fill={`url(#g2t-${svc.id})`}/>
                        <circle cx="40" cy="38" r="14" fill="#1e1b4b"/>
                        <circle cx="40" cy="38" r="10" fill="#0f0a2e"/>
                        <circle cx="40" cy="38" r="6" fill="#312e81"/>
                        <circle cx="37" cy="35" r="2.5" fill="rgba(255,255,255,0.45)"/>
                        <rect x="54" y="29" width="8" height="5" rx="2.5" fill="rgba(255,255,255,0.5)"/>
                        <rect x="14" y="28" width="28" height="5" rx="3" fill="rgba(255,255,255,0.22)"/>
                      </svg>
                    );
                    if (t.includes('переплёт') || t.includes('переплет') || t.includes('binding') || e === '📎' || e === '📚') return (
                      <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 8px 16px rgba(249,115,22,0.35))'}}>
                        <defs>
                          <linearGradient id={`g3-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fb923c"/><stop offset="100%" stopColor="#f97316"/></linearGradient>
                        </defs>
                        <ellipse cx="40" cy="74" rx="20" ry="4" fill="rgba(249,115,22,0.2)"/>
                        <rect x="22" y="16" width="44" height="52" rx="4" fill="#fef3c7"/>
                        <rect x="14" y="12" width="52" height="54" rx="6" fill={`url(#g3-${svc.id})`}/>
                        <rect x="56" y="16" width="6" height="46" rx="2" fill="#fef9c3"/>
                        <rect x="24" y="24" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/>
                        <rect x="24" y="31" width="18" height="2" rx="1" fill="rgba(255,255,255,0.35)"/>
                        <rect x="24" y="37" width="22" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
                        <circle cx="20" cy="26" r="4" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
                        <circle cx="20" cy="36" r="4" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
                        <circle cx="20" cy="46" r="4" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
                        <circle cx="20" cy="56" r="4" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
                        <rect x="18" y="14" width="28" height="7" rx="3.5" fill="rgba(255,255,255,0.28)"/>
                      </svg>
                    );
                    if (t.includes('скан') || e === '🔍' || e === '📠') return (
                      <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 8px 16px rgba(16,185,129,0.35))'}}>
                        <defs>
                          <linearGradient id={`g4-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#34d399"/><stop offset="100%" stopColor="#10b981"/></linearGradient>
                          <linearGradient id={`g4scan-${svc.id}`} x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="rgba(52,211,153,0)"/><stop offset="50%" stopColor="rgba(52,211,153,0.7)"/><stop offset="100%" stopColor="rgba(52,211,153,0)"/></linearGradient>
                        </defs>
                        <ellipse cx="40" cy="74" rx="20" ry="4" fill="rgba(16,185,129,0.2)"/>
                        <rect x="12" y="50" width="56" height="14" rx="7" fill="#065f46"/>
                        <rect x="12" y="44" width="56" height="12" rx="7" fill={`url(#g4-${svc.id})`}/>
                        <rect x="16" y="16" width="48" height="34" rx="5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="1"/>
                        <rect x="22" y="20" width="36" height="26" rx="3" fill="white" opacity="0.9"/>
                        <rect x="26" y="24" width="20" height="2" rx="1" fill="#bfdbfe"/>
                        <rect x="26" y="28" width="24" height="2" rx="1" fill="#bfdbfe"/>
                        <rect x="26" y="32" width="16" height="2" rx="1" fill="#bfdbfe"/>
                        <rect x="16" y="30" width="48" height="3" rx="1.5" fill={`url(#g4scan-${svc.id})`}><animate attributeName="y" values="20;44;20" dur="2s" repeatCount="indefinite"/></rect>
                        <circle cx="62" cy="50" r="4" fill="#34d399"/>
                        <rect x="16" y="44" width="26" height="5" rx="2.5" fill="rgba(255,255,255,0.28)"/>
                      </svg>
                    );
                    // Default — принтер синий
                    return (
                      <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 8px 16px rgba(59,130,246,0.35))'}}>
                        <defs>
                          <linearGradient id={`g1-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#60a5fa"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient>
                          <linearGradient id={`g1t-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#93c5fd"/><stop offset="100%" stopColor="#60a5fa"/></linearGradient>
                        </defs>
                        <ellipse cx="40" cy="74" rx="20" ry="4" fill="rgba(59,130,246,0.2)"/>
                        <rect x="14" y="36" width="52" height="26" rx="8" fill="#1d4ed8"/>
                        <rect x="14" y="28" width="52" height="16" rx="8" fill={`url(#g1-${svc.id})`}/>
                        <rect x="16" y="26" width="48" height="10" rx="6" fill={`url(#g1t-${svc.id})`}/>
                        <rect x="30" y="10" width="20" height="24" rx="3" fill="white" opacity="0.95"/>
                        <rect x="34" y="14" width="12" height="2" rx="1" fill="#bfdbfe"/>
                        <rect x="34" y="18" width="9" height="2" rx="1" fill="#bfdbfe"/>
                        <rect x="34" y="22" width="11" height="2" rx="1" fill="#bfdbfe"/>
                        <rect x="24" y="38" width="32" height="4" rx="2" fill="rgba(0,0,0,0.2)"/>
                        <circle cx="54" cy="32" r="3" fill="#34d399"/>
                        <circle cx="62" cy="32" r="3" fill="rgba(255,255,255,0.3)"/>
                        <rect x="18" y="28" width="26" height="5" rx="3" fill="rgba(255,255,255,0.28)"/>
                      </svg>
                    );
                  };

                  return (
                    <div
                      key={svc.id}
                      className="group relative overflow-hidden cursor-pointer select-none"
                      style={{
                        background: '#fff',
                        borderRadius: '20px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                        transition: 'transform 0.3s cubic-bezier(0.34,1.4,0.64,1), box-shadow 0.3s',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-6px) scale(1.02)';
                        (e.currentTarget as HTMLElement).style.boxShadow = '0 20px 50px rgba(0,0,0,0.15)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.transform = '';
                        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)';
                      }}
                    >
                      {/* Картинка сверху */}
                      <div style={{
                        height: 160,
                        overflow: 'hidden',
                        borderRadius: '20px 20px 0 0',
                        background: 'linear-gradient(135deg,#f0f4ff,#e8eeff)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {svc.imageUrl ? (
                          <img src={svc.imageUrl} alt={svc.title}
                            style={{width:'100%',height:'100%',objectFit:'cover'}}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }}
                          />
                        ) : (
                          <div style={{transform:'scale(1.1)'}}>{get3DIcon(svc.emoji, svc.title)}</div>
                        )}
                      </div>

                      {/* Название и описание */}
                      <div style={{padding:'12px 14px 8px',background:'#fff'}}>
                        <p style={{fontWeight:800,fontSize:13,color:'#1e293b',margin:'0 0 3px',lineHeight:1.2}}>{svc.title}</p>
                        <p style={{fontSize:11,color:'#94a3b8',margin:0,lineHeight:1.4}}>
                          {svc.description?.slice(0,50)}{(svc.description?.length||0) > 50 ? '...' : ''}
                        </p>
                      </div>

                      {/* Hover drawer — выезжает снизу */}
                      <div
                        style={{
                          overflow: 'hidden',
                          maxHeight: 0,
                          transition: 'max-height 0.35s cubic-bezier(0.34,1.2,0.64,1)',
                          background: '#fff',
                          borderRadius: '0 0 20px 20px',
                          borderTop: '1px solid #f1f5f9',
                        }}
                        className="service-card-drawer"
                      >
                        <div style={{padding:'8px 14px 14px'}}>
                          <p style={{fontWeight:900,fontSize:20,color:'#6366f1',margin:'0 0 8px'}}>{svc.price}</p>
                          <button
                            onClick={() => {
                              const priceNum = parseInt(svc.price.replace(/[^0-9]/g, ''), 10) || 0;
                              setSelectedService({ title: svc.title, price: priceNum });
                              setNotes(`Услуга: ${svc.title} — ${svc.price}`);
                              setActiveTab('upload');
                            }}
                            style={{
                              width:'100%', padding:'9px',
                              background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
                              border:'none', borderRadius:'10px',
                              color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer',
                            }}
                          >Заказать →</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </motion.div>
          )}



    {/* Sticky кнопки звонка и Telegram — только на мобильном */}
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 md:hidden">
      <a
        href="https://t.me/photosever_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{background: 'linear-gradient(135deg, #2AABEE, #229ED9)'}}
        title="Написать в Telegram"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.01 9.47c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.873.75z"/>
        </svg>
      </a>
      <a
        href="tel:+79680508800"
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{background: 'linear-gradient(135deg, #4ade80, #16a34a)'}}
        title="Позвонить"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
        </svg>
      </a>
    </div>

    </div>
  );
}
