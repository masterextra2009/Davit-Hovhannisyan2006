/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { User, Order, ChatMessage, Notification, PrintFile, FileFormatGroup, PaymentStatus, OrderStatus, Service } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { LiveClock } from './LiveClock';
import { RatingWidget } from './RatingWidget';
import { UserAvatar } from './UserAvatar';
import { EmojiPicker } from './EmojiPicker';
import { AnimatedTitle } from './AnimatedTitle';
import { AiPriceCard } from './AiPriceCard';
import homeWallpaperDark from '../assets/home-wallpaper-dark.jpg';
import homeWallpaperLight from '../assets/home-wallpaper-light.jpg';
import JSZip from 'jszip';
import logoImg from '../assets/logo.webp';
import printerInkIcon from '../assets/printer-ink-icon.svg';
import chatIconRefImg from '../assets/chat-icon-ref-cropped.webp';
import polaroidIconRefImg from '../assets/polaroid-icon-ref.webp';
import scanIconRefImg from '../assets/scan-icon-ref.webp';
import photoIconRefImg from '../assets/photo-icon-ref.webp';
import documentsIconRefImg from '../assets/documents-icon-ref.webp';
import a3IconRefImg from '../assets/a3-icon-ref.webp';
import ordersIconRefImg from '../assets/orders-icon-ref.webp';
import laminationIconRefImg from '../assets/lamination-icon-ref.webp';
import servicesIconRefImg from '../assets/services-icon-ref.webp';
import profileIconRefImg from '../assets/profile-icon-ref.webp';
import notifyIconRefImg from '../assets/notify-icon-ref.webp';
import callIconRefImg from '../assets/call-icon-ref.webp';
import settingsIconRefImg from '../assets/settings-icon-ref.webp';
import aiAssistantCoinWebm from '../assets/ai-assistant-coin.webm';
import aiAssistantCoinMp4 from '../assets/ai-assistant-coin.mp4';
import polaroidCameraAnim from '../assets/polaroid-camera.webp';
import a3ChertyozhAnim from '../assets/a3-chertyozh.mp4';
import a3PhotoAnim from '../assets/a3-photo.mp4';
import bindingSpringMetalAnim from '../assets/binding-spring-metal.mp4';
import bindingSpringPlasticAnim from '../assets/binding-spring-plastic.mp4';
import docCheckIconRefImg from '../assets/doc-check-icon-ref.webp';
import {
  FileText, Upload, Trash2, MapPin, Sliders, FileType, CheckCircle, Clock, 
  Send, MessageSquare, AlertCircle, Sparkles, CreditCard, Shield, Mic, Volume2, VolumeX,
  FileCheck, LogOut, Check, ArrowDown, Bell, HelpCircle, Laptop, ArrowLeft,
  Layers, RefreshCw, Smartphone, Phone, Star, Trophy, Award, Share2, Copy, Mail, Gift,
  Maximize2, Eye, ZoomIn, ZoomOut, RotateCw, Printer, X, Camera, Search
} from 'lucide-react';
import { 
  calculateOrderCost, getFileFormatGroup, formatFileSize, 
  formatDateTime, getStatusLabel, getStatusColor, 
  getPaymentStatusLabel, getPaymentStatusColor, printInvoiceHTML,
  getClientTierForUser, isWorkingHours, showBrowserNotification, trackAnalyticsEvent,
  formatServicePrice, sortServicesByGroup
} from '../utils';
import { db, doc, setDoc, storage, ref, uploadBytes, getDownloadURL, auth } from '../firebase';
import { subscribeToPushNotifications, getNextOrderNumber, deleteOrderFromFirebase, deleteNotificationFromFirebase, sendFeedbackToFirebase, generateReferralCode, registerReferralCode } from '../firebaseUtils';
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

// Резервный подсчёт страниц PDF через сырой regex-скан байтов файла.
// Не видит /Count, если он лежит внутри сжатого потока объектов (ObjStm) —
// используется только если pdf.js не смог разобрать файл (например, повреждённый PDF).
function countPdfPagesFallback(arrayBuffer: ArrayBuffer): number {
  const textDecoder = new TextDecoder('utf-8');
  const text = textDecoder.decode(new Uint8Array(arrayBuffer));
  const pagesMatches = text.match(/\/Type\s*\/Pages\s*\/Count\s*(\d+)/g);
  if (pagesMatches && pagesMatches.length > 0) {
    const counts = pagesMatches.map(m => {
      const numMatch = m.match(/\d+/);
      return numMatch ? parseInt(numMatch[0], 10) : 1;
    });
    return Math.max(...counts);
  }
  const countMatches = text.match(/\/Count\s*(\d+)/g);
  if (countMatches && countMatches.length > 0) {
    const counts = countMatches.map(m => {
      const numMatch = m.match(/\d+/);
      return numMatch ? parseInt(numMatch[0], 10) : 1;
    }).filter(c => c < 100000);
    if (counts.length > 0) {
      return Math.max(...counts);
    }
  }
  return 1;
}

// Подсчёт страниц PDF через pdf.js (тот же движок, что рендерит PDF в Chrome/Firefox) —
// в отличие от regex-скана корректно читает и PDF со сжатыми потоками объектов
// (ObjStm/XRefStm), которые regex-версия молча принимала за "1 страницу" и занижала цену.
// Библиотека грузится динамически, только когда клиент реально загружает PDF-файл,
// чтобы не раздувать общий бандл для остальных посетителей.
async function countPdfPages(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
    return pdf.numPages;
  } catch (err) {
    console.warn('pdf.js page count failed, falling back to regex scan:', err);
    try {
      return countPdfPagesFallback(arrayBuffer);
    } catch (fallbackErr) {
      console.warn('PDF Count pages error:', fallbackErr);
      return 1;
    }
  }
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
          // Считаем ЛЮБОЙ пиксель, который не близок к чистому белому листу,
          // как расход чернил — раньше здесь мерялась именно "цветастость"
          // (насыщенность), из-за чего сплошные фото с большой долей светлых
          // бликов/тонких тонов кожи (низкая насыщенность, но чернила всё
          // равно расходуются) занижали итоговый процент заливки.
          const brightness = (r + g + b) / (3 * 255);
          if (brightness < 0.94) coloredPixels++;
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

// А3-прайс (цены от 2026-07-19): "Чертёж" — Ч/Б или Цвет на офисной бумаге,
// цена зависит от плотности (80/200 г/м²); "Фото" — фотобумага 200г,
// глянец/матовая без разницы в цене, фиксированные 250₽ за лист.
function a3FilePrice(file: PrintFile): number {
  if (file.a3Kind === 'photo') return 250;
  const isColor = (file.printColor || 'bw') === 'color';
  const is200g = file.a3PaperWeight === '200';
  if (isColor) return is200g ? 150 : 100;
  return is200g ? 100 : 70;
}

// Наценка за отделку (за один комплект копий), см. calculateOrderCost в utils.ts —
// та же формула, продублирована здесь т.к. чек в форме заказа считается
// напрямую из per-file полей, а не через тот калькулятор.
// Прайс на пружину — по факту из "Витрины услуг" (карточки "Брошюровка А4",
// 2026-07-26): металл — до 50 стр. 350₽, до 90 стр. 450₽; пластик — до 50 стр.
// 250₽, свыше 90 стр. 550₽. Промежуток 51-90 стр. для пластика в прайсе пока
// не указан отдельно — держим ставку "до 50" (безопаснее занизить, чем
// выдумать цифру), поправить, когда админ добавит недостающую ступень.
function bindingFeePerCopy(binding: 'none' | 'staple' | 'file' | 'spring_plastic' | 'spring_metal' | 'hard_cover', totalPages: number): number {
  if (binding === 'staple') return 15;
  if (binding === 'file') return 5;
  if (binding === 'spring_metal') return totalPages <= 50 ? 350 : 450;
  if (binding === 'spring_plastic') return totalPages <= 90 ? 250 : 550;
  if (binding === 'hard_cover') return 450;
  return 0;
}

// Цена одной копии для формата "binding" (плитка "Брошюровка" на Главной) —
// та же ставка за пружину, что и в bindingFeePerCopy выше, просто по
// pageCount самого файла вместо суммы всех файлов заказа.
function bindingFilePrice(file: PrintFile): number {
  if (!file.bindingKind) return 0;
  return bindingFeePerCopy(file.bindingKind, file.pageCount || 1);
}

// На нестабильной (особенно мобильной) сети запрос может зависнуть без ошибки
// и без ответа — обрываем его по таймауту, чтобы UI не застревал навсегда.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// Черновик незавершённой загрузки — переживает обновление страницы (F5)
const UPLOAD_DRAFT_KEY = 'print_shop_upload_draft';
function loadUploadDraft(): PrintFile[] {
  try {
    const saved = sessionStorage.getItem(UPLOAD_DRAFT_KEY);
    if (!saved) return [];
    const parsed: PrintFile[] = JSON.parse(saved);
    // blob-ссылки на превью не переживают перезагрузку — используем ссылку из облака вместо них
    return parsed.map(f => ({ ...f, previewUrl: f.url || undefined }));
  } catch {
    return [];
  }
}

interface DashboardProps {
  user: User;
  onLogout: () => void;
  database: {
    users: User[];
    orders: Order[];
    chatMessages: ChatMessage[];
    notifications: Notification[];
    services?: Service[];
  };
  onUpdateDatabase: (updatedData: {
    orders?: Order[];
    chatMessages?: ChatMessage[];
    notifications?: Notification[];
    users?: User[];
  }) => void;
  onDeleteAccount: (userId: string) => void;
  hasSyncedFromServer?: boolean;
  // Открыть кабинет сразу на нужной вкладке (например, из PWA-ярлыка на иконке
  // приложения — see manifest.json "shortcuts"). Приоритетнее сохранённого
  // состояния навигации в sessionStorage, но задаётся только один раз при
  // самом первом рендере компонента.
  initialTab?: 'upload' | 'orders' | 'chat' | 'profile' | 'contacts' | 'services';
}

// Иконки для стеклянных плиток "Главной" — точные пути из ТЗ (tz-fable-glass-icons-final.md,
// часть 3). Не заменять на похожие из lucide-react — эти утверждены явно.
function GlassPrintIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={servicesIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassA3RefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={a3IconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassOrdersRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={ordersIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassNotifyRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={notifyIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassCallRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={callIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassSettingsRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={settingsIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassPolaroidIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="3" width="16" height="18" rx="1"/>
      <rect x="6.5" y="5.5" width="11" height="9" rx="0.5"/>
    </svg>
  );
}
function GlassLaminationIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={laminationIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassProfileIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={profileIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassChatIcon(_props: { style?: React.CSSProperties }) {
  // Заливает всю капсулу целиком (не вписывается с отступом, как обычные
  // глифы) — по просьбе клиента, картинка должна занимать всю кнопку.
  return (
    <img
      src={chatIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassPolaroidRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={polaroidIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassDocCheckRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={docCheckIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassScanRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={scanIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassPhotoRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={photoIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassDocumentsRefIcon(_props: { style?: React.CSSProperties }) {
  return (
    <img
      src={documentsIconRefImg}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
function GlassUploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 17V5"/>
      <path d="M7 10l5-5 5 5"/>
      <path d="M5 19h14"/>
    </svg>
  );
}

// Форма нижней панели навигации — вырез под кнопку загрузки как часть контура.
// Ширина панели параметризована (раньше было жёстко 336), чтобы её можно было
// расширять/сужать одной цифрой, не пересчитывая кривые выреза вручную —
// вырез (между c-74 и c+74) всегда остаётся той же формы и центрируется
// относительно центра панели, куда и ставится кнопка (left: 50%).
function navShapePath(w: number) {
  const c = w / 2;
  return `M0,36 Q0,24 12,24 H${c - 74} C${c - 33.3},24 ${c - 40.7},69 ${c},69 C${c + 40.7},69 ${c + 33.3},24 ${c + 74},24 H${w - 12} Q${w},24 ${w},36 V90 H0 Z`;
}

// Стеклянная иконка с бегущим бликом по кромке (см. .glass-icon в index.css).
// Обновлено 2026-07-18 по просьбе клиента — скругление 22.37% повторяет
// реальную форму значков iOS ("squircle", ближайшее приближение через
// border-radius; настоящая суперэллиптическая кривая Apple тут не нужна —
// разница на глаз не видна). Пропорция глифа внутри (96/124) не менялась.
// colored=true красит саму капсулу градиентом по имени glow (см. .capsule-glow-*
// в index.css) — глиф внутри остаётся белым, только фон плитки цветной.
function GlassIcon({ icon: Icon, glow, size = 56, colored = false, noOuterShadow = false }: { icon: typeof Upload; glow?: string; size?: number; colored?: boolean; noOuterShadow?: boolean }) {
  return (
    <span className={`glass-icon${colored ? ` colored ${glow || ''}` : ''}${noOuterShadow ? ' glass-icon-pill' : ''}`} style={{ width: size, height: size, borderRadius: size * 0.2237 }}>
      <span className="beam"><i /></span>
      <Icon
        style={{
          width: size * (96 / 124),
          height: size * (96 / 124),
        }}
      />
    </span>
  );
}

// Крупные часы над плитками "Главной" — как на экране блокировки iPhone
// (время крупным тонким шрифтом, дата под ним). Размер переключается тапом
// по часам, пока активен "режим редактирования" (тот же jiggleMode, что и
// у плиток) — три пресета, как у виджетов на iPhone (там тоже нет свободной
// растяжки, а S/M/L, выбираемые в режиме редактирования).
const CLOCK_SIZES = ['sm', 'md', 'lg'] as const;
type ClockSize = typeof CLOCK_SIZES[number];
const clockSizeClasses: Record<ClockSize, { time: string; date: string }> = {
  sm: { time: 'text-4xl', date: 'text-[12px] mt-1.5' },
  md: { time: 'text-6xl', date: 'text-xs mt-2' },
  lg: { time: 'text-8xl', date: 'text-sm mt-2.5' },
};
function HomeBigClock({ size, resizable, onCycleSize }: { size: ClockSize; resizable: boolean; onCycleSize: () => void }) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateStr = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const cls = clockSizeClasses[size];
  return (
    <div
      onClick={resizable ? onCycleSize : undefined}
      className={`text-center mb-5 select-none transition-transform ${resizable ? 'cursor-pointer active:scale-95 tile-jiggle' : ''}`}
    >
      <div className={`${cls.time} font-thin text-slate-800 dark:text-white tracking-tight leading-none`}>{hh}:{mm}</div>
      <div className={`${cls.date} font-bold text-slate-500 dark:text-slate-400 capitalize`}>{dateStr}</div>
      {resizable && (
        <div className="mt-2 text-[11px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wide">
          Нажмите, чтобы изменить размер
        </div>
      )}
    </div>
  );
}

export function Dashboard({ user, onLogout, database, onUpdateDatabase, onDeleteAccount, hasSyncedFromServer = true, initialTab }: DashboardProps) {
  // На iOS Web Share Target API не поддерживается Safari в принципе (ограничение
  // самой Apple) — "Поделиться" в другое приложение сюда файл не занесёт.
  // Показываем честную подсказку вместо того, чтобы человек ждал автоматики.
  const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Firestore-правила сверяют userId/senderId записей именно с request.auth.uid
  // текущей сессии — читаем его напрямую из Firebase Auth на момент записи,
  // а не из React-пропа user.id, на случай если тот успел устареть (например,
  // после входа через Google без полной перезагрузки страницы) и вызвать
  // "Missing or insufficient permissions" при создании заказа/сообщения.
  const getLiveUserId = () => auth.currentUser?.uid || user.id;

  // Navigation
  // На каком экране клиент был — храним в sessionStorage, чтобы обновление
  // страницы (F5/pull-to-refresh) не сбрасывало его на "Главную" с иконками,
  // а оставляло там же, где он был до обновления (в рамках одной вкладки/сессии).
  const NAV_STATE_KEY = 'nav_state';
  const savedNavState = (() => {
    try { return JSON.parse(sessionStorage.getItem(NAV_STATE_KEY) || 'null'); } catch { return null; }
  })();
  const [activeTab, setActiveTab] = useState<'upload' | 'orders' | 'chat' | 'profile' | 'contacts' | 'services'>(initialTab || savedNavState?.activeTab || 'upload');
  // На телефоне кабинет открывается с отдельного экрана "Главная" (крупные плитки);
  // переход в раздел скрывает плитки и показывает контент activeTab. На десктопе не используется —
  // там сайдбар и контент видны одновременно всегда.
  const [mobileHome, setMobileHome] = useState(initialTab ? false : (savedNavState?.mobileHome ?? true));
  useEffect(() => {
    try { sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify({ activeTab, mobileHome })); } catch {}
  }, [activeTab, mobileHome]);
  // Перестановка плиток на "Главной" зажатием, как на iPhone — порядок
  // хранится персонально на устройстве (localStorage по user.id), ключи
  // плиток не в сохранённом порядке (новые появились после последней
  // перестановки) уходят в конец в исходном порядке между собой.
  const [homeTileOrder, setHomeTileOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`home_tile_order_${user.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [jiggleMode, setJiggleMode] = useState(false);
  const [draggedTileKey, setDraggedTileKey] = useState<string | null>(null);
  const tileLongPressTimerRef = useRef<number | null>(null);
  const tilePressStartRef = useRef<{ x: number; y: number } | null>(null);
  const tileDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [tileDragPos, setTileDragPos] = useState<{ x: number; y: number } | null>(null);
  const edgeFlipTimerRef = useRef<number | null>(null);
  // Плитки "Главной" разбиты на страницы по 9 (3×3), между которыми свайпают
  // пальцем влево/вправо, как между экранами на iPhone — homePageIndex отражает
  // текущую видимую страницу для точек-индикаторов под сеткой.
  const [homePageIndex, setHomePageIndex] = useState(0);
  const homePagesScrollRef = useRef<HTMLDivElement>(null);
  const handleHomePagesScroll = () => {
    const el = homePagesScrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setHomePageIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  // Размер часов на "Главной" — переключается тапом по ним в режиме
  // редактирования (см. HomeBigClock), сохраняется на устройстве как и
  // порядок плиток.
  const [clockSize, setClockSize] = useState<'sm' | 'md' | 'lg'>(() => {
    try {
      const saved = localStorage.getItem(`home_clock_size_${user.id}`);
      return saved === 'sm' || saved === 'md' || saved === 'lg' ? saved : 'md';
    } catch { return 'md'; }
  });
  const cycleClockSize = () => {
    setClockSize(prev => {
      const next = CLOCK_SIZES[(CLOCK_SIZES.indexOf(prev) + 1) % CLOCK_SIZES.length];
      try { localStorage.setItem(`home_clock_size_${user.id}`, next); } catch { /* ignore */ }
      return next;
    });
  };
  // Сколько плиток реально помещается на одну свайп-страницу "Главной" —
  // считаем по факту доступного места (высота экрана минус часы минус
  // отступы), а не фиксированным числом, чтобы при увеличении часов или на
  // маленьком экране плитки не обрезались и не вылезали за пределы страницы.
  const homeAreaRef = useRef<HTMLDivElement>(null);
  const homeClockWrapRef = useRef<HTMLDivElement>(null);
  const [homeTilesPerPage, setHomeTilesPerPage] = useState(9);
  useLayoutEffect(() => {
    const recompute = () => {
      // areaEl.clientHeight раньше "плавал" вместе с содержимым (главный
      // родитель ничем не ограничен по высоте — сам скроллится #client-
      // dashboard-root), так что он не давал реальный бюджет одного экрана:
      // на первом рендере получалось "влезает больше, чем есть", и лишние
      // плитки вылезали под фиксированный нижний док. Меряем от РЕАЛЬНОЙ
      // высоты видимой области (window.innerHeight/visualViewport) минус
      // фактическая позиция начала сетки плиток минус зарезервированное
      // место под неподвижный нижний док.
      const scrollerEl = homePagesScrollRef.current;
      const sampleTileEl = Object.values(homeTileElsRef.current).find((el): el is HTMLElement => !!el);
      if (!scrollerEl || !sampleTileEl) return;
      const TILE_ROW_GAP = 16; // gap-y-4
      // Оба резерва были заметно больше реальных элементов (точки страниц —
      // не 24px, доку хватает своих 90px без лишнего запаса) — из-за этого
      // расчёт терял почти целый ряд плиток и уводил их на вторую страницу
      // даже когда внизу ещё оставалось видимое место.
      const DOTS_RESERVE = 8; // высота полосы точек-индикаторов под страницами
      const DOCK_NAV_RESERVE = 90; // сам док сидит на bottom-0, его высота ровно 90px

      const tileHeight = sampleTileEl.getBoundingClientRect().height;
      if (tileHeight <= 0) return;
      const viewportH = window.visualViewport?.height || window.innerHeight;
      const scrollerTop = scrollerEl.getBoundingClientRect().top;
      const available = viewportH - scrollerTop - DOCK_NAV_RESERVE - DOTS_RESERVE;
      const rows = Math.max(1, Math.floor((available + TILE_ROW_GAP) / (tileHeight + TILE_ROW_GAP)));
      setHomeTilesPerPage(rows * 4);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (homeAreaRef.current) ro.observe(homeAreaRef.current);
    window.addEventListener('resize', recompute);
    // window 'resize' почти никогда не срабатывает на телефоне, когда
    // адресная строка браузера сворачивается/разворачивается при скролле —
    // это меняет именно visualViewport.height. Без этого слушателя расчёт
    // "застревал" на первом (самом маленьком, с развёрнутой адресной строкой)
    // замере на весь сеанс, и плитка, которая реально помещается, уезжала
    // на вторую страницу.
    window.visualViewport?.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
      window.visualViewport?.removeEventListener('resize', recompute);
    };
  }, [clockSize, mobileHome, jiggleMode]);

  const reorderHomeTiles = (allKeys: string[]) => {
    setHomeTileOrder(prev => {
      // Первый вход в перестановку — фиксируем текущий (дефолтный) порядок,
      // чтобы дальше просто менять местами уже сохранённый список.
      const base = prev.length ? prev : allKeys;
      const known = base.filter(k => allKeys.includes(k));
      const unknown = allKeys.filter(k => !known.includes(k));
      return [...known, ...unknown];
    });
  };

  const moveHomeTile = (draggedKey: string, overKey: string) => {
    if (draggedKey === overKey) return;
    setHomeTileOrder(prev => {
      const next = [...prev];
      const from = next.indexOf(draggedKey);
      const to = next.indexOf(overKey);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, draggedKey);
      return next;
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(`home_tile_order_${user.id}`, JSON.stringify(homeTileOrder));
    } catch { /* ignore quota/availability errors — просто не сохранится порядок */ }
  }, [homeTileOrder, user.id]);
  // Ширина нижней панели навигации — панель теперь прижата к краям экрана (не
  // фиксированные 348px), поэтому форму выреза под кнопку пересчитываем по
  // реальной ширине окна, иначе кривая не совпадёт с реальными краями панели.
  const [navWidth, setNavWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 348));
  useEffect(() => {
    const onResize = () => setNavWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Выбранная категория для вкладки "Услуги" (Печать фото / Документы / Сканирование /
  // Ламинация / Сувениры) — null значит показывать все активные услуги, как раньше.
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState<string | null>(null);
  // Поиск по названию услуги на вкладке "Услуги" — работает вместе с фильтром
  // категории (оба сужают один и тот же список), не заменяет его.
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');

  // Раскрытая на весь экран карточка услуги: тап по карточке плавно
  // "разворачивает" её из своего места в сетке до полного экрана (эффект
  // открытия окна как в macOS/App Store, через layoutId Framer Motion),
  // крестик или тап по фону сворачивает обратно.
  const [expandedService, setExpandedService] = useState<Service | null>(null);

  // Категории плиток на "Главной" — реальные услуги фильтруются по ключевым словам в названии,
  // тем же принципом, что уже используется для подбора 3D-иконки услуги (см. get3DIcon ниже).
  // Ничего не выдумываем: если у категории пока нет ни одной активной услуги в базе, покажем
  // честное "пока нет предложений", а не придуманные цены.
  const serviceCategoryMatchers: Record<string, (title: string) => boolean> = {
    photo: (t) => t.includes('фото') && !t.includes('докум'),
    documents: (t) => t.includes('докум'),
    scanning: (t) => t.includes('скан'),
    // Раньше «переплёт» и «ламинация» были одной категорией с ярлыком
    // «Брошюровка» — из-за этого единственная услуга «Ламинация А4»
    // показывалась под чужим названием. Разделили: «Ламинация» — сама по
    // себе, «Брошюровка» — честно пустая, пока не появится реальная услуга
    // переплёта.
    binding: (t) => t.includes('переплёт') || t.includes('переплет') || t.includes('binding'),
  };
  const serviceCategoryLabels: Record<string, string> = {
    photo: 'Печать фото',
    documents: 'Документы',
    scanning: 'Сканирование',
    binding: 'Брошюровка',
  };
  const serviceCategoryIcons: Record<string, typeof Upload> = {
    photo: GlassPhotoRefIcon,
    documents: GlassDocumentsRefIcon,
    scanning: GlassScanRefIcon,
    binding: GlassLaminationIcon,
  };
  const serviceCategoryGlows: Record<string, string> = {
    photo: 'capsule-glow-purple',
    documents: 'capsule-glow-indigo',
    scanning: 'capsule-glow-green',
    binding: 'capsule-glow-orange',
  };
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
  // Приветственный онбординг отключён по просьбе клиента
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeLegalDoc, setActiveLegalDoc] = useState<'privacy' | 'terms' | 'delivery' | null>(null);
  const [editFullName, setEditFullName] = useState(user.fullName);
  const [editPhone, setEditPhone] = useState(user.phone || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState(user.avatarUrl || '');

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
          return { ...u, avatarUrl: downloadUrl };
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

  // "Проверка фото на документы" — клиент выбирает тип документа, делает
  // селфи или загружает готовое фото, оно уходит на photo-doc-check.php
  // (Claude через Anthropic API проверяет по требованиям конкретного
  // документа) и результат показывается прямо в модалке — 4 пункта
  // (размер/положение лица, фон, освещение, выражение) с ok/issue.
  const DOC_CHECK_TYPES: { key: string; label: string }[] = [
    { key: 'ru_passport', label: 'Паспорт РФ' },
    { key: 'ru_foreign_passport', label: 'Загранпаспорт РФ' },
    { key: 'driver_license', label: 'Водительское удостоверение' },
    { key: 'military_id', label: 'Военный билет' },
    { key: 'medical_book', label: 'Медицинская книжка' },
    { key: 'student_id', label: 'Студенческий билет' },
    { key: 'gosuslugi', label: 'Госуслуги (цифровое фото)' },
    { key: 'us_visa', label: 'Виза США' },
    { key: 'green_card', label: 'Green Card США' },
    { key: 'schengen_visa', label: 'Виза Шенген' },
    { key: 'uk_visa', label: 'Виза Великобритании' },
    { key: 'china_visa', label: 'Виза Китая' },
    { key: 'japan_visa', label: 'Виза Японии' },
    { key: 'thailand_visa', label: 'Виза Таиланда' },
    { key: 'india_visa', label: 'Виза Индии' },
    { key: 'uae_visa', label: 'Виза ОАЭ' },
    { key: 'israel_visa', label: 'Виза Израиля' },
    { key: 'turkey_residence', label: 'ВНЖ Турции' },
    { key: 'canada_visa', label: 'Виза/ВНЖ Канады' },
    { key: 'size_3x4', label: 'Формат 3×4 см' },
    { key: 'size_3x3', label: 'Формат 3×3 см' },
    { key: 'size_4x6', label: 'Формат 4×6 см' },
  ];
  // Первые DOC_CHECK_FREE_LIMIT проверок клиенту бесплатны (считаем через
  // user.docCheckFreeUsed), дальше — платно через обычный заказ/ЮKassa,
  // как остальные услуги.
  const DOC_CHECK_FREE_LIMIT = 3;
  const DOC_CHECK_PAID_PRICE = 150;
  const docCheckFreeRemaining = Math.max(0, DOC_CHECK_FREE_LIMIT - (user.docCheckFreeUsed || 0));
  const [showDocCheckModal, setShowDocCheckModal] = useState(false);
  const [docCheckType, setDocCheckType] = useState(DOC_CHECK_TYPES[0].key);
  const [docCheckImage, setDocCheckImage] = useState<string | null>(null);
  const [docCheckLoading, setDocCheckLoading] = useState(false);
  const [docCheckResult, setDocCheckResult] = useState<{ id: string; label: string; ok: boolean; issue: string }[] | null>(null);
  const [docCheckError, setDocCheckError] = useState<string | null>(null);
  const docCheckSelfieInputRef = useRef<HTMLInputElement>(null);
  const docCheckUploadInputRef = useRef<HTMLInputElement>(null);

  const handleDocCheckFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDocCheckImage(reader.result as string);
      setDocCheckResult(null);
      setDocCheckError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDocCheckSubmit = async () => {
    if (!docCheckImage) return;
    setDocCheckLoading(true);
    setDocCheckError(null);
    setDocCheckResult(null);
    try {
      const res = await fetch('https://sever-18.ru/api/photo-doc-check.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: docCheckImage, docType: docCheckType }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setDocCheckError(typeof data.error === 'string' ? data.error : 'Не удалось проверить фото');
        return;
      }
      setDocCheckResult(data.checks || []);
      const updatedUsers = database.users.map(u =>
        u.id === user.id ? { ...u, docCheckFreeUsed: (u.docCheckFreeUsed || 0) + 1 } : u
      );
      onUpdateDatabase({ users: updatedUsers });
    } catch {
      setDocCheckError('Не удалось соединиться с сервером проверки');
    } finally {
      setDocCheckLoading(false);
    }
  };

  // Бесплатный лимит исчерпан — платная проверка идёт через тот же путь
  // заказ+ЮKassa, что и обычные заказы (см. handlePlaceOrder): пишем
  // минимальный заказ-услугу в Firestore, создаём платёж, редиректим.
  // Само фото на время оплаты лежит в sessionStorage (не в заказе — не
  // хотим раздувать документ заказа base64-картинкой), PaymentReceiptScreen
  // забирает его по orderId после возврата с оплаты и вызывает проверку.
  const handleDocCheckPaidSubmit = async () => {
    if (!docCheckImage) return;
    setDocCheckLoading(true);
    setDocCheckError(null);
    // Сервер (payment-create.php) сверяет сумму платежа-услуги с реальной
    // ценой в коллекции services — значит нужен настоящий serviceId оттуда,
    // а не выдуманная строка. Ищем по названию, а не храним ID в коде,
    // чтобы не зависеть от auto-generated id (`svc_${Date.now()}`),
    // который не предсказать заранее (см. AdminPanel.handleCreateService).
    const docCheckService = database.services?.find(
      s => s.title === 'Доп. проверка фото на документы (после бесплатных)'
    );
    if (!docCheckService) {
      setDocCheckError('Платная проверка временно недоступна — обратитесь в поддержку.');
      setDocCheckLoading(false);
      return;
    }
    try {
      let orderId: string;
      try {
        const orderNumber = await getNextOrderNumber();
        orderId = `ORD-${orderNumber}`;
      } catch {
        orderId = `ORD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      }
      const docTypeLabel = DOC_CHECK_TYPES.find(t => t.key === docCheckType)?.label || docCheckType;
      const order: Order = {
        id: orderId,
        userId: getLiveUserId(),
        userName: user.fullName,
        userEmail: user.email,
        files: [],
        orderDate: new Date().toISOString(),
        status: 'pending',
        totalCost: DOC_CHECK_PAID_PRICE,
        paymentStatus: 'unpaid',
        paperType: 'standard',
        printColor: 'bw',
        copies: 1,
        notes: `Платная проверка фото на документы: ${docTypeLabel}`,
        serviceId: docCheckService.id,
      };
      sessionStorage.setItem(`doc_check_pending_${orderId}`, JSON.stringify({ image: docCheckImage, docType: docCheckType }));
      await withTimeout(setDoc(doc(db, 'orders', orderId), order), 15000);
      trackAnalyticsEvent('order_created');
      const res = await withTimeout(
        fetch('https://sever-18.ru/api/payment-create.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: DOC_CHECK_PAID_PRICE, email: user.email }),
        }),
        15000
      );
      const data = await res.json();
      if (data.paymentUrl && data.paymentId) {
        await withTimeout(setDoc(doc(db, 'orders', orderId), { ...order, transactionId: data.paymentId }), 15000);
        window.location.href = data.paymentUrl;
      } else {
        sessionStorage.removeItem(`doc_check_pending_${orderId}`);
        setDocCheckError('Не удалось создать платёж. Попробуйте ещё раз.');
        setDocCheckLoading(false);
      }
    } catch {
      setDocCheckError('Ошибка создания платежа. Проверьте интернет и попробуйте ещё раз.');
      setDocCheckLoading(false);
    }
  };

  const handleCloseDocCheckModal = () => {
    setShowDocCheckModal(false);
    setDocCheckImage(null);
    setDocCheckResult(null);
    setDocCheckError(null);
    setDocCheckLoading(false);
  };

  // Keep edits synced with user updates
  useEffect(() => {
    setEditFullName(user.fullName);
    setEditPhone(user.phone || '');
    setEditAvatarUrl(user.avatarUrl || '');
  }, [user.fullName, user.phone, user.avatarUrl]);

  // Клиенты, зарегистрированные до реферальной программы, не получили свой
  // код при регистрации — досоздаём один раз при первом заходе в кабинет.
  useEffect(() => {
    if (!user.referralCode) {
      const code = generateReferralCode(user.id);
      const updatedUsers = database.users.map(u => (u.id === user.id ? { ...u, referralCode: code } : u));
      onUpdateDatabase({ users: updatedUsers });
      registerReferralCode(code, user.id);
    }
  }, [user.id, user.referralCode]);

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
        };
      }
      return u;
    });

    onUpdateDatabase({ users: updatedUsers });
    setIsEditingProfile(false);
  };

  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(!!user.telegramChatId);
  const [showTelegramModal, setShowTelegramModal] = useState(false);

  const handleConnectTelegram = async () => {
    setTelegramLinking(true);
    try {
      // Генерируем уникальный код
      const code = 'u_' + user.id.slice(-6) + '_' + Math.random().toString(36).slice(2, 7);

      // Сохраняем код на сервере
      await withTimeout(
        fetch('https://sever-18.ru/api/telegram_link.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, userId: user.id })
        }),
        15000
      );

      // Открываем бота с кодом — клиент просто нажмёт Отправить
      window.open(`https://t.me/photosever_bot?start=${code}`, '_blank');
    } catch {
      setShowInAppPush('Ошибка подключения. Попробуйте ещё раз.');
    } finally {
      setTelegramLinking(false);
    }
  };
  
  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<PrintFile[]>(loadUploadDraft);

  // Сохраняем черновик загрузки при каждом изменении — обновление страницы больше не стирает файлы
  useEffect(() => {
    try {
      sessionStorage.setItem(UPLOAD_DRAFT_KEY, JSON.stringify(uploadedFiles));
    } catch {}
  }, [uploadedFiles]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Круг-загрузчик, перетекающий в галочку, при нажатии "Оформить заказ" —
  // 'loading' пока идёт создание платежа, 'success' на короткий миг перед
  // переходом на оплату/переключением вкладки, чтобы клиент увидел явное
  // подтверждение "заказ принят" до того как страница уйдёт на ЮKassa.
  const [orderAcceptPhase, setOrderAcceptPhase] = useState<'idle' | 'loading' | 'success'>('idle');
  const [dragActive, setDragActive] = useState(false);
  // Анимация зоны загрузки (диск -> цветная полоса прогресса -> галочка с
  // искрами), по образцу присланного макета progress-bar-only.html — чисто
  // визуальный слой поверх handleFiles/uploadFileToFirebaseStorage ниже,
  // прогресс имитированный (как в самом макете), а не побайтовый.
  const [uploadAnimPhase, setUploadAnimPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const [uploadAnimProgress, setUploadAnimProgress] = useState(0);
  const [uploadAnimSparks, setUploadAnimSparks] = useState<{ dx: number; dy: number }[]>([]);
  const uploadAnimTimerRef = useRef<number | null>(null);
  const uploadAnimResetRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (uploadAnimTimerRef.current) window.clearTimeout(uploadAnimTimerRef.current);
      if (uploadAnimResetRef.current) window.clearTimeout(uploadAnimResetRef.current);
    };
  }, []);
  const uploadAnimProgressColor = (p: number) => {
    const stops: [number, [number, number, number]][] = [[0, [255, 95, 95]], [50, [255, 196, 92]], [100, [95, 219, 143]]];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (p >= stops[i][0] && p <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const range = b[0] - a[0] || 1;
    const t = (p - a[0]) / range;
    const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const playUploadDropAnimation = () => {
    if (uploadAnimTimerRef.current) window.clearTimeout(uploadAnimTimerRef.current);
    if (uploadAnimResetRef.current) window.clearTimeout(uploadAnimResetRef.current);
    setUploadAnimPhase('busy');
    setUploadAnimProgress(0);
    const tick = (p: number) => {
      const next = Math.min(100, p + Math.random() * 9 + 3);
      setUploadAnimProgress(next);
      if (next >= 100) {
        setUploadAnimSparks(Array.from({ length: 10 }).map((_, i) => {
          const angle = (Math.PI * 2 / 10) * i;
          const dist = 30 + Math.random() * 12;
          return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
        }));
        setUploadAnimPhase('done');
        uploadAnimResetRef.current = window.setTimeout(() => {
          setUploadAnimPhase('idle');
          setUploadAnimProgress(0);
        }, 1800);
        return;
      }
      uploadAnimTimerRef.current = window.setTimeout(() => tick(next), 150 + Math.random() * 100);
    };
    uploadAnimTimerRef.current = window.setTimeout(() => tick(0), 150);
  };
  // Новые файлы сначала попадают сюда — "Настройте параметры печати" открывается
  // для каждого по очереди, и только после подтверждения файл переезжает в uploadedFiles
  const [pendingUploads, setPendingUploads] = useState<PrintFile[]>([]);
  const [activeConfigFileId, setActiveConfigFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Плитка "Печать фото" на Главной ставит этот флаг перед тем, как человек сам
  // нажмёт "Выберите файлы" — следующая порция файлов сразу помечается фото
  // (без автооткрытия системного окна выбора, это отдельно). Ref, не state —
  // не должен вызывать лишний ререндер и должен быть актуален в момент клика.
  const nextUploadIsPhotoRef = useRef(false);
  // То же самое для плитки "А3" на Главной — следующий загруженный файл сразу
  // помечается форматом А3.
  const nextUploadIsA3Ref = useRef(false);
  // То же самое для плитки "Полароид" — следующее загруженное фото сразу
  // помечается фото + размер "полароид".
  const nextUploadIsPolaroidRef = useRef(false);
  // То же самое для плитки "Документы" — упрощает модалку (без Формата и
  // переключателя Бумаги), т.к. смысла выбирать А3/фотобумагу тут нет.
  const nextUploadIsDocsRef = useRef(false);
  // То же самое для плитки "Брошюровка" — следующий загруженный файл сразу
  // помечается форматом "binding" (выбор пружины — в отдельной модалке).
  const nextUploadIsBindingRef = useRef(false);

  // Патчим файл там, где он сейчас лежит — в pendingUploads или уже в uploadedFiles
  const patchFileState = (fileId: string, updates: Partial<PrintFile>) => {
    setPendingUploads(prev => prev.map(f => (f.id === fileId ? { ...f, ...updates } : f)));
    setUploadedFiles(prev => prev.map(f => (f.id === fileId ? { ...f, ...updates } : f)));
  };

  // Когда закрывается окно настройки одного файла — открываем следующий из очереди.
  // Ждём uploadAnimPhase === 'idle' — чтобы окно не перекрывало собой ещё не
  // доигравшую анимацию диска/полосы (busy → done → idle), а открывалось
  // только после того, как клиент увидел весь эффект целиком.
  useEffect(() => {
    if (activeConfigFileId === null && pendingUploads.length > 0 && uploadAnimPhase === 'idle') {
      setActiveConfigFileId(pendingUploads[0].id);
    }
  }, [activeConfigFileId, pendingUploads, uploadAnimPhase]);

  // Чекбокс "применить ко всем" — включаем им по умолчанию, когда в очереди
  // больше одного фото сразу (массовая загрузка): раньше клиенту приходилось
  // самому его находить и включать на каждом фото по очереди, из-за чего
  // казалось, что модалка настройки просто "мигает", открываясь заново для
  // каждого файла. Теперь одно подтверждение сразу применяется ко всем.
  const [applyToAllPending, setApplyToAllPending] = useState(false);
  useEffect(() => {
    const otherPendingPhotos = pendingUploads.filter(f => f.id !== activeConfigFileId && f.formatGroup === 'image').length;
    setApplyToAllPending(otherPendingPhotos > 0);
  }, [activeConfigFileId]);

  const confirmFileConfig = (fileId: string, applyToAllPhotos: boolean = false) => {
    const file = pendingUploads.find(f => f.id === fileId);
    if (!file) return;
    // Массовая настройка: клиент загрузил много фото разом (например 30 штук)
    // и не хочет открывать модалку для каждого — применяем параметры текущего
    // фото ко всем остальным фото в очереди одним действием.
    if (applyToAllPhotos && file.paperType === 'photo') {
      const settings = {
        paperType: file.paperType,
        photoSize: file.photoSize,
        photoBorder: file.photoBorder,
        printColor: file.printColor,
        fileCopies: file.fileCopies,
      };
      const toConfirm = pendingUploads.filter(f => f.formatGroup === 'image');
      const rest = pendingUploads.filter(f => f.formatGroup !== 'image');
      setUploadedFiles(prev => [...prev, ...toConfirm.map(f => ({ ...f, ...settings }))]);
      setPendingUploads(rest);
    } else {
      setPendingUploads(prev => prev.filter(f => f.id !== fileId));
      setUploadedFiles(prev => [...prev, file]);
    }
    setActiveConfigFileId(null);
  };

  const cancelFileConfig = (fileId: string) => {
    setPendingUploads(prev => prev.filter(f => f.id !== fileId));
    setActiveConfigFileId(null);
  };

  // Print properties state
  const [paperType, setPaperType] = useState<'standard' | 'glossy' | 'matte' | 'kraft' | 'standard_a3' | 'bw_a3'>('standard');
  const [photoSize, setPhotoSize] = useState<'10*15' | '13*18' | '15*20' | '20*30'>('10*15');
  const [previewFile, setPreviewFile] = useState<PrintFile | null>(null);
  // Полноэкранный просмотр PDF по страницам — каждая страница рендерится в
  // картинку через pdf.js (тот же движок, что уже используется для подсчёта
  // страниц выше), чтобы можно было листать пальцем свайпом, как обычную
  // галерею, а не полагаться на <iframe> со встроенным PDF-вьюером браузера
  // (на телефонах часто либо не открывается, либо не поддерживает свайп).
  const [previewPdfPages, setPreviewPdfPages] = useState<string[]>([]);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const previewTouchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!previewFile) {
      setPreviewPdfPages([]);
      setPreviewPageIndex(0);
      return;
    }
    const isPdf = previewFile.type === 'application/pdf' || previewFile.name.toLowerCase().endsWith('.pdf');
    setPreviewPageIndex(0);
    if (!isPdf) {
      setPreviewPdfPages([]);
      return;
    }
    const url = previewFile.previewUrl || previewFile.url;
    if (!url) {
      setPreviewPdfPages([]);
      return;
    }
    let cancelled = false;
    setPreviewPdfLoading(true);
    setPreviewPdfPages([]);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          pages.push(canvas.toDataURL('image/jpeg', 0.85));
        }
        if (!cancelled) setPreviewPdfPages(pages);
      } catch (err) {
        console.error('Failed to render PDF pages for preview:', err);
        if (!cancelled) setPreviewPdfPages([]);
      } finally {
        if (!cancelled) setPreviewPdfLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [previewFile]);

  // "Скан" на странице услуги "Сканирование" — настоящий live-просмотр камеры
  // через getUserMedia (работает и на телефоне, и на ПК с веб-камерой) —
  // input[capture] реально открывает камеру только в мобильных браузерах,
  // на десктопе (даже с подключённой камерой) он просто открывает обычный
  // проводник. Дальше — честная базовая обработка: автоконтраст + резкость
  // (canvas) и обрезка по центру под нужное соотношение сторон (А4 или карта
  // вроде СНИЛС). Полноценное выравнивание перспективы и удаление бликов —
  // это отдельная задача компьютерного зрения, тут сознательно не делается,
  // чтобы не выдавать фильтр за то, чем он не является.
  const scanCameraInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [showLiveCamera, setShowLiveCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanRawImageUrl, setScanRawImageUrl] = useState<string | null>(null);
  const [scanProcessedImageUrl, setScanProcessedImageUrl] = useState<string | null>(null);
  const [scanTargetRatio, setScanTargetRatio] = useState<'a4' | 'card'>('a4');
  const [scanProcessing, setScanProcessing] = useState(false);

  const closeCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    setShowLiveCamera(false);
  };

  const openCamera = async () => {
    // Показываем ПРИЧИНУ сбоя явно в интерфейсе, а не только в консоли —
    // иначе непонятно, это отказ в разрешении, отсутствие камеры,
    // небезопасный контекст (нужен https/localhost) или блокировка iframe
    // (например, инструментами вроде Responsively App без allow="camera").
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Браузер не даёт доступ к камере в этом окне (нужен https или localhost, и разрешение camera для iframe, если сайт открыт внутри другого инструмента). Открываю обычный выбор файла.');
      scanCameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraStreamRef.current = stream;
      setShowLiveCamera(true);
    } catch (err) {
      console.error('Camera access failed, falling back to file picker:', err);
      const name = err instanceof Error ? err.name : 'UnknownError';
      const reason = name === 'NotAllowedError'
        ? 'Доступ к камере запрещён (разрешение отклонено или заблокировано настройками сайта/браузера).'
        : name === 'NotFoundError'
        ? 'Камера не найдена на этом устройстве.'
        : name === 'NotReadableError'
        ? 'Камера занята другим приложением.'
        : `Не удалось включить камеру (${name}).`;
      setCameraError(`${reason} Открываю обычный выбор файла.`);
      // На части десктопных браузеров без разрешения/камеры — откатываемся
      // на обычный выбор файла, чтобы функция не была полностью недоступна.
      scanCameraInputRef.current?.click();
    }
  };

  useEffect(() => {
    if (showLiveCamera && cameraVideoRef.current && cameraStreamRef.current) {
      cameraVideoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [showLiveCamera]);

  // Останавливаем камеру при размонтировании компонента, если вдруг осталась включённой.
  useEffect(() => {
    return () => { cameraStreamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const captureFromCamera = () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    closeCamera();
    setScanRawImageUrl(dataUrl);
    processScanImage(dataUrl, scanTargetRatio);
  };

  const processScanImage = (imgUrl: string, targetRatio: 'a4' | 'card') => {
    setScanProcessing(true);
    const img = new Image();
    img.onload = () => {
      // Соотношение ширина/высота: А4 портрет ≈ 210/297, карта (СНИЛС и
      // подобные) ≈ 85.6/54 (стандарт ISO/CR80).
      const ratio = targetRatio === 'a4' ? 210 / 297 : 85.6 / 54;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      const imgRatio = img.width / img.height;
      if (imgRatio > ratio) {
        sw = img.height * ratio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / ratio;
        sy = (img.height - sh) / 2;
      }
      const maxDim = 1800;
      const outW = sw >= sh ? maxDim : Math.round(maxDim * (sw / sh));
      const outH = sw >= sh ? Math.round(maxDim * (sh / sw)) : maxDim;
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setScanProcessing(false); return; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      // Автоконтраст — растягиваем самый тёмный/светлый пиксель на весь
      // диапазон 0-255, страница бумаги становится белее, текст — темнее.
      const imageData = ctx.getImageData(0, 0, outW, outH);
      const data = imageData.data;
      let min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < min) min = lum;
        if (lum > max) max = lum;
      }
      const range = Math.max(1, max - min);
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          data[i + c] = Math.max(0, Math.min(255, ((data[i + c] - min) / range) * 255));
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Резкость — простая свёртка (unsharp mask) 3×3.
      const sharpened = ctx.getImageData(0, 0, outW, outH);
      const src = new Uint8ClampedArray(sharpened.data);
      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
      for (let y = 1; y < outH - 1; y++) {
        for (let x = 1; x < outW - 1; x++) {
          for (let c = 0; c < 3; c++) {
            let sum = 0;
            let k = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * outW + (x + kx)) * 4 + c;
                sum += src[idx] * kernel[k];
                k++;
              }
            }
            sharpened.data[(y * outW + x) * 4 + c] = Math.max(0, Math.min(255, sum));
          }
        }
      }
      ctx.putImageData(sharpened, 0, 0);

      setScanProcessedImageUrl(canvas.toDataURL('image/jpeg', 0.9));
      setScanProcessing(false);
    };
    img.src = imgUrl;
  };

  const handleScanCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    setScanRawImageUrl(url);
    processScanImage(url, scanTargetRatio);
  };

  const confirmScan = () => {
    if (!scanProcessedImageUrl) return;
    // fetch() на data:-URL ненадёжен в Safari — декодируем base64 вручную.
    const [header, base64] = scanProcessedImageUrl.split(',');
    const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], `Скан_${Date.now()}.jpg`, { type: mime });
    handleFiles([file]);
    setScanRawImageUrl(null);
    setScanProcessedImageUrl(null);
    setActiveTab('upload');
  };

  const [paperDensity, setPaperDensity] = useState<string>('regular');
  const [printColor, setPrintColor] = useState<'bw' | 'color' | 'color_full'>('bw');
  const [copies, setCopies] = useState<number>(1);
  const [binding, setBinding] = useState<'none' | 'staple' | 'file' | 'spring_plastic' | 'spring_metal' | 'hard_cover'>('none');
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [selectedService, setSelectedService] = useState<{id: string; title: string; price: number} | null>(null);
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
  const [retryPayingOrderId, setRetryPayingOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'sbp' | 'qr' | 'on_receipt'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);

  // "Есть пожелание или замечание?" — временный блок обратной связи в кабинете.
  // feedbackSent живёт в localStorage (не в Firestore) — просто чтобы бейджик
  // "Ждём подарок" не пропадал при перезагрузке страницы, пока админ не
  // подарил промокод; ничего критичного не сломается, если это когда-нибудь
  // потеряется (просто снова покажется пустая форма).
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(() => localStorage.getItem(`feedback_sent_${user.id}`) === '1');
  // Раньше крестик прятал баннер только до перезагрузки страницы (обычный
  // React-стейт) — теперь запоминаем в localStorage, чтобы закрытие было
  // насовсем, как и у feedbackSent выше.
  const [feedbackDismissed, setFeedbackDismissed] = useState(() => localStorage.getItem(`feedback_dismissed_${user.id}`) === '1');
  const [feedbackCelebrate, setFeedbackCelebrate] = useState(false);

  // Реферальная программа — карточка "Пригласить друга" с копированием ссылки.
  const [referralCopied, setReferralCopied] = useState(false);
  const referralLink = user.referralCode ? `https://sever-18.ru/?ref=${user.referralCode}` : '';
  const handleShareReferral = async () => {
    if (!referralLink) return;
    const shareText = `Печатаю фото и документы в Фото-Север — по моей ссылке скидка 10% на первый заказ: ${referralLink}`;
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, url: referralLink });
        return;
      } catch {
        // пользователь закрыл системный шаринг — просто откатываемся на копирование
      }
    }
    navigator.clipboard.writeText(shareText).then(() => {
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    }).catch(() => {});
  };

  // "Заметили ошибку?" — отдельное окно от формы пожеланий выше: тут можно
  // приложить скриншот. Файл грузится в Storage сразу при выборе (как аватар
  // чуть ниже), а не в момент отправки — чтобы человек видел, что вложение
  // реально загрузилось, до того как жать "Отправить".
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [bugReportText, setBugReportText] = useState('');
  const [bugReportPreviewUrl, setBugReportPreviewUrl] = useState<string | null>(null);
  const [bugReportScreenshotUrl, setBugReportScreenshotUrl] = useState<string | null>(null);
  const [bugReportUploading, setBugReportUploading] = useState(false);
  const [bugReportSending, setBugReportSending] = useState(false);
  const [bugReportSent, setBugReportSent] = useState(false);
  const bugReportFileInputRef = useRef<HTMLInputElement>(null);

  const handleBugReportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBugReportPreviewUrl(URL.createObjectURL(file));
    setBugReportUploading(true);
    try {
      const fileRef = ref(storage, `bug-reports/${user.id}_${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);
      setBugReportScreenshotUrl(downloadUrl);
    } catch (err) {
      console.error('Error uploading bug report screenshot:', err);
    } finally {
      setBugReportUploading(false);
    }
  };

  const handleSendBugReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!bugReportText.trim() && !bugReportScreenshotUrl) || bugReportSending || bugReportUploading) return;
    setBugReportSending(true);
    try {
      await sendFeedbackToFirebase({
        id: 'bug_' + Date.now(),
        userId: getLiveUserId(),
        userName: user.fullName,
        userEmail: user.email,
        message: bugReportText.trim() || '(без описания, только скриншот)',
        timestamp: new Date().toISOString(),
        isBugReport: true,
        ...(bugReportScreenshotUrl ? { screenshotUrl: bugReportScreenshotUrl } : {}),
      });
      setBugReportSent(true);
      setTimeout(() => {
        setShowBugReportModal(false);
        setBugReportSent(false);
        setBugReportText('');
        setBugReportPreviewUrl(null);
        setBugReportScreenshotUrl(null);
      }, 1800);
    } catch (err) {
      console.error('Failed to send bug report:', err);
    } finally {
      setBugReportSending(false);
    }
  };

  // Live chat state
  const [chatInput, setChatInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatContentRef = useRef<HTMLDivElement>(null);

  // Метка "печатает…" для админа (см. CHAT_TYPING_STALE_MS в AdminPanel.tsx).
  // Троттлим запись раз в CHAT_TYPING_WRITE_INTERVAL_MS, а не на каждое
  // нажатие клавиши, — иначе каждый символ гонял бы полную перезапись
  // документа пользователя в Firestore (см. syncLocalUpdatesToFirebase).
  const lastTypingWriteRef = useRef(0);
  const CHAT_TYPING_WRITE_INTERVAL_MS = 2500;
  const handleChatInputChange = (value: string) => {
    setChatInput(value);
    const now = Date.now();
    if (now - lastTypingWriteRef.current < CHAT_TYPING_WRITE_INTERVAL_MS) return;
    lastTypingWriteRef.current = now;
    const updatedUsers = database.users.map(u =>
      u.id === user.id ? { ...u, typingChatAt: new Date().toISOString() } : u
    );
    onUpdateDatabase({ users: updatedUsers });
  };

  // Голосовой ввод в чат (тз-fable-voice-input.md) — распознавание речи целиком
  // в браузере клиента через встроенный Web Speech API, ничего никуда не
  // отправляется и не сохраняется, только итоговый текст попадает в поле
  // ввода (не отправляется автоматически — клиент может поправить перед "Отправить").
  const [micState, setMicState] = useState<'idle' | 'listening'>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const speechRecognitionSupported = typeof window !== 'undefined'
    && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const handleMicClick = () => {
    if (micState === 'listening') return;
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    setMicError(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setMicState('listening');
    recognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript;
      if (text) setChatInput(text);
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'permission-denied' || event.error === 'service-not-allowed') {
        setMicError('Разреши доступ к микрофону в браузере');
      } else {
        setMicError('Не расслышал, попробуй ещё раз');
      }
    };
    recognition.onend = () => setMicState('idle');
    recognition.start();
  };

  // ИИ-чат (tz-fable-ai-chat-master.md) — отдельное, независимое от чата с
  // оператором окно: клиент задаёт вопрос текстом или голосом, ответ идёт
  // через Claude API (сервер сам подтягивает живые цены из Firestore и
  // подставляет их в системный промпт — на клиенте цены нигде не хранятся).
  type AiPriceItem = { label: string; qty: number; unitPrice: number; subtotal: number };
  type AiPriceBreakdown = { items: AiPriceItem[]; total: number };
  type AiChatMessage = { role: 'user' | 'assistant'; content: string; showRoute?: boolean; price?: AiPriceBreakdown };
  // Маршрут.md — модель добавляет эту метку в конце ответа, когда клиент
  // спрашивает "как добраться"; код (не модель) вырезает метку из текста
  // и рисует вместо неё кнопку с готовой ссылкой на Яндекс.Карты.
  const AI_ROUTE_MARKER = '[ПОКАЗАТЬ_МАРШРУТ]';
  // [ЦЕНА]{...JSON...}[/ЦЕНА] — модель добавляет это в конце ответа, когда
  // считает клиенту стоимость (см. system-промпт в ai-chat.php); код вырезает
  // JSON из текста/озвучки и рисует вместо него красивую карточку с разбивкой
  // и итогом, а не читает JSON вслух.
  const AI_PRICE_MARKER_RE = /\[ЦЕНА\]([\s\S]*?)\[\/ЦЕНА\]/;
  function extractAiPriceCard(rawReply: string): { text: string; price?: AiPriceBreakdown } {
    const match = rawReply.match(AI_PRICE_MARKER_RE);
    if (!match) return { text: rawReply };
    let price: AiPriceBreakdown | undefined;
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && Array.isArray(parsed.items) && typeof parsed.total === 'number') price = parsed;
    } catch { /* модель могла отдать невалидный JSON — просто не показываем карточку */ }
    return { text: rawReply.replace(match[0], '').trim(), price };
  }
  const AI_STUDIO_ADDRESS = 'Северное шоссе 18, Раменское, Московская область';
  const openAiChatRoute = () => {
    // Геолокацию должен спросить сам браузер по клику на ссылку карт —
    // ничего запрашивать заранее не нужно, и без разрешения карта всё
    // равно откроется, просто попросит точку отправления сама.
    const url = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(AI_STUDIO_ADDRESS)}&rtt=auto`;
    window.open(url, '_blank');
  };
  const [showAiChat, setShowAiChat] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatSending, setAiChatSending] = useState(false);
  // "на время сессии" — sessionStorage, не localStorage, обнуляется когда
  // вкладка/приложение закрывается, как и просили в ТЗ озвучки.
  const [aiChatSpeakEnabled, setAiChatSpeakEnabled] = useState(() => {
    try { return sessionStorage.getItem('ai_chat_speak') !== 'off'; } catch { return true; }
  });
  const aiChatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    aiChatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChatMessages, aiChatSending]);

  const toggleAiChatSpeak = () => {
    setAiChatSpeakEnabled(prev => {
      const next = !prev;
      try { sessionStorage.setItem('ai_chat_speak', next ? 'on' : 'off'); } catch { /* ignore */ }
      if (!next) stopAiSpeaking();
      return next;
    });
  };

  // Список с тире читается вслух дословно ("тире печать А4") — если в
  // ответе есть маркированный список, для озвучки убираем разметку и
  // склеиваем в обычный связный текст.
  const stripMarkdownForSpeech = (text: string) => text
    .replace(/^[\s]*[-•]\s+/gm, '. ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();

  // Yandex SpeechKit tts:synthesize ограничивает длину текста за один запрос
  // (~5000 символов) — разбиваем длинный ответ по границам предложений, чтобы
  // не резать слова и не отправлять всё одним куском без ограничения.
  const splitForTts = (text: string, maxLen = 3500): string[] => {
    const clean = stripMarkdownForSpeech(text);
    if (clean.length <= maxLen) return clean ? [clean] : [];
    const sentences = clean.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let cur = '';
    for (const s of sentences) {
      const next = cur ? `${cur} ${s}` : s;
      if (next.length > maxLen && cur) {
        chunks.push(cur);
        cur = s;
      } else {
        cur = next;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  };

  // Пока идёт озвучка ответа — кружок в голосовом оверлее "оживает"
  // (пульс + бегущая звуковая дорожка), как в голосовом режиме GPT-чатов.
  const [aiIsSpeaking, setAiIsSpeaking] = useState(false);
  // iOS Safari иногда блокирует programmatic play() даже после разблокировки
  // жестом (если ответ пришёл через несколько секунд — окно "доверия" к
  // жесту уже истекло) — раньше это тихо проглатывалось без всякого следа
  // на экране. Держим готовый к воспроизведению URL, чтобы показать кнопку
  // "Озвучить" — обычный тап по ней WebKit точно разрешит.
  const [blockedSpeechUrl, setBlockedSpeechUrl] = useState<string | null>(null);
  // Раньше сбой запроса к tts.php (сеть/ошибка сервера) просто молча
  // прерывал озвучку без единого следа на экране — теперь показываем,
  // что именно пошло не так, чтобы при следующем сбое не гадать вслепую.
  const [speechDiag, setSpeechDiag] = useState<string | null>(null);
  const playBlockedSpeech = () => {
    if (!blockedSpeechUrl) return;
    const el = getAiAudioEl();
    el.src = blockedSpeechUrl;
    el.play().then(() => setAiIsSpeaking(true)).catch(() => {});
    setBlockedSpeechUrl(null);
  };

  // Один и тот же <audio>-элемент для всей озвучки (не новый на каждый
  // кусок) — на iOS Safari programmatic play() разрешён без нового жеста
  // пользователя только для элемента, который уже был запущен внутри
  // настоящего тапа (см. unlockAiAudio ниже).
  const aiAudioElRef = useRef<HTMLAudioElement | null>(null);
  const getAiAudioEl = () => {
    if (!aiAudioElRef.current) aiAudioElRef.current = new Audio();
    return aiAudioElRef.current;
  };

  // Разблокировка автоплея на iOS: озвучка теперь приходит с сервера
  // (fetch), то есть play() вызывается уже ПОСЛЕ настоящего тапа — Safari
  // тихо блокирует такой programmatic play(). Прогреваем тот же элемент
  // одним play()+pause() прямо внутри реального жеста (открытие чата/
  // голосового оверлея), дальше он остаётся разрешённым до закрытия вкладки.
  const unlockAiAudio = () => {
    const el = getAiAudioEl();
    el.muted = true;
    el.play().then(() => { el.pause(); el.muted = false; }).catch(() => { el.muted = false; });
  };

  // Растущий токен — прерывает уже идущую озвучку (новый ответ, мьют,
  // закрытие окна), не даёт старому куску доиграть поверх нового.
  const speakTokenRef = useRef(0);
  const stopAiSpeaking = () => {
    speakTokenRef.current += 1;
    aiAudioElRef.current?.pause();
    setAiIsSpeaking(false);
  };

  const speakAiReply = async (text: string) => {
    if (!aiChatSpeakEnabled) return;
    stopAiSpeaking();
    setSpeechDiag(null);
    setBlockedSpeechUrl(null);
    const myToken = speakTokenRef.current;
    const el = getAiAudioEl();
    const chunks = splitForTts(text);
    for (const chunk of chunks) {
      if (speakTokenRef.current !== myToken) return;
      let buf: ArrayBuffer;
      try {
        const res = await fetch('https://sever-18.ru/api/tts.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk }),
        });
        if (!res.ok) {
          // Раньше здесь просто тихо молчали — из-за этого невозможно было
          // понять, что именно ломается на конкретном телефоне. Показываем
          // код ответа, чтобы при следующем сбое было видно причину, а не
          // угадывать вслепую.
          setSpeechDiag(`Сервер озвучки ответил ошибкой ${res.status}`);
          return;
        }
        buf = await res.arrayBuffer();
      } catch {
        setSpeechDiag('Не удалось соединиться с сервером озвучки (сеть)');
        return;
      }
      if (speakTokenRef.current !== myToken) return;
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      el.src = url;
      await new Promise<void>(resolve => {
        const cleanup = () => { URL.revokeObjectURL(url); resolve(); };
        el.onended = cleanup;
        el.onerror = cleanup;
        el.play().then(() => setAiIsSpeaking(true)).catch(() => {
          // Не отзываем url — даём кнопке "Озвучить" воспроизвести его по
          // настоящему тапу вместо того, чтобы тихо остаться без звука.
          setBlockedSpeechUrl(url);
          resolve();
        });
      });
      if (speakTokenRef.current !== myToken) return;
    }
    if (speakTokenRef.current === myToken) setAiIsSpeaking(false);
  };

  const handleOpenAiChat = () => {
    // Это отдельное окно-оверлей поверх текущего экрана (свой backdrop,
    // своя видимость через showAiChat) — mobileHome/activeTab трогать не
    // нужно: раньше это делалось по инерции от старого поведения кнопки
    // (переход в вкладку "Чат"), и при закрытии окна оголяло вкладку
    // "Загрузка" по умолчанию позади вместо "Главной", с которой открывали.
    setShowAiChat(true);
    unlockAiAudio();
  };
  const handleCloseAiChat = () => {
    setShowAiChat(false);
    stopAiSpeaking(); // не договаривать в свёрнутое окно
  };

  // Общая логика "отправить текст в ИИ и получить ответ" — используется и
  // обычной текстовой формой, и голосовым оверлеем (см. ниже), чтобы не
  // дублировать fetch/обработку ошибок/парсинг метки маршрута в двух местах.
  const sendAiChatText = async (text: string): Promise<{ reply: string; showRoute: boolean; price?: AiPriceBreakdown }> => {
    const nextMessages: AiChatMessage[] = [...aiChatMessages, { role: 'user', content: text }];
    setAiChatMessages(nextMessages);
    const fallbackReply = 'Не могу ответить прямо сейчас, напишите нам в Telegram @photosever18 или позвоните 8 (968) 050-88-00';
    try {
      const res = await fetch('https://sever-18.ru/api/ai-chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      const rawReply: string = data.reply || fallbackReply;
      const showRoute = rawReply.includes(AI_ROUTE_MARKER);
      const { text: reply, price } = extractAiPriceCard(rawReply.replace(AI_ROUTE_MARKER, '').trim());
      setAiChatMessages(prev => [...prev, { role: 'assistant', content: reply, showRoute, price }]);
      speakAiReply(reply);
      return { reply, showRoute, price };
    } catch {
      setAiChatMessages(prev => [...prev, { role: 'assistant', content: fallbackReply }]);
      speakAiReply(fallbackReply);
      return { reply: fallbackReply, showRoute: false };
    }
  };

  const handleSendAiChatMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = aiChatInput.trim();
    if (!text || aiChatSending) return;
    setAiChatInput('');
    setAiChatSending(true);
    try {
      await sendAiChatText(text);
    } finally {
      setAiChatSending(false);
    }
  };

  // Полноэкранный голосовой режим (как voice mode в GPT-чатах) — открывается
  // по кнопке микрофона вместо инлайн-записи в маленьком поле: большая
  // пульсирующая кнопка, пока идёт запись, затем ответ показывается и
  // проговаривается уже в этом же оверлее.
  type VoiceOverlayPhase = 'idle' | 'listening' | 'thinking' | 'answered' | 'error';
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [voiceOverlayPhase, setVoiceOverlayPhase] = useState<VoiceOverlayPhase>('idle');
  const [voiceOverlayReply, setVoiceOverlayReply] = useState('');
  const [voiceOverlayPrice, setVoiceOverlayPrice] = useState<AiPriceBreakdown | undefined>(undefined);
  const [voiceOverlayShowRoute, setVoiceOverlayShowRoute] = useState(false);
  const [voiceOverlayError, setVoiceOverlayError] = useState<string | null>(null);
  const voiceOverlayRecognitionRef = useRef<any>(null);
  // Рация: микрофон слушает, только пока палец на кружке. Отпустил —
  // запись останавливается и вопрос сразу уходит в ИИ (просьба клиента).
  const [voiceHolding, setVoiceHolding] = useState(false);

  const handleCloseVoiceOverlay = () => {
    try { voiceOverlayRecognitionRef.current?.abort(); } catch { /* ignore */ }
    setVoiceHolding(false);
    setShowVoiceOverlay(false);
    stopAiSpeaking();
  };

  const handleOpenVoiceOverlay = () => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    setVoiceOverlayError(null);
    setVoiceOverlayReply('');
    setVoiceOverlayShowRoute(false);
    setVoiceOverlayPhase('idle');
    setShowVoiceOverlay(true);
    unlockAiAudio();
  };

  const startVoiceCapture = () => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    try { voiceOverlayRecognitionRef.current?.abort(); } catch { /* ignore */ }
    stopAiSpeaking(); // не слушать поверх говорящего ИИ
    const recognition = new SpeechRecognitionCtor();
    voiceOverlayRecognitionRef.current = recognition;
    recognition.lang = 'ru-RU';
    // continuous=true — без этого браузер сам обрывал распознавание на первой
    // же короткой паузе в середине длинной фразы (клиент делает вдох/думает
    // на 1-2 секунды посреди вопроса подлиннее — раньше это читалось как
    // "конец речи", и получали "не расслышал" на полностью нормальный, но
    // не самый короткий вопрос). Теперь слушаем без авто-обрыва, пока сами
    // не остановим через .stop() на отпускание кружка.
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    // В continuous-режиме onresult может сработать несколько раз подряд —
    // по одному финальному куску на каждую паузу внутри фразы, а не один раз
    // на всю фразу целиком. Копим все куски и обрабатываем их вместе только
    // когда распознавание реально закончилось (onend, после .stop() на
    // отпускание кружка), а не на первый же промежуточный кусок.
    let accumulatedText = '';
    let settled = false;
    recognition.onresult = (event: any) => {
      settled = true;
      for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal && result[0]?.transcript) {
          accumulatedText += (accumulatedText ? ' ' : '') + result[0].transcript;
        }
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'permission-denied' || event.error === 'service-not-allowed') {
        settled = true;
        setVoiceOverlayError('Разреши доступ к микрофону в браузере');
        setVoiceOverlayPhase('error');
      } else if (event.error === 'aborted') {
        return; // сами прервали через abort() — не показываем это как ошибку
      }
      // Остальные ошибки (no-speech и т.п.) не считаем settled — если что-то
      // уже успели распознать до сбоя, onend всё равно обработает накопленный
      // текст; если нет — onend честно покажет "не расслышал".
    };
    recognition.onend = async () => {
      clearTimeout(safetyTimer);
      setVoiceHolding(false);
      const text = accumulatedText.trim();
      if (!text) {
        setVoiceOverlayError('Не расслышал — держи кружок подольше и говори чётче');
        setVoiceOverlayPhase('error');
        return;
      }
      setVoiceOverlayPhase('thinking');
      const { reply, price, showRoute } = await sendAiChatText(text);
      setVoiceOverlayReply(reply);
      setVoiceOverlayPrice(price);
      setVoiceOverlayShowRoute(showRoute);
      setVoiceOverlayPhase('answered');
    };
    setVoiceOverlayError(null);
    setVoiceOverlayReply('');
    setVoiceOverlayPrice(undefined);
    setVoiceOverlayShowRoute(false);
    setVoiceOverlayPhase('listening');
    setVoiceHolding(true);
    voicePressStartRef.current = Date.now();
    recognition.start();
    // Подстраховка: если палец завис/onend по какой-то причине не пришёл,
    // не даём кружку слушать вечно — жёстко останавливаем через 20 секунд.
    const safetyTimer = setTimeout(() => {
      if (!settled) { try { recognition.stop(); } catch { /* ignore */ } }
    }, 20000);
  };

  // Реальному распознаванию речи нужно немного времени, чтобы фактически
  // начать слушать (запрос разрешения, подключение к сервису) — слишком
  // быстрое "тык-и-отпустил" обрывало запись раньше, чем что-то успевало
  // попасть в поток, и выглядело как "вообще не сработало". Не отпускаем
  // раньше 600мс с момента нажатия.
  const MIN_HOLD_MS = 600;
  const voicePressStartRef = useRef(0);
  const stopVoiceCapture = () => {
    if (!voiceHolding) return;
    setVoiceHolding(false);
    const elapsed = Date.now() - voicePressStartRef.current;
    const doStop = () => { try { voiceOverlayRecognitionRef.current?.stop(); } catch { /* ignore */ } };
    if (elapsed < MIN_HOLD_MS) {
      setTimeout(doStop, MIN_HOLD_MS - elapsed);
    } else {
      doStop();
    }
  };

  // Notification states
  const [pushConsent, setPushConsent] = useState<'default' | 'granted' | 'denied'>(() => {
    return (localStorage.getItem('print_shop_push_consent') as any) || 'default';
  });
  const [showInAppPush, setShowInAppPush] = useState<string | null>(null);

  // Filter state for orders
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Order file deletion state
  const [fileToConfirmDelete, setFileToConfirmDelete] = useState<{ orderId: string; fileId: string } | null>(null);
  const [orderToConfirmDelete, setOrderToConfirmDelete] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const canDeleteFileFromOrder = (ord: Order) => {
    return ord.status === 'pending' || ord.status === 'approved';
  };

  // Клиент может удалить свой заказ целиком, только пока он ещё не оплачен
  // и не взят в обработку (см. такое же условие в firestore.rules) —
  // одобренный/оплаченный/печатающийся заказ так убрать нельзя.
  const canDeleteOwnOrder = (ord: Order) => {
    return ord.status === 'pending' && ord.paymentStatus === 'unpaid';
  };

  const handleDeleteOwnOrder = async (orderId: string) => {
    setDeletingOrderId(orderId);
    try {
      await deleteOrderFromFirebase(orderId);
      onUpdateDatabase({ orders: database.orders.filter(o => o.id !== orderId) });
    } catch (err) {
      console.error('Failed to delete own order:', err);
    } finally {
      setDeletingOrderId(null);
      setOrderToConfirmDelete(null);
    }
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
  // До первого реального снимка с сервера database ещё может быть
  // устаревшим локальным кэшем — не показываем счётчик, чтобы не мигало
  // старым числом на долю секунды при каждой загрузке страницы.
  const unreadNotificationsCount = hasSyncedFromServer ? userNotifications.filter(n => !n.read).length : 0;

  // Auto-scroll chat to bottom. Раньше это делалось фиксированными таймерами
  // (400/1000/2000мс) — угадывание задержки ненадёжно: стикеры (webm-видео) и
  // Firestore-подписка догружаются с непредсказуемой скоростью, и на плохой
  // сети открытие чата всё равно показывало середину истории, а не низ.
  // ResizeObserver реагирует на РЕАЛЬНОЕ изменение высоты списка сообщений —
  // сколько бы времени ни заняла загрузка, скролл к низу сработает сразу же,
  // как только контент фактически вырастет.
  useLayoutEffect(() => {
    if (activeTab !== 'chat') return;
    const container = chatContainerRef.current;
    const content = chatContentRef.current;
    if (!container || !content) return;

    const scrollToBottom = () => {
      container.scrollTop = container.scrollHeight;
    };
    // Синхронно и сразу — покрывает случай "сообщения уже загружены к
    // моменту открытия вкладки" (обычно так и есть, подписка на Firestore
    // живёт в App.tsx с самого входа в кабинет, а не с открытия чата).
    scrollToBottom();
    // И ещё раз на следующем тике — на случай, если браузер ещё не
    // пересчитал итоговую scrollHeight к моменту синхронного вызова выше.
    const rafId = requestAnimationFrame(scrollToBottom);

    // Наблюдаем за ВНУТРЕННИМ контейнером сообщений (растёт вместе с
    // контентом), а не за внешним прокручиваемым — у внешнего своя
    // фиксированная высота (flex-1), она не меняется при добавлении
    // сообщений, поэтому ResizeObserver на нём никогда бы не сработал.
    // Ловит асинхронную догрузку картинок/видео-стикеров ПОСЛЕ рендера.
    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(content);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
    // userChats.length — отдельный триггер на случай, если пришло новое
    // сообщение, пока вкладка чата уже открыта (ResizeObserver это тоже
    // должен ловить, но два независимых механизма надёжнее одного).
  }, [activeTab, userChats.length]);

  // Авто-удаление уведомлений старше 48 часов — тот же принцип, что и у
  // архива выданных заказов в админке: журнал уведомлений это просто лог
  // активности, сама информация (статус заказа, история чата) остаётся
  // доступна в других местах, так что чистить по возрасту безопасно.
  useEffect(() => {
    const autoDeleteOldNotifications = async () => {
      const now = Date.now();
      const ms48h = 48 * 60 * 60 * 1000;
      const toDelete = userNotifications.filter(n => (now - new Date(n.timestamp).getTime()) > ms48h);
      for (const n of toDelete) {
        try { await deleteNotificationFromFirebase(n.id); } catch {}
      }
      if (toDelete.length > 0) {
        onUpdateDatabase({ notifications: database.notifications.filter(n => !toDelete.find(d => d.id === n.id)) });
      }
    };
    autoDeleteOldNotifications();
  }, [userNotifications.length]);

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
      playUploadDropAnimation();
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      playUploadDropAnimation();
      handleFiles(e.target.files);
    }
  };

  const uploadFileToFirebaseStorage = async (file: File, fileId: string) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.id);

      const response = await withTimeout(
        fetch('https://sever-18.ru/api/upload.php', {
          method: 'POST',
          body: formData,
          redirect: 'follow'
        }),
        60000
      );

      if (!response.ok) {
        throw new Error('Сервер вернул ошибку: ' + response.status);
      }

      const data = await response.json();
      if (!data.success || !data.url) {
        throw new Error(data.error || 'Не удалось загрузить файл');
      }

      patchFileState(fileId, { url: data.url });
    } catch (error: any) {
      console.error('Server upload error for fileId ' + fileId + ':', error);
      const isTimeout = error instanceof Error && error.message === 'timeout';
      const errMsg = isTimeout
        ? 'слишком слабое соединение, загрузка не завершилась за минуту'
        : (error?.message || String(error) || 'Неизвестная ошибка');
      setUploadError(`Ошибка: ${errMsg}`);
      setPendingUploads(prev => prev.filter(f => f.id !== fileId));
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    }
  };

  const handleFiles = (filesList: FileList | File[]) => {
    if (!isWorkingHours()) {
      setUploadError("К сожалению, приём файлов приостановлен во внерабочее время. Мы работаем: Пн-Пт 09:00-19:00, Сб-Вс 10:00-19:00.");
      return;
    }
    setUploadError(null);
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 МБ — заявлено на лендинге, но раньше нигде не проверялось
    const oversizedNames: string[] = [];
    // .rar/.7z нельзя честно распаковать и посчитать в браузере (нет лёгкой
    // библиотеки под них, в отличие от .zip через уже используемый JSZip) —
    // раньше такой архив тихо ценился как 1 страница независимо от того,
    // что внутри. Проще не принимать их вовсе, чем занижать цену.
    const unsupportedArchiveNames: string[] = [];
    const newFiles: PrintFile[] = [];
    // Больше 2 файлов за раз (любых, не только фото) — клиент явно просил
    // "чтобы не приходилось прокручивать много карточек": вместо N отдельных
    // записей в заказе собираем один zip-архив и кладём его одной строкой.
    // Реальные файлы для печати внутри — админ распаковывает архив сам перед
    // печатью (обсуждено и подтверждено явно, это не побочный эффект).
    const willZip = filesList.length > 2;
    const rawFilesForZip: File[] = [];
    // Расходуем флаги ровно один раз — на эту порцию файлов, дальше снова обычный режим.
    const forcePhoto = nextUploadIsPhotoRef.current;
    nextUploadIsPhotoRef.current = false;
    const forceA3 = nextUploadIsA3Ref.current;
    nextUploadIsA3Ref.current = false;
    const forcePolaroid = nextUploadIsPolaroidRef.current;
    nextUploadIsPolaroidRef.current = false;
    const simplifiedDocs = nextUploadIsDocsRef.current;
    nextUploadIsDocsRef.current = false;
    const forceBinding = nextUploadIsBindingRef.current;
    nextUploadIsBindingRef.current = false;
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      if (file.size > MAX_FILE_SIZE) {
        oversizedNames.push(file.name);
        continue;
      }
      const formatGroup = getFileFormatGroup(file.name);
      if (formatGroup === 'archive' && !file.name.toLowerCase().endsWith('.zip')) {
        unsupportedArchiveNames.push(file.name);
        continue;
      }
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

      const isImage = file.type.startsWith('image/') || formatGroup === 'image';

      newFiles.push({
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        formatGroup,
        pageCount: isPdf ? undefined : 1,
        previewUrl: previewUrl || undefined,
        ...(forcePhoto && isImage ? { paperType: 'photo', photoSize: '10x15', photoBorder: 'borderless', printColor: 'color' } : {}),
        ...(forcePolaroid && isImage ? { paperType: 'photo', photoSize: 'polaroid', photoBorder: 'borderless', printColor: 'color' } : {}),
        // Раньше А3 нарочно не ставился фото/картинкам (isImage) — тогда в А3
        // был только формат для документов. Теперь у А3 есть режим "Фото"
        // (печать снимков на А3), так что ограничение больше не нужно.
        ...(forceA3 ? { format: 'a3' } : {}),
        ...(forceBinding ? { format: 'binding' } : {}),
        ...(simplifiedDocs && !isImage ? { simplifiedDocsMode: true } : {}),
      });

      if (willZip) {
        rawFilesForZip.push(file);
        continue; // архив собирается и грузится одним блоком ниже — не трогаем сеть/стейт на каждый файл
      }

      // Клиент сам загрузил готовый .zip одним файлом (не через авто-сборку
      // выше) — раньше такой архив ценился как 1 стр. независимо от того,
      // что внутри. Заглядываем внутрь и честно считаем цену по содержимому,
      // как и для авто-собранного архива (20₽/фото, 20₽×страницы для PDF).
      if (formatGroup === 'archive') {
        JSZip.loadAsync(file).then(async zip => {
          const entries = Object.values(zip.files).filter(e => !e.dir);
          let total = 0;
          for (const entry of entries) {
            const entryFormatGroup = getFileFormatGroup(entry.name);
            if (entryFormatGroup === 'image') {
              total += 20;
            } else {
              const isEntryPdf = entry.name.toLowerCase().endsWith('.pdf');
              let pages = 1;
              if (isEntryPdf) {
                try {
                  const blob = await entry.async('blob');
                  pages = await countPdfPages(new File([blob], entry.name, { type: 'application/pdf' }));
                } catch {
                  pages = 1;
                }
              }
              total += 20 * pages;
            }
          }
          patchFileState(fileId, {
            bundleFixedPrice: total || 20,
            bundleFileCount: entries.length || 1,
            pageCount: undefined,
          });
        }).catch(err => {
          // Повреждён или запаролен — не смогли заглянуть внутрь, оставляем
          // консервативную цену по умолчанию (1 стр.) как и раньше.
          console.error('Failed to inspect uploaded .zip contents:', err);
        });
      }

      if (isPdf) {
        countPdfPages(file).then(pages => {
          patchFileState(fileId, { pageCount: pages });
        });
      }

      // Auto-detect color fill % for images and PDFs (using preview)
      if (previewUrl) {
        analyzeColorFill(previewUrl).then(pct => {
          patchFileState(fileId, { colorFillPercent: pct });
        });
      }

      // Настоящее разрешение фото в пикселях — нужно только для предупреждения
      // "маловато для этого размера печати" (Важное.md, часть 2). Для PDF
      // такое предупреждение не считаем — там печать постранично из PDF, не
      // из растровой картинки, natural-размер PDF-превью тут не показателен.
      if (previewUrl && isImage) {
        const probe = new Image();
        probe.onload = () => {
          patchFileState(fileId, { imagePixelWidth: probe.naturalWidth, imagePixelHeight: probe.naturalHeight });
        };
        probe.src = previewUrl;
      }

      // Upload file directly to Firebase Storage bucket asynchronously
      uploadFileToFirebaseStorage(file, fileId);
    }

    if (oversizedNames.length > 0) {
      setUploadError(
        `Файл${oversizedNames.length > 1 ? 'ы' : ''} слишком больш${oversizedNames.length > 1 ? 'ие' : 'ой'} (максимум 100 МБ): ${oversizedNames.join(', ')}`
      );
    }

    if (unsupportedArchiveNames.length > 0) {
      setUploadError(
        `Формат .rar/.7z не поддерживается, пересохраните в .zip: ${unsupportedArchiveNames.join(', ')}`
      );
    }

    if (newFiles.length === 0) return;

    if (willZip) {
      const bundleId = 'bundle_' + Date.now();
      (async () => {
        let total = 0;
        for (let i = 0; i < newFiles.length; i++) {
          const meta = newFiles[i];
          if (meta.formatGroup === 'image') {
            total += 20; // фото по умолчанию — 10×15, цвет
          } else {
            const raw = rawFilesForZip[i];
            const isPdf = raw.type === 'application/pdf' || meta.name.toLowerCase().endsWith('.pdf');
            const pages = isPdf ? await countPdfPages(raw).catch(() => 1) : 1;
            total += 20 * pages; // документ по умолчанию — Ч/Б А4
          }
        }
        const zip = new JSZip();
        rawFilesForZip.forEach((raw, i) => zip.file(newFiles[i].name, raw));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFile = new File([zipBlob], `Архив (${newFiles.length} файлов).zip`, { type: 'application/zip' });
        const bundleEntry: PrintFile = {
          id: bundleId,
          name: zipFile.name,
          size: zipFile.size,
          type: 'application/zip',
          uploadedAt: new Date().toISOString(),
          formatGroup: 'archive',
          bundleFixedPrice: total,
          bundleFileCount: newFiles.length,
        };
        setUploadedFiles(prev => [...prev, bundleEntry]);
        uploadFileToFirebaseStorage(zipFile, bundleId);
      })();
      return;
    }

    // Массовая загрузка фото (клиент выбрал/перетащил больше одного фото за
    // раз, но 2 и меньше — иначе архивируется выше) — вообще без модалки
    // настроек: сразу проставляем цвет+10×15+1 копия и кладём готовыми
    // файлами в заказ. Поправить размер/цвет/копии потом можно прямо в
    // списке загруженных файлов. Документы (не фото) и одиночные фото
    // по-прежнему идут через обычную модалку настройки.
    const imageFilesInThisBatch = newFiles.filter(f => f.formatGroup === 'image');
    const isBulkPhotoBatch = imageFilesInThisBatch.length > 1;
    const bulkReadyFiles = isBulkPhotoBatch
      ? imageFilesInThisBatch.map(f => ({
          ...f,
          paperType: f.paperType || 'photo',
          photoSize: f.photoSize || '10x15',
          photoBorder: f.photoBorder || 'borderless',
          printColor: f.printColor || 'color',
          fileCopies: f.fileCopies || 1,
        } as PrintFile))
      : [];
    const remainingFiles = isBulkPhotoBatch
      ? newFiles.filter(f => f.formatGroup !== 'image')
      : newFiles;

    if (bulkReadyFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...bulkReadyFiles]);
    }
    if (remainingFiles.length > 0) {
      setPendingUploads(prev => [...prev, ...remainingFiles]);
    }

    // Create system notification for uploaded file
    const newNotif: Notification = {
      id: 'n_up_' + Date.now(),
      userId: user.id,
      title: 'Успешная загрузка',
      body: `Загружено файлов: ${newFiles.length} шт. Добавьте параметры печати для заказа.`,
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

  // 3D-наклон карточки услуги вслед за курсором + усиление свечения —
  // пишем стиль напрямую в DOM (не через React state), чтобы наклон был
  // плавным на каждый pixel мыши без лишних ре-рендеров.
  const handleServiceCardTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -10;
    const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 12;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
    const glow = card.querySelector('.service-card-glow') as HTMLElement | null;
    if (glow) glow.style.opacity = '1';
  };
  const handleServiceCardTiltReset = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform = '';
    const glow = card.querySelector('.service-card-glow') as HTMLElement | null;
    if (glow) glow.style.opacity = '0';
  };

  // Клиент ошибся с параметрами уже настроенного файла — возвращаем файл
  // обратно в очередь на настройку и снова открываем ту же модалку
  // "Настройте параметры печати", вместо удаления и повторной загрузки.
  const editUploadedFile = (id: string) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (!file) return prev;
      setPendingUploads(p => [...p, file]);
      setActiveConfigFileId(id);
      return prev.filter(f => f.id !== id);
    });
  };

  // ===== Конструктор коллажа А4 =====
  // Клиент выбирает уже загруженные фото, они автоматически раскладываются
  // сеткой на лист(ы) А4 (пока не займут максимум COLLAGE_MAX_PER_SHEET —
  // дальше начинается следующий лист), рисуются на canvas и отправляются
  // на сервер как единый файл, как и обычная загрузка.
  const COLLAGE_PRICE_PLAIN = 65;
  const COLLAGE_PRICE_PHOTO = 100;
  const collagePriceFor = (paper?: 'plain' | 'photo') => paper === 'photo' ? COLLAGE_PRICE_PHOTO : COLLAGE_PRICE_PLAIN;
  const COLLAGE_MAX_PER_SHEET = 9;
  const [showCollageBuilder, setShowCollageBuilder] = useState(false);
  const [collageSelectedIds, setCollageSelectedIds] = useState<string[]>([]);
  const [collagePaperChoice, setCollagePaperChoice] = useState<'plain' | 'photo'>('photo');
  const [collageBuilding, setCollageBuilding] = useState(false);

  const collageEligibleFiles = uploadedFiles.filter(f => f.paperType === 'photo' && f.previewUrl);

  const toggleCollageSelect = (id: string) => {
    setCollageSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const collageGridFor = (n: number) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    return { cols, rows };
  };

  const collageSheets: PrintFile[][] = [];
  for (let i = 0; i < collageSelectedIds.length; i += COLLAGE_MAX_PER_SHEET) {
    const ids = collageSelectedIds.slice(i, i + COLLAGE_MAX_PER_SHEET);
    collageSheets.push(ids.map(id => collageEligibleFiles.find(f => f.id === id)).filter(Boolean) as PrintFile[]);
  }

  const renderCollageSheet = (files: PrintFile[]): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const W = 1240, H = 1754; // A4 при ~150 dpi
      const margin = 40, gutter = 20;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas не поддерживается браузером')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      const { cols, rows } = collageGridFor(files.length);
      const cellW = (W - margin * 2 - gutter * (cols - 1)) / cols;
      const cellH = (H - margin * 2 - gutter * (rows - 1)) / rows;

      const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('Не удалось загрузить одно из фото'));
        img.src = src;
      });

      (async () => {
        try {
          for (let i = 0; i < files.length; i++) {
            const img = await loadImage(files[i].previewUrl!);
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = margin + col * (cellW + gutter);
            const y = margin + row * (cellH + gutter);

            const scale = Math.max(cellW / img.width, cellH / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const dx = x + (cellW - drawW) / 2;
            const dy = y + (cellH - drawH) / 2;

            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, cellW, cellH);
            ctx.clip();
            ctx.drawImage(img, dx, dy, drawW, drawH);
            ctx.restore();
          }
          canvas.toBlob((blob) => {
            if (blob) resolve(blob); else reject(new Error('Не удалось собрать изображение'));
          }, 'image/jpeg', 0.92);
        } catch (err) {
          reject(err as Error);
        }
      })();
    });
  };

  const confirmCollage = async () => {
    if (collageSheets.length === 0) return;
    setCollageBuilding(true);
    const includedIds = new Set(collageSelectedIds);
    try {
      for (let s = 0; s < collageSheets.length; s++) {
        const sheetFiles = collageSheets[s];
        const blob = await renderCollageSheet(sheetFiles);
        const fileId = 'collage_' + Date.now() + '_' + s + '_' + Math.floor(Math.random() * 1000);
        const compositeFile = new File([blob], `Коллаж А4 ${s + 1}.jpg`, { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);

        const newFile: PrintFile = {
          id: fileId,
          name: compositeFile.name,
          size: compositeFile.size,
          type: 'image/jpeg',
          uploadedAt: new Date().toISOString(),
          formatGroup: 'image',
          pageCount: 1,
          previewUrl,
          paperType: 'collage',
          format: 'a4',
          fileCopies: 1,
          collageCount: sheetFiles.length,
          collagePaper: collagePaperChoice,
        };

        setUploadedFiles(prev => [...prev, newFile]);
        uploadFileToFirebaseStorage(compositeFile, fileId);
      }
      setUploadedFiles(prev => prev.filter(f => !includedIds.has(f.id)));
      setCollageSelectedIds([]);
      setShowCollageBuilder(false);
    } catch (err) {
      setUploadError('Не удалось собрать коллаж: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCollageBuilding(false);
    }
  };

  // Build the order from uploaded files
  const handlePlaceOrder = async (e: React.FormEvent, onReceipt: boolean = false) => {
    e.preventDefault();
    if (!isWorkingHours()) {
      setUploadError("К сожалению, отправка заказов приостановлена во внерабочее время. Мы работаем: Пн-Пт 09:00-19:00, Сб-Вс 10:00-19:00.");
      return;
    }
    if (uploadedFiles.length === 0 && !selectedService) return;

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
      // Архив (авто-собранный из >2 файлов или загруженный клиентом .zip)
      // ценится по честно подсчитанному содержимому, а не по стандартной
      // постраничной формуле ниже (см. handleFiles) — как и в двух других
      // местах, где отображается цена файла (иначе итог заказа разъедется
      // с тем, что клиент видел на экране при загрузке).
      if (f.bundleFixedPrice !== undefined) return acc + f.bundleFixedPrice;
      const isPhotoFile = f.paperType === 'photo';
      const isCollageFile = f.paperType === 'collage';
      const fileCopies = f.fileCopies || 1;
      const pages = f.pageCount || 1;
      const fillPct = f.colorFillPercent ?? 50;
      const isA3 = f.format === 'a3';
      const isBindingFile = f.format === 'binding';
      const pp = isCollageFile
        ? collagePriceFor(f.collagePaper)
        : isPhotoFile
        ? (photoSizePrices[f.photoSize || '10x15'] || 20)
        : isA3
        ? a3FilePrice(f)
        : isBindingFile
        ? bindingFilePrice(f)
        : ((f.printColor || 'bw') === 'bw' ? 20 : (fillPct <= 20 ? 25 : fillPct <= 60 ? 40 : 65));
      return acc + pp * (isPhotoFile || isCollageFile || isBindingFile ? 1 : pages) * fileCopies;
    }, 0);
    const totalPagesForBinding = uploadedFiles.reduce((acc, f) => acc + (f.pageCount || 1), 0);
    const orderCopiesForBinding = uploadedFiles[0]?.fileCopies || 1;
    const bindingFee = binding !== 'none' ? bindingFeePerCopy(binding, totalPagesForBinding) * orderCopiesForBinding : 0;
    const subtotalWithBinding = subtotal + bindingFee;
    const totalCost = finalDiscount ? Math.round(subtotalWithBinding * (1 - finalDiscount / 100)) : subtotalWithBinding;

    // Если заказ из витрины услуг — добавляем цену услуги
    const serviceExtra = selectedService?.price || 0;
    const finalTotalCost = totalCost + serviceExtra;

    // Порядковый номер берём из атомарного Firestore-счётчика (counters/orders),
    // чтобы у новых заказов был короткий читаемый номер вместо случайных букв
    // (ORD-1000, ORD-1001, ...), сохраняя глобальную уникальность даже при
    // одновременном оформлении несколькими клиентами. Если счётчик недоступен
    // (сеть/права) — откатываемся на прежнюю схему, чтобы не заблокировать
    // оформление заказа.
    let orderId: string;
    try {
      const orderNumber = await getNextOrderNumber();
      orderId = `ORD-${orderNumber}`;
    } catch {
      orderId = `ORD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }

    const newOrder: Order = {
      id: orderId,
      userId: getLiveUserId(),
      userName: user.fullName,
      userEmail: user.email,
      files: uploadedFiles,
      orderDate: new Date().toISOString(),
      status: 'pending',
      totalCost: finalTotalCost,
      paymentStatus: 'unpaid',
      paperType: (uploadedFiles[0]?.paperType === 'photo' || uploadedFiles[0]?.paperType === 'collage')
        ? 'glossy'
        : (uploadedFiles[0]?.format === 'a3' ? 'standard_a3' : 'standard'),
      paperDensity: 'regular',
      printColor: (uploadedFiles[0]?.printColor || 'bw') as 'bw' | 'color' | 'color_full',
      copies: uploadedFiles[0]?.fileCopies || 1,
      notes: notes.trim(),
      binding,
      ...(finalPromo ? { promoCode: finalPromo, promoDiscount: finalDiscount } : {}),
      ...(selectedService ? { serviceId: selectedService.id } : {}),
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
        format: f.format || 'a4',
        printColor: f.printColor || 'bw',
        fileCopies: f.fileCopies || 1,
        photoSize: f.photoSize || null,
        photoBorder: f.paperType === 'photo' ? (f.photoBorder || 'borderless') : null,
        formatGroup: f.formatGroup || 'other',
        pageCount: f.pageCount || 1,
        colorFillPercent: f.colorFillPercent || 0,
        collageCount: f.paperType === 'collage' ? (f.collageCount || 0) : null,
        collagePaper: f.paperType === 'collage' ? (f.collagePaper || 'plain') : null,
      }))
    };
    // Оплата при получении — без похода в ЮKassa: заказ сразу пишется в базу
    // как есть, admin увидит его в очереди и отметит оплаченным при выдаче.
    if (onReceipt) {
      const onReceiptOrder = { ...pendingOrder, paymentMethod: 'При получении (Наличные/Карта)' };
      setUploadError('');
      setOrderAcceptPhase('loading');
      try {
        await withTimeout(setDoc(doc(db, 'orders', orderId), onReceiptOrder), 15000);
        trackAnalyticsEvent('order_created');
        onUpdateDatabase({ orders: [onReceiptOrder, ...database.orders], users: updatedUsers });
        setUploadedFiles([]);
        setNotes('');
        setBinding('none');
        setAppliedPromo(null);
        setPromoCode('');
        setPromoError(null);
        setSelectedService(null);
        setActiveTab('orders');
        setMobileHome(false);
        setOrderAcceptPhase('success');
        setTimeout(() => setOrderAcceptPhase('idle'), 1400);
        playPlaceOrderSound();
      } catch (err) {
        console.error('On-receipt order error:', err);
        setUploadError('Не удалось создать заказ. Проверьте интернет и попробуйте ещё раз.');
        setOrderAcceptPhase('idle');
      }
      return;
    }

    sessionStorage.setItem('pending_order', JSON.stringify(pendingOrder));

    // Показываем что идёт обработка
    setUploadError('');
    const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (btn) { btn.disabled = true; btn.textContent = 'Создаём платёж...'; }

    // Создаём платёж в ЮKassa (withTimeout не даёт кнопке зависнуть навсегда
    // на нестабильной мобильной сети — см. объявление функции выше).
    setOrderAcceptPhase('loading');
    (async () => {
      try {
        // Пишем заказ в базу ДО обращения к payment-create.php — серверный
        // код читает оттуда реальную сумму заказа (защита от подделки
        // суммы платежа), значит документ обязан уже существовать к этому
        // моменту, а не только после успешного ответа ЮKassa.
        await withTimeout(setDoc(doc(db, 'orders', orderId), pendingOrder), 15000);
        trackAnalyticsEvent('order_created');

        const res = await withTimeout(
          fetch('https://sever-18.ru/api/payment-create.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, amount: finalTotalCost, email: user.email }),
          }),
          15000
        );
        const data = await res.json();

        if (data.paymentUrl && data.paymentId) {
          const updated = { ...pendingOrder, transactionId: data.paymentId };
          sessionStorage.setItem('pending_order', JSON.stringify(updated));
          // Дозаписываем transactionId, полученный от ЮKassa (сам заказ уже
          // существует в базе — записан выше, до вызова payment-create.php).
          await withTimeout(setDoc(doc(db, 'orders', orderId), updated), 15000);
          onUpdateDatabase({ orders: [updated, ...database.orders], users: updatedUsers });
          setUploadedFiles([]);
          setNotes('');
          setBinding('none');
          setAppliedPromo(null);
          setPromoCode('');
          setPromoError(null);
          setSelectedService(null);
          setActiveTab('orders');
          setMobileHome(false);
          setOrderAcceptPhase('success');
          await new Promise(r => setTimeout(r, 900));
          window.location.href = data.paymentUrl;
        } else {
          // ЮKassa недоступна — заказ уже записан выше, просто показываем модалку
          onUpdateDatabase({ orders: [pendingOrder, ...database.orders], users: updatedUsers });
          setUploadedFiles([]);
          setNotes('');
          setBinding('none');
          setAppliedPromo(null);
          setPromoCode('');
          setPromoError(null);
          setActiveTab('orders');
          setMobileHome(false);
          setPayingOrder(pendingOrder);
          setOrderAcceptPhase('success');
          setTimeout(() => setOrderAcceptPhase('idle'), 1400);
        }
      } catch (err) {
        console.error('Payment error:', err);
        const isTimeout = err instanceof Error && err.message === 'timeout';
        setUploadError(
          isTimeout
            ? 'Не удалось создать платёж — слишком слабое соединение. Проверьте интернет и попробуйте ещё раз.'
            : 'Ошибка создания платежа. Попробуйте ещё раз.'
        );
        setOrderAcceptPhase('idle');
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
      userId: getLiveUserId(),
      senderId: getLiveUserId(),
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

    // Уведомляем администратора в Telegram о новом сообщении от клиента
    fetch('https://sever-18.ru/api/telegram_admin_notify.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `💬 <b>Новое сообщение от ${user.fullName}</b>\n\n${chatInput.trim()}`
      })
    }).catch(() => {});

    setChatInput('');
  };

  // Отправка формы "Есть пожелание или замечание?" — пишет в отдельную
  // коллекцию feedback (не в чат), админ отвечает уже обычным сообщением в чате.
  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim() || feedbackSending) return;
    setFeedbackSending(true);
    try {
      await sendFeedbackToFirebase({
        id: 'fb_' + Date.now(),
        userId: getLiveUserId(),
        userName: user.fullName,
        userEmail: user.email,
        message: feedbackText.trim(),
        timestamp: new Date().toISOString(),
      });
      setFeedbackText('');
      setFeedbackSent(true);
      localStorage.setItem(`feedback_sent_${user.id}`, '1');

      // Праздничный момент на весь экран — конфетти + большое "спасибо"
      playOrderSuccessSound();
      setConfettiActive(true);
      setFeedbackCelebrate(true);
      setTimeout(() => setConfettiActive(false), 5000);
      setTimeout(() => setFeedbackCelebrate(false), 3200);
    } catch (err) {
      console.error('Failed to send feedback:', err);
    } finally {
      setFeedbackSending(false);
    }
  };

  // Отправка стикера клиентом — уходит сразу же по клику
  const handleSendSticker = (sticker: { src: string; label: string }) => {
    const fullUrl = window.location.origin + sticker.src;
    const newMsg: ChatMessage = {
      id: 'c_sticker_' + Date.now(),
      userId: getLiveUserId(),
      senderId: getLiveUserId(),
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
      window.Notification.requestPermission().then(async (status) => {
        setPushConsent(status);
        localStorage.setItem('print_shop_push_consent', status);
        if (status === 'granted') {
          try {
            await subscribeToPushNotifications(user.id);
          } catch (err) {
            console.error('Push subscription failed:', err);
          }
        }
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

  // Конфиг пунктов меню — общий для десктопного сайдбара (в <aside>) и мобильного
  // экрана "Главная" с плитками (в <main>), чтобы они не расходились при правках.
  const navItems: {
    key: string;
    label: string;
    icon: typeof Upload;
    glow: string;
    isActive: boolean;
    onClick: () => void;
    badge?: React.ReactNode;
  }[] = [
    {
      key: 'upload',
      label: 'Загрузка и Заказ',
      icon: GlassUploadIcon,
      glow: 'capsule-glow-purple',
      isActive: activeTab === 'upload',
      onClick: () => setActiveTab('upload'),
    },
    {
      key: 'orders',
      label: 'Мои Заказы',
      icon: GlassOrdersRefIcon,
      glow: 'capsule-glow-indigo',
      isActive: activeTab === 'orders',
      onClick: () => setActiveTab('orders'),
      badge: userOrders.some(o => o.status === 'ready') ? (
        <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 z-10 animate-pulse border border-white shadow-[0_0_6px_2px_rgba(16,185,129,0.55)]" />
      ) : userOrders.some(o => o.status !== 'printed') ? (
        <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#ef4444] z-10 animate-ping border border-white" />
      ) : null,
    },
    {
      key: 'chat',
      label: 'Чат',
      icon: GlassChatIcon,
      glow: 'capsule-glow-green',
      isActive: activeTab === 'chat',
      onClick: () => setActiveTab('chat'),
      badge: unreadChatsCount > 0 ? (
        <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center z-10 animate-bounce border border-white shadow-md">
          {unreadChatsCount}
        </span>
      ) : null,
    },
    {
      key: 'profile',
      label: 'Личный кабинет',
      icon: GlassProfileIcon,
      glow: 'capsule-glow-rainbow',
      isActive: activeTab === 'profile',
      onClick: () => { setActiveTab('profile'); handleMarkNotificationsRead(); },
      // На мобильной "Главной" эта плитка одна отвечает и за кабинет, и за чат,
      // и за контакты — бейдж суммирует непрочитанные уведомления и чат.
      badge: (unreadNotificationsCount + unreadChatsCount) > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center z-20 border border-white shadow-md">
          {unreadNotificationsCount + unreadChatsCount}
        </span>
      ) : null,
    },
    {
      key: 'settings',
      label: 'Настройки',
      icon: GlassSettingsRefIcon,
      glow: 'capsule-glow-purple',
      isActive: activeTab === 'profile',
      onClick: () => { setActiveTab('profile'); handleMarkNotificationsRead(); },
    },
    {
      key: 'contacts',
      label: 'Контакты',
      icon: Phone,
      glow: 'capsule-glow-cyan',
      isActive: activeTab === 'contacts',
      onClick: () => setActiveTab('contacts'),
    },
    {
      key: 'services',
      label: 'Услуги',
      icon: GlassPrintIcon,
      glow: 'capsule-glow-orange',
      isActive: activeTab === 'services',
      onClick: () => setActiveTab('services'),
    },
    ...(!user.telegramChatId ? [{
      key: 'telegram',
      label: 'Уведомления',
      icon: GlassNotifyRefIcon,
      glow: 'capsule-glow-cyan',
      isActive: false,
      onClick: () => setShowTelegramModal(true),
    }] : []),
  ];

  // Плитки-категории услуг для мобильной "Главной" (Печать фото/Документы/Сканирование/
  // Ламинация/Сувениры) — каждая просто открывает раздел "Услуги", отфильтрованный по
  // категории. Реальные услуги/цены остаются полностью на стороне админки, тут ничего
  // не выдумываем — если категория пустая, покажется честное "пока нет предложений".
  const categoryTiles: typeof navItems = [
    ...(Object.keys(serviceCategoryLabels) as (keyof typeof serviceCategoryLabels)[]).map(key => ({
      key: `category-${key}`,
      label: serviceCategoryLabels[key],
      icon: serviceCategoryIcons[key],
      glow: serviceCategoryGlows[key],
      isActive: false,
      // "Печать фото" и "Документы" — не витрина услуг, а сразу вкладка
      // загрузки: человек сам жмёт "Выберите файлы" (никакого автооткрытия
      // системного окна), а nextUploadIsPhotoRef заранее помечает, что именно
      // эта порция файлов — фото, чтобы модалка сразу показала размер/рамку,
      // а не общий выбор "какая бумага".
      onClick: key === 'photo'
        ? () => { nextUploadIsPhotoRef.current = true; setActiveTab('upload'); setMobileHome(false); }
        : key === 'documents'
        ? () => { nextUploadIsDocsRef.current = true; setActiveTab('upload'); setMobileHome(false); }
        : key === 'binding'
        ? () => { nextUploadIsBindingRef.current = true; setActiveTab('upload'); setMobileHome(false); }
        : () => { setServiceCategoryFilter(key); setActiveTab('services'); },
    })),
    {
      key: 'category-all',
      label: 'Услуги',
      icon: GlassPrintIcon,
      glow: 'capsule-glow-orange',
      isActive: false,
      onClick: () => { setServiceCategoryFilter(null); setActiveTab('services'); },
    },
    {
      key: 'category-a3',
      label: 'А3',
      icon: GlassA3RefIcon,
      glow: 'capsule-glow-indigo',
      isActive: false,
      onClick: () => { nextUploadIsA3Ref.current = true; setActiveTab('upload'); setMobileHome(false); },
    },
    {
      key: 'category-polaroid',
      label: 'Полароид',
      icon: GlassPolaroidRefIcon,
      glow: 'capsule-glow-cyan',
      isActive: false,
      onClick: () => { nextUploadIsPolaroidRef.current = true; setActiveTab('upload'); setMobileHome(false); },
    },
  ];

  const homeAllTiles = [
    // Заказы/Чат — самые нужные разделы, должны быть на первой странице
    // плиток всегда, даже когда категорий услуг наберётся больше 9 и они
    // уйдут на следующую свайп-страницу. "Личный кабинет" сюда не входит —
    // для него уже есть отдельная иконка в нижнем доке, дублировать плиткой
    // на "Главной" не нужно (клиент попросил убрать дубль).
    ...navItems.filter(item => !['services', 'contacts', 'upload', 'profile'].includes(item.key)),
    ...categoryTiles,
  ];
  const homeOrderedTiles = homeTileOrder.length
    ? [...homeAllTiles].sort((a, b) => {
        const ia = homeTileOrder.indexOf(a.key);
        const ib = homeTileOrder.indexOf(b.key);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
    : homeAllTiles;
  // 3×3 на страницу — если плиток больше, они уходят на следующий свайп-экран,
  // а не растягивают "Главную" вертикальным скроллом.
  const homeTilePages = Array.from(
    { length: Math.ceil(homeOrderedTiles.length / homeTilesPerPage) || 1 },
    (_, i) => homeOrderedTiles.slice(i * homeTilesPerPage, (i + 1) * homeTilesPerPage)
  );

  // FLIP-анимация плавной перестановки: перед тем как порядок в DOM поменяется,
  // запоминаем текущее положение каждой плитки (First), а после того как React
  // перерисовал их в новом порядке (Last) — мгновенно (без transition) ставим
  // каждой плитке transform, откатывающий её обратно в старую позицию
  // (Invert), и уже следующим кадром включаем transition и убираем transform,
  // так что плитка визуально "едет" из старого места в новое (Play), а не
  // прыгает мгновенно.
  const homeTileElsRef = useRef<Record<string, HTMLElement | null>>({});
  const homeTileRectsRef = useRef<Record<string, DOMRect>>({});
  useLayoutEffect(() => {
    const newRects: Record<string, DOMRect> = {};
    Object.entries(homeTileElsRef.current).forEach(([key, el]: [string, HTMLElement | null]) => {
      if (el) newRects[key] = el.getBoundingClientRect();
    });
    const oldRects = homeTileRectsRef.current;
    Object.entries(newRects).forEach(([key, newRect]) => {
      const oldRect = oldRects[key];
      const el = homeTileElsRef.current[key];
      if (!el || !oldRect) return;
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      // Плитку, которую сейчас реально тащит палец, не трогаем — её позиция
      // и так следует за пальцем через отдельный inline-transform.
      if (key === draggedTileKey) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // Форсируем синхронный reflow, чтобы браузер зафиксировал "старую"
      // позицию ДО того, как в следующем кадре включится transition —
      // без этого оба style-апдейта иногда схлопываются в один и плитка
      // просто прыгает на новое место без анимации.
      void el.offsetHeight;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = '';
      });
    });
    homeTileRectsRef.current = newRects;
  }, [homeTileOrder]);

  return (
    <div id="client-dashboard-root" className="liquid-glass-bg min-h-dvh md:h-dvh text-slate-800 dark:text-slate-100 flex flex-col md:flex-row transition-colors duration-300 relative overflow-x-hidden overflow-y-auto md:overflow-hidden">

      {/* Neutral frosted glow accents (no color tint) */}

      {/* Заказ принят — круг-загрузчик плавно перетекает в галочку (по мотивам
          asynchrone-loader: круг рисуется/крутится пока идёт запрос, затем
          скрывается и вместо него дорисовывается путь галочки). */}
      <AnimatePresence>
        {orderAcceptPhase !== 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md pointer-events-none"
          >
            <div className="flex flex-col items-center gap-5">
              <svg width="110" height="110" viewBox="0 0 110 110" fill="none">
                {orderAcceptPhase === 'loading' && (
                  <motion.circle
                    cx="55" cy="55" r="46"
                    stroke="#818cf8"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray="80 209"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    style={{ transformOrigin: '55px 55px' }}
                  />
                )}
                {orderAcceptPhase === 'success' && (
                  <>
                    <motion.circle
                      cx="55" cy="55" r="46"
                      stroke="#10b981"
                      strokeWidth="8"
                      initial={{ opacity: 0.3 }}
                      animate={{ opacity: 0.3 }}
                    />
                    <motion.path
                      d="M32 56L48 72L80 38"
                      stroke="#10b981"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    />
                  </>
                )}
              </svg>
              <motion.p
                key={orderAcceptPhase}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="text-white font-black text-sm uppercase tracking-widest"
              >
                {orderAcceptPhase === 'loading' ? 'Оформляем заказ...' : 'Заказ принят!'}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* LEFT NAVIGATION COLUMN — только десктоп. На телефоне вместо сайдбара
          используется отдельный экран "Главная" внутри <main> (см. ниже). */}
      <aside className="hidden md:flex md:w-64 shrink-0 md:flex-col justify-between md:py-6 md:px-4 transition-colors relative z-10" style={{background:"rgba(255,255,255,0.06)",backdropFilter:"blur(40px)",borderRight:"1px solid rgba(255,255,255,0.1)",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>

        {/* Brand / Mini Logo */}
        <div className="flex items-center gap-3 mb-8">
          <img src={logoImg} alt="Фото-Север" className="w-10 h-10 shrink-0 object-contain drop-shadow-lg" />
          <div>
            <h2 className="text-md font-bold tracking-tight text-white leading-tight">Фото-Север</h2>
            <span className="text-[11px] uppercase font-bold tracking-widest text-white/60">Северное шоссе, 18</span>
          </div>
        </div>

        <nav className="sidebar-nav flex flex-col flex-1 gap-1.5 justify-start w-full relative">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={item.onClick}
              title={item.key === 'telegram' ? 'Подключить уведомления в Telegram о статусе заказа' : undefined}
              className={`relative flex items-center gap-3 px-3 py-3 text-sm font-semibold rounded-2xl transition-all duration-200 justify-start cursor-pointer ${
                item.isActive ? 'font-black' : 'hover:text-white'
              }`}
              style={{ color: item.isActive ? '#e8f000' : 'rgba(255,255,255,0.55)' }}
            >
              {item.isActive && (
                <motion.div
                  layoutId="active-sidebar-pill"
                  className="absolute inset-0 rounded-2xl -z-10 nav-holo-pill" style={{background:"rgba(255,255,255,0.14)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.25)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 16px rgba(0,0,0,0.15)"}}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <div className={`relative glass-icon-capsule ${item.glow} shrink-0 ${item.isActive ? 'scale-105' : 'opacity-90'}`}>
                <item.icon className="w-4.5 h-4.5 text-white icon-3d-svg" />
                {item.badge}
              </div>
              <span className="z-10">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Short info bottom */}
        <div className="border-t border-slate-850 pt-5 mt-auto">
          <div className="flex items-center gap-3">
            <UserAvatar
              user={user}
              className="w-10 h-10 rounded-xl ring-2 ring-indigo-500/20 shrink-0"
            />
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user.fullName}</p>
              <p className="text-[11px] text-[#cbd5e1] truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-rose-450 hover:text-white hover:bg-rose-600 rounded-xl transition-all border border-rose-900/40 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Выйти из кабинета
          </button>
          <div className="flex justify-center gap-2.5 mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-800/50 pt-2.5">
            <button onClick={() => setActiveLegalDoc('privacy')} className="hover:text-indigo-400 cursor-pointer transition-colors">Политика</button>
            <span>&bull;</span>
            <button onClick={() => setActiveLegalDoc('terms')} className="hover:text-indigo-400 cursor-pointer transition-colors">Оферта</button>
            <span>&bull;</span>
            <button onClick={() => setActiveLegalDoc('delivery')} className="hover:text-indigo-400 cursor-pointer transition-colors">Возврат</button>
          </div>
        </div>
      </aside>

      {/* Нижняя навигация на телефоне — только на "Главной" с плитками; внутри
          раздела (mobileHome === false) за возврат отвечает кнопка "Назад" в
          шапке, дублировать её доком снизу не нужно. Панель рисуется одной
          SVG-фигурой, вырез под кнопку загрузки — часть контура (кнопка "лежит"
          в вырезе, а не просто наложена поверх плашки). Стеклянные иконки с
          бегущим бликом, цвет только у самого глифа. */}
      {mobileHome && (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{ width: navWidth, height: 90 }}
      >
        {/* Заливка + блюр вырезаны точно по контуру через clip-path (те же координаты,
            что и обводка ниже) — если браузер не понимает path() в clip-path, останется
            просто скруглённый прямоугольник за счёт borderRadius, ничего не сломается. */}
        <div
          className="nav-fill absolute inset-0"
          style={{
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            borderRadius: 22,
            clipPath: `path("${navShapePath(navWidth)}")`,
            WebkitClipPath: `path("${navShapePath(navWidth)}")`,
          } as React.CSSProperties}
        />
        <svg className="absolute inset-0 pointer-events-none" width={navWidth} height={90} viewBox={`0 0 ${navWidth} 90`}>
          <path
            className="nav-outline"
            d={navShapePath(navWidth)}
            fill="none"
            strokeWidth={1}
          />
        </svg>

        <div className="absolute inset-0 z-[1] grid grid-cols-5 items-end pb-3 px-5">
          <button
            onClick={() => setShowDocCheckModal(true)}
            className="flex flex-col items-center cursor-pointer justify-self-center active:scale-90 transition-transform"
          >
            <GlassIcon icon={GlassDocCheckRefIcon} glow="capsule-glow-green" size={44} colored />
          </button>
          <button
            onClick={() => { setActiveTab('orders'); setMobileHome(false); }}
            className="nav-shift-left relative flex flex-col items-center cursor-pointer justify-self-center"
          >
            <div className="relative">
              <GlassIcon icon={GlassOrdersRefIcon} glow="capsule-glow-indigo" size={44} colored />
              {userOrders.some(o => o.status === 'ready') ? (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 z-10 animate-pulse border border-white" />
              ) : userOrders.some(o => o.status !== 'printed') ? (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#ef4444] z-10 animate-ping border border-white" />
              ) : null}
            </div>
          </button>
          <div />
          <a
            href="tel:+79680508800"
            className="nav-shift-right flex flex-col items-center cursor-pointer justify-self-center"
          >
            <GlassIcon icon={GlassCallRefIcon} glow="capsule-glow-green" size={44} colored />
          </a>
          <button
            onClick={() => { setActiveTab('profile'); setMobileHome(false); handleMarkNotificationsRead(); }}
            className="relative flex flex-col items-center cursor-pointer justify-self-center active:scale-90 transition-transform"
          >
            <div className="relative">
              <GlassIcon icon={GlassProfileIcon} glow="capsule-glow-rainbow" size={44} colored />
              {(unreadNotificationsCount + unreadChatsCount) > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 w-3 h-3 rounded-full border border-white z-10" />
              )}
            </div>
          </button>
        </div>

        <button
          onClick={() => {
            // Центральная кнопка дока — только голосовой оверлей, без текстового
            // чата за ним (по явной просьбе клиента 2026-07-18: "чат нам не
            // нужен, только в центре экрана наш ИИ"). Закрыл оверлей — вернулся
            // туда, где был (Главная/вкладка), а не в текстовый чат.
            handleOpenVoiceOverlay();
          }}
          className="disc cursor-pointer"
          style={{ left: '50%', top: 24 }}
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            className="rounded-full object-cover pointer-events-none"
            style={{ width: 64, height: 64 }}
          >
            <source src={aiAssistantCoinWebm} type="video/webm" />
            <source src={aiAssistantCoinMp4} type="video/mp4" />
          </video>
        </button>
      </nav>
      )}

      {/* MAIN CONTENT WORKSPACE */}
      <main className={`flex-1 flex flex-col min-w-0 bg-slate-50/40 dark:bg-slate-950/50 backdrop-blur-md relative z-10 md:pb-0 ${mobileHome ? 'pb-28' : 'pb-4 mobile-page-safe-bottom'}`}>

        {/* Обои "Главной" рисуются на уровне <main>, ПОД шапкой тоже (не только
            под плитками) — иначе на стыке шапки и плиток виден шов: шапка стоит
            на обычном фоне <main>, а ниже начинаются обои. -z-10 гарантирует,
            что они красятся за любым обычным (непозиционированным) контентом
            внутри <main>, включая шапку, независимо от порядка в разметке.
            Новая пара обоев (2026-07-19, выбраны клиентом) — одна и та же
            "стеклянная лента", тёмный и светлый вариант под соответствующую
            тему; градиент оставлен под фото полупрозрачным слоем, чтобы текст
            плиток не терял контраст поверх картинки. */}
        {mobileHome && (
          <>
            <div
              className="md:hidden absolute inset-x-0 -top-4 -bottom-28 md:bottom-0 -z-10 dark:hidden bg-cover bg-center"
              style={{ backgroundImage: `url(${homeWallpaperLight})` }}
            >
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(201,211,223,0.55) 0%, rgba(184,198,214,0.55) 50%, rgba(205,214,224,0.55) 100%)' }} />
            </div>
            <div
              className="md:hidden absolute inset-x-0 -top-4 -bottom-28 md:bottom-0 -z-10 hidden dark:block bg-cover bg-center"
              style={{ backgroundImage: `url(${homeWallpaperDark})` }}
            >
              <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(26,37,53,0.6) 0%, rgba(15,26,40,0.6) 35%, rgba(18,24,32,0.6) 65%, rgba(13,21,32,0.6) 100%)' }} />
            </div>
          </>
        )}

        {/* Top bar on small / medium devices for header */}
        <header id="dashboard-header" className="md:hidden flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {!mobileHome ? (
              <button
                onClick={() => setMobileHome(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Назад
              </button>
            ) : (
              <>
                <img src={logoImg} alt="Фото-Север" className="w-8 h-8 shrink-0 object-contain drop-shadow-sm" />
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

        {/* Мобильная "Главная" — крупные подписанные плитки. Показывается вместо контента
            раздела, пока mobileHome === true; тап по плитке уводит в раздел и прячет плитки. */}
        {mobileHome && (() => {
          const cancelLongPress = () => {
            if (tileLongPressTimerRef.current) {
              clearTimeout(tileLongPressTimerRef.current);
              tileLongPressTimerRef.current = null;
            }
          };
          // Перетаскивание плитки к краю экрана перелистывает свайп-страницу,
          // как на iPhone — задержка перед перелистыванием, чтобы не улетало
          // от одного случайного касания края.
          const cancelEdgeFlip = () => {
            if (edgeFlipTimerRef.current) {
              clearTimeout(edgeFlipTimerRef.current);
              edgeFlipTimerRef.current = null;
            }
          };
          const handleDragEdgeScroll = (clientX: number) => {
            const scrollEl = homePagesScrollRef.current;
            if (!scrollEl) return;
            const rect = scrollEl.getBoundingClientRect();
            const EDGE = 36;
            const nearRight = clientX > rect.right - EDGE;
            const nearLeft = clientX < rect.left + EDGE;
            if (!nearRight && !nearLeft) {
              cancelEdgeFlip();
              return;
            }
            if (edgeFlipTimerRef.current) return;
            edgeFlipTimerRef.current = window.setTimeout(() => {
              edgeFlipTimerRef.current = null;
              const maxIndex = homeTilePages.length - 1;
              const target = Math.max(0, Math.min(maxIndex, homePageIndex + (nearRight ? 1 : -1)));
              if (target !== homePageIndex) {
                scrollEl.scrollTo({ left: target * scrollEl.clientWidth, behavior: 'smooth' });
              }
            }, 650);
          };

          return (
            <div ref={homeAreaRef} className="md:hidden relative isolate flex-1 flex flex-col min-h-full">
              {/* Обои теперь рисуются выше, на уровне <main> (см. комментарий там) —
                  так они продолжаются и под шапкой, без шва на стыке. */}
              <div className="relative z-10 p-2 pt-6">
              <div ref={homeClockWrapRef}>
                <HomeBigClock size={clockSize} resizable={jiggleMode} onCycleSize={cycleClockSize} />
              </div>
              {jiggleMode && (
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => setJiggleMode(false)}
                    className="px-4 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-black cursor-pointer"
                  >
                    Готово
                  </button>
                </div>
              )}
              <div
                ref={homePagesScrollRef}
                onScroll={handleHomePagesScroll}
                className="mobile-tile-pages flex w-full overflow-x-auto"
                style={{ scrollSnapType: jiggleMode ? 'none' : 'x mandatory' }}
              >
                {homeTilePages.map((page, pageIdx) => {
                  // Разбиваем страницу плиток на ряды по 4 — если последний ряд
                  // неполный (например 2 плитки из 4), центрируем его по сетке
                  // явным gridColumnStart, а не оставляем прижатым к левому краю:
                  // рядом с полным рядом сверху это выглядело "оборванным".
                  const tileRows: typeof page[] = [];
                  for (let r = 0; r < page.length; r += 4) tileRows.push(page.slice(r, r + 4));
                  return (
                  <nav
                    key={pageIdx}
                    className="mobile-tile-nav flex flex-col gap-y-4 w-full shrink-0"
                    style={{ scrollSnapAlign: 'start' }}
                  >
                    {tileRows.map((row, rowIdx) => {
                      const rowStartCol = row.length < 4 ? Math.floor((4 - row.length) / 2) + 1 : undefined;
                      return (
                    <div key={rowIdx} className="grid grid-cols-4 gap-x-2">
                    {row.map((item, ri) => {
                      const i = rowIdx * 4 + ri;
                      const isDragged = draggedTileKey === item.key;
                      return (
                        <button
                          key={item.key}
                          data-tile-key={item.key}
                          ref={(el) => { homeTileElsRef.current[item.key] = el; }}
                          style={{
                            '--jiggle-i': i,
                            gridColumnStart: rowStartCol !== undefined ? rowStartCol + ri : undefined,
                            transform: isDragged && tileDragPos ? `translate(${tileDragPos.x}px, ${tileDragPos.y}px) scale(1.08)` : undefined,
                            touchAction: jiggleMode ? 'none' : undefined,
                            WebkitTouchCallout: 'none',
                          } as React.CSSProperties}
                          onPointerDown={(e) => {
                            if (jiggleMode) {
                              e.preventDefault();
                              (e.target as Element).setPointerCapture?.(e.pointerId);
                              setDraggedTileKey(item.key);
                              tileDragOffsetRef.current = { x: e.clientX, y: e.clientY };
                              setTileDragPos({ x: 0, y: 0 });
                            } else {
                              tilePressStartRef.current = { x: e.clientX, y: e.clientY };
                              cancelLongPress();
                              tileLongPressTimerRef.current = window.setTimeout(() => {
                                reorderHomeTiles(homeAllTiles.map(t => t.key));
                                setJiggleMode(true);
                                navigator.vibrate?.(10);
                              }, 550);
                            }
                          }}
                          onPointerMove={(e) => {
                            if (!jiggleMode && tilePressStartRef.current) {
                              const dx = Math.abs(e.clientX - tilePressStartRef.current.x);
                              const dy = Math.abs(e.clientY - tilePressStartRef.current.y);
                              if (dx > 8 || dy > 8) cancelLongPress();
                            }
                            if (draggedTileKey) {
                              const dx = e.clientX - tileDragOffsetRef.current.x;
                              const dy = e.clientY - tileDragOffsetRef.current.y;
                              setTileDragPos({ x: dx, y: dy });
                              handleDragEdgeScroll(e.clientX);
                              // elementFromPoint берёт САМЫЙ ВЕРХНИЙ элемент в этой точке — а
                              // это как раз перетаскиваемая плитка (у неё z-index:20 и она
                              // визуально следует за пальцем/курсором), поэтому она сама себя
                              // "находила" под курсором и своп никогда не срабатывал.
                              // elementsFromPoint (мн.ч.) отдаёт весь стек по z-порядку —
                              // берём первую плитку в нём, которая не является перетаскиваемой.
                              const stack = document.elementsFromPoint(e.clientX, e.clientY);
                              const tileEl = stack
                                .map(node => node.closest('[data-tile-key]') as HTMLElement | null)
                                .find(node => node && node.dataset.tileKey !== draggedTileKey);
                              const overKey = tileEl?.dataset.tileKey;
                              if (overKey && overKey !== draggedTileKey) {
                                moveHomeTile(draggedTileKey, overKey);
                              }
                            }
                          }}
                          onPointerUp={() => {
                            cancelLongPress();
                            cancelEdgeFlip();
                            setDraggedTileKey(null);
                            setTileDragPos(null);
                          }}
                          onPointerLeave={cancelLongPress}
                          onClick={() => {
                            if (jiggleMode) return;
                            item.onClick();
                            if (item.key !== 'telegram') setMobileHome(false);
                          }}
                          className={`home-tile-btn select-none relative flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-2xl transition-all duration-200 cursor-pointer active:scale-90 ${
                            jiggleMode && !isDragged ? 'tile-jiggle' : ''
                          } ${isDragged ? 'tile-dragging' : ''}`}
                        >
                          <div className="relative">
                            <GlassIcon icon={item.icon} glow={item.glow} size={68} colored noOuterShadow />
                            {item.badge}
                          </div>
                          {/* Фиксированная высота подписи (под 2 строки) — иначе у подписей
                              в одну строку ("Чат") и в две ("Мои Заказы") получалась разная
                              общая высота плитки, и иконки в одном ряду сидели не вровень. */}
                          <span className="text-[12px] font-semibold text-center leading-tight text-slate-800 dark:text-white/85 h-[30px] flex items-center justify-center line-clamp-2">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                    </div>
                      );
                    })}
                  </nav>
                  );
                })}
              </div>
              {homeTilePages.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-4">
                  {homeTilePages.map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        idx === homePageIndex ? 'w-4 bg-slate-800 dark:bg-white' : 'w-1.5 bg-slate-400/40 dark:bg-white/30'
                      }`}
                    />
                  ))}
                </div>
              )}
              </div>
            </div>
          );
        })()}

        <header className="hidden md:flex items-center justify-between px-8 py-5 glass-panel rounded-2xl">
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
              <span className="flex items-center gap-1.5 text-[12px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-bold">
                <Check className="w-3.5 h-3.5" /> Push включены
              </span>
            )}

            <LiveClock />
            <ThemeToggle />
            <UserAvatar user={user} className="w-9 h-9 rounded-xl" />
          </div>
        </header>

        {/* WORKSPACE SECTIONS — на телефоне скрыт, пока показана "Главная" с плитками.
            Раньше прятался только через CSS (display:none), но реально оставался
            смонтированным — при переходе с "Главной" сразу в конкретный раздел
            (например "Личный кабинет") на один кадр успевал промелькнуть старый
            activeTab (обычно "upload" по умолчанию), пока AnimatePresence не
            доигрывал его exit-анимацию. На мобильном при mobileHome вообще не
            рендерим содержимое (не просто прячем), тогда переходу неоткуда
            "выезжать" — на десктопе (navWidth >= 768) содержимое нужно всегда,
            там нет экрана "Главная". */}
        <div className={`flex-1 p-4 md:p-8 space-y-6 max-w-6xl w-full mx-auto min-h-0 ${mobileHome ? 'hidden md:flex' : 'flex'} flex-col md:overflow-hidden`}>
          {(!mobileHome || navWidth >= 768) && (<>
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
                  {user.promoExpiresAt && (() => {
                    const diffDays = Math.ceil((new Date(user.promoExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (diffDays <= 0) return null;
                    return (
                      <p className="text-[12px] text-amber-200 mt-1.5 font-black select-none">
                        ⏳ Сгорит через {diffDays} {diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'}
                      </p>
                    );
                  })()}
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

          {user.referralCode && (
            <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-white rounded-3xl p-5 border border-indigo-400/30 shadow-lg shadow-indigo-500/20 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>
              <div className="flex items-start gap-3 relative z-10">
                <div className="p-3 bg-white/10 rounded-2xl border border-white/20 shrink-0">
                  <Gift className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black uppercase tracking-wider">Пригласите друга — оба получите скидку 🎁</h4>
                  <p className="text-xs text-white/85 mt-1 font-medium">
                    Друг получит 10% на первый заказ, а вы — 10% на следующий, как только он оплатит свой первый заказ.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 mt-3">
                    <div className="flex-1 bg-white/10 border border-white/25 rounded-xl px-4 py-2.5 text-sm font-bold truncate">
                      {referralLink}
                    </div>
                    <button
                      type="button"
                      onClick={handleShareReferral}
                      className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-indigo-700 font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition shrink-0 cursor-pointer"
                    >
                      {referralCopied ? <><CheckCircle className="w-3.5 h-3.5" /> Скопировано</> : <><Send className="w-3.5 h-3.5" /> Поделиться</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!feedbackDismissed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 text-white rounded-3xl p-5 border border-fuchsia-400/30 shadow-lg shadow-fuchsia-500/20 relative overflow-hidden animate-pulse-slow"
            >
              {/* background decorative shapes — тот же приём, что и у баннера с промокодом */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>

              <button
                onClick={() => { setFeedbackDismissed(true); localStorage.setItem(`feedback_dismissed_${user.id}`, '1'); }}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition z-20 cursor-pointer"
                aria-label="Скрыть"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3 relative z-10 pr-7">
                <div className="p-3 bg-white/10 rounded-2xl border border-white/20 shrink-0 animate-bounce">
                  <Gift className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black uppercase tracking-wider">Есть пожелание или замечание? 💡</h4>
                  <p className="text-xs text-white/85 mt-1 font-medium">
                    Напишите, что улучшить или предложить — в благодарность дарим промокод на скидку! Мы обязательно прочитаем и ответим вам в чате.
                  </p>

                  {feedbackSent && !user.promoCode ? (
                    <div className="flex items-center gap-2 text-white text-sm font-bold py-2 mt-2 animate-pulse">
                      <Clock className="w-4 h-4" /> Ждём подарок за ваш отзыв...
                    </div>
                  ) : (
                    <form onSubmit={handleSendFeedback} className="flex flex-col sm:flex-row gap-2 mt-3">
                      <input
                        type="text"
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Ваше пожелание или замечание..."
                        maxLength={1000}
                        className="flex-1 bg-white/10 border border-white/25 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/40"
                      />
                      <button
                        type="submit"
                        disabled={!feedbackText.trim() || feedbackSending}
                        className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-fuchsia-700 font-black text-xs px-5 py-2.5 rounded-xl shadow-md transition shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" /> {feedbackSending ? 'Отправка...' : 'Отправить'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Кнопка-вход в отдельное окно баг-репорта со скриншотом — не привязана
              к feedbackDismissed, так что остаётся доступной даже если баннер
              с пожеланиями выше закрыт. */}
          <button
            onClick={() => setShowBugReportModal(true)}
            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 py-2 transition-colors cursor-pointer"
          >
            🐞 Заметили ошибку на сайте? Прикрепите скриншот
          </button>

          <AnimatePresence mode="wait">
            {/* TAB 1: FILE UPLOADER & PROPERTIES */}
            {activeTab === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start content-start auto-rows-max w-full md:overflow-y-auto md:flex-1 md:overscroll-contain min-h-0 pr-1"
              >
                
              {/* Uploader Card */}
              <div className="lg:col-span-7 glass-cozy-card p-6 md:p-8 rounded-[32px] space-y-6">
                <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-3">
                  <div className="icon-3d-badge p-2 bg-indigo-50 dark:bg-indigo-950/40">
                    <Upload className="w-4 h-4 text-indigo-600 icon-3d-svg" />
                  </div>
                  <AnimatedTitle><span>Шаг 1. Перетащите файлы</span></AnimatedTitle>
                </h3>

                {!isWorkingHours() && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 p-5 rounded-2xl border border-rose-150 dark:border-rose-900/30 text-xs flex gap-3 shadow-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 animate-bounce" />
                    <div>
                      <p className="font-extrabold text-sm">Копи-Центр сейчас закрыт!</p>
                      <p className="mt-1 leading-relaxed opacity-90">Мы принимаем файлы и оформляем новые заказы только в рабочие часы:</p>
                      <ul className="mt-1.5 space-y-1 font-extrabold text-[12px]">
                        <li>📅 Понедельник — Пятница: 09:00 — 19:00</li>
                        <li>📅 Суббота — Воскресенье: 10:00 — 19:00</li>
                      </ul>
                      <p className="mt-2.5 text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-450">Приём файлов и заказов временно заблокирован.</p>
                    </div>
                  </div>
                )}

                {uploadError && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 p-4 rounded-2xl border border-rose-200/40 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Drag zone Area — стеклянная карточка со свечением позади */}
                <div className="relative py-2">
                  <div className="upload-glass-accents">
                    <div className="upload-acc-card" />
                    <div className="upload-acc-card" />
                    <div className="upload-acc-card" />
                    <div className="upload-glow-ring" />
                    <div className="upload-glow-ring sm" />
                    <div className="upload-top-light" />
                  </div>
                  <div
                    onDragEnter={!isWorkingHours() ? undefined : handleDrag}
                    onDragOver={!isWorkingHours() ? undefined : handleDrag}
                    onDragLeave={!isWorkingHours() ? undefined : handleDrag}
                    onDrop={!isWorkingHours() ? undefined : handleDrop}
                    onClick={!isWorkingHours() ? undefined : () => fileInputRef.current?.click()}
                    className={`upload-glass-zone p-8 md:p-12 text-center transition-all ${
                      !isWorkingHours()
                        ? 'cursor-not-allowed opacity-60'
                        : dragActive
                        ? 'is-active scale-98 cursor-pointer'
                        : 'cursor-pointer'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileInput}
                      className="hidden"
                      aria-label="Загрузить файлы для печати"
                      accept=".zip,.doc,.docx,.pdf,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.heic,.heif,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    />

                    {/* Диск в стиле присланного макета progress-bar-only.html —
                        простое тёмное кольцо с одним бегущим лучом по ободку,
                        отдельный класс от общего .disc (кнопка нижней панели),
                        чтобы её вид не менялся заодно. */}
                    <div className="upload-disc-wrap">
                      <span className="upload-beam-ring" style={{ opacity: uploadAnimPhase === 'idle' ? 1 : 0 }}><i /></span>
                      <div className="upload-disc">
                        {!isWorkingHours() ? (
                          <Clock className="animate-pulse" style={{ color: '#fb7185' }} />
                        ) : uploadAnimPhase === 'done' ? (
                          <Check className="upload-anim-check" style={{ width: 26, height: 26 }} strokeWidth={3} />
                        ) : (
                          <Upload style={{ color: '#c4b5fd' }} />
                        )}
                      </div>
                      {uploadAnimPhase === 'done' && uploadAnimSparks.map((s, i) => (
                        <span
                          key={i}
                          className="upload-anim-spark"
                          style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px` } as React.CSSProperties}
                        />
                      ))}
                    </div>

                    <p className={`text-sm font-bold ${!isWorkingHours() ? 'text-rose-400' : 'text-white'}`}>
                      {!isWorkingHours()
                        ? 'Прием файлов приостановлен (Центр Закрыт)'
                        : uploadAnimPhase === 'busy' ? 'Загружаем файл…'
                        : uploadAnimPhase === 'done' ? 'Файл загружен'
                        : 'Выберите файлы или перетащите их сюда'}
                    </p>
                    {uploadAnimPhase === 'idle' && (
                      <p className="text-xs text-slate-400 mt-2">
                        {!isWorkingHours()
                          ? 'Мы принимаем файлы только в рабочие часы Пн-Пт 09:00 - 19:00, Сб-Вс 10:00 - 19:00. Приходите к нам завтра!'
                          : 'Поддерживаются любые типы форматов: архивы (zip, rar), изображения (jpg, png) и документы (pdf, docx, xlsx, txt) до 100 МБ.'
                        }
                      </p>
                    )}
                    {uploadAnimPhase === 'busy' && (
                      <div className="upload-anim-bar-wrap">
                        <div className="upload-anim-track">
                          <div
                            className="upload-anim-fill"
                            style={{ width: `${uploadAnimProgress}%`, background: uploadAnimProgressColor(uploadAnimProgress) }}
                          >
                            <div className="upload-anim-shimmer" />
                          </div>
                        </div>
                        <div className="upload-anim-num">Загружаем… {Math.round(uploadAnimProgress)}%</div>
                        <div className="upload-anim-segs">
                          {Array.from({ length: 10 }).map((_, i) => {
                            const lit = i < Math.round((uploadAnimProgress / 100) * 10);
                            const col = uploadAnimProgressColor(uploadAnimProgress);
                            return (
                              <div
                                key={i}
                                className="upload-anim-seg"
                                style={lit ? { background: col, boxShadow: `0 0 6px ${col}` } : undefined}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Uploaded Queue Items */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/40 p-3 rounded-2xl gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                        Список к отправке на печать ({uploadedFiles.length})
                      </span>
                      {collageEligibleFiles.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => { setCollageSelectedIds([]); setShowCollageBuilder(true); }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 text-[12px] font-black flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Layers className="w-3.5 h-3.5" /> Собрать в коллаж А4
                        </button>
                      )}
                    </div>

                    <div className="space-y-3 pr-1">
                      {uploadedFiles.map(file => {
                        const isPhoto = file.paperType === 'photo';
                        const isCollage = file.paperType === 'collage';
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
                        const isBindingFile = file.format === 'binding';
                        const isBundle = file.bundleFixedPrice !== undefined;
                        const filePP = isCollage ? collagePriceFor(file.collagePaper)
                          : isPhoto ? selSize.price
                          : isA3 ? a3FilePrice(file)
                          : isBindingFile ? bindingFilePrice(file)
                          : ((file.printColor || 'bw') === 'bw' ? 20 : colorFillPrice(fillPct));
                        const fileCost = isBundle ? file.bundleFixedPrice! : filePP * (isPhoto || isCollage || isBindingFile ? 1 : pages) * copies;

                        return (
                          <div key={file.id} className="glass-panel rounded-2xl overflow-hidden">
                            {/* Строка файла */}
                            <div className="flex items-center gap-3 p-3.5">
                              <div className="p-2.5 glass-icon-capsule glass-icon-indigo shrink-0">
                                <FileType className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-base font-bold text-white truncate">{file.name}</p>
                                <span className="text-sm text-white/60 block mt-1">
                                  {formatFileSize(file.size)} · {file.formatGroup.toUpperCase()}
                                  {isBundle
                                    ? ` · ${file.bundleFileCount} файлов`
                                    : (file.pageCount !== undefined ? ` · ${file.pageCount} стр.` : ' · сканирование...')}
                                  {file.url ? ' · ✓ Загружено' : ' · Загрузка...'}
                                  {file.colorFillPercent !== undefined && (file.printColor || 'bw') !== 'bw' && !isPhoto && !isCollage && (
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

                            {/* Краткая сводка выбранных параметров — можно передумать и открыть
                                настройку заново, не удаляя и не перезагружая файл. Для
                                zip-архива (bundleFixedPrice) редактировать нечего — внутри
                                несколько разных файлов с настройками по умолчанию. */}
                            {isBundle ? (
                              <div className="border-t border-white/8 px-3.5 py-2.5 flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-white/50">
                                <span className="px-2 py-1 rounded-lg bg-white/5">📦 Архив · {file.bundleFileCount} файлов</span>
                                <span className="px-2 py-1 rounded-lg bg-white/5">по умолчанию: фото — цвет 10×15, документы — Ч/Б</span>
                              </div>
                            ) : (
                            <div className="border-t border-white/8 px-3.5 py-2.5 flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-white/50">
                              {!isCollage && <span className="px-2 py-1 rounded-lg bg-white/5">{(file.printColor || 'bw') === 'bw' ? '⚪ Ч/Б' : '🔵 Цвет'}</span>}
                              <span className="px-2 py-1 rounded-lg bg-white/5">
                                {isCollage ? `🖼️ Коллаж А4 (${file.collagePaper === 'photo' ? 'фото' : 'обычная'}) · ${file.collageCount || '?'} фото` : isPhoto ? `🖼 Фото ${selSize.label}` : `📄 Обычная · ${(file.format || 'a4').toUpperCase()}`}
                              </span>
                              {isPhoto && <span className="px-2 py-1 rounded-lg bg-white/5">{(file.photoBorder || 'borderless') === 'bordered' ? '🖼 С рамкой' : '✂️ Без рамки'}</span>}
                              {!isCollage && <span className="px-2 py-1 rounded-lg bg-white/5">{copies} шт.</span>}
                              {!isCollage && (
                                <button
                                  type="button"
                                  onClick={() => editUploadedFile(file.id)}
                                  className="ml-auto px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Sliders className="w-3 h-3" /> Изменить
                                </button>
                              )}
                            </div>
                            )}

                            {/* Стоимость файла */}
                            <div className="px-3.5 pb-3 flex justify-between items-center text-sm text-white/60">
                              <span>
                                {isCollage
                                  ? `Лист А4-коллаж (${file.collagePaper === 'photo' ? 'фото' : 'обычная'}) × ${collagePriceFor(file.collagePaper)} ₽`
                                  : isPhoto
                                  ? `${selSize.label} × ${selSize.price} ₽ × ${copies} шт.`
                                  : isBindingFile
                                  ? `${pages} стр., пружина ${file.bindingKind === 'spring_metal' ? 'металл' : 'пластик'} × ${filePP} ₽ × ${copies} шт.`
                                  : `${pages} стр. × ${filePP} ₽${!isA3 && (file.printColor || 'bw') !== 'bw' ? ` (${colorFillLabel(fillPct)}, ${fillPct}% цвета)` : ''} × ${copies} шт.`}
                              </span>
                              <strong className="text-white text-lg">{fileCost} ₽</strong>
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
                      <span className="text-[11px] font-bold text-slate-405 dark:text-slate-550 italic">
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
                        <div className="bg-white/95 dark:bg-slate-900/95 text-[12px] font-black text-indigo-600 dark:text-indigo-400 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transform translate-y-1 group-hover:translate-y-0 transition-all duration-300 border border-slate-200/55 dark:border-slate-800/80">
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
                                  <div className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full border border-sky-500/20 flex items-center justify-center bg-white/70 shadow-xs text-sky-650 font-bold text-[9px] animate-pulse">
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
                                  <div className="border border-slate-705 p-1 bg-slate-800/40 rounded-lg text-center text-[10px] font-bold uppercase tracking-widest mt-1.5">
                                    Твердый переплет
                                  </div>
                                  <div className="space-y-1 my-auto">
                                    <div className="h-1 bg-slate-500/30 rounded-full w-3/4 mx-auto" />
                                    <div className="h-1 bg-slate-505/30 rounded-full w-1/2 mx-auto" />
                                  </div>
                                  <div className="text-[9px] text-center text-slate-400 font-mono tracking-wider font-extrabold pb-1">
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
                                          loading="lazy"
                                          className="w-full h-full object-cover"
                                          alt={uploadedFiles[0].name}
                                          referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute top-1 right-1 bg-indigo-650/85 text-white text-[7px] font-black tracking-widest px-1 py-0.5 rounded-sm">
                                          ПЕЧАТЬ ИЗОБРАЖЕНИЯ
                                        </div>
                                      </div>
                                      <div className="flex justify-between items-center text-[7px] font-bold text-slate-500 font-mono px-0.5">
                                        <span className="truncate max-w-[110px]">{uploadedFiles[0].name}</span>
                                        <span>{formatFileSize(uploadedFiles[0].size)}</span>
                                      </div>
                                    </div>
                                  ) : uploadedFiles[0] ? (
                                    // Real Uploaded Document Preview Layout
                                    <div className="w-full h-full flex flex-col justify-between">
                                      <div className="flex justify-between items-center text-[8px] font-mono text-indigo-650 dark:text-indigo-400 font-bold uppercase tracking-wider">
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
                                      <div className="flex justify-between items-center text-[8px] font-mono text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                                        <span>{paperType === 'standard_a3' || paperType === 'bw_a3' ? 'A3 FORMAT' : 'A4 FORMAT'}</span>
                                        <span>{uploadedFiles.length} doc(s)</span>
                                      </div>

                                      <div className="my-auto py-4 flex flex-col items-center justify-center space-y-1">
                                        {printColor === 'bw' ? (
                                          <div className="w-14 h-14 bg-slate-50 dark:bg-slate-905 rounded-xl border border-slate-200/90 flex flex-col items-center justify-center p-2">
                                            <div className="w-full h-1.5 bg-slate-300 dark:bg-slate-600 rounded-xs mb-1" />
                                            <div className="w-5/6 h-1 bg-slate-300 dark:bg-slate-700 rounded-xs mb-1" />
                                            <div className="w-full h-1 bg-slate-350 dark:bg-slate-700 rounded-sub mb-2" />
                                            <div className="w-8 h-8 rounded-full border-4 border-slate-300 flex items-center justify-center text-[8px] font-black text-slate-405">
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
                                          <span className="text-[8px] text-slate-400 dark:text-slate-500 block uppercase font-bold tracking-wider">Тираж:</span>
                                          <span className="text-[11px] font-extrabold text-slate-800 dark:text-white leading-none">{copies} шт</span>
                                        </div>
                                        <div className="text-right leading-none">
                                          <span className="text-[8px] text-slate-400 dark:text-slate-500 block uppercase font-bold tracking-wider font-mono">МАТЕРИАЛ</span>
                                          <span className="text-[9px] font-extrabold font-mono text-indigo-650 dark:text-indigo-400 leading-none">
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
                  <AnimatedTitle><span>Шаг 2. Оформление</span></AnimatedTitle>
                </h3>

                <form onSubmit={handlePlaceOrder} className="space-y-5">

                  {/* Промокод */}
                  <div>
                    <label htmlFor="promo-code" className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
                      Промокод
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="promo-code"
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
                    {promoError && <p className="text-[11px] text-rose-400 font-bold mt-1.5 animate-pulse">{promoError}</p>}
                    {appliedPromo && <p className="text-[11px] text-emerald-400 font-bold mt-1.5">✓ Скидка применена!</p>}
                  </div>

                  {/* Заметки */}
                  <div>
                    <label htmlFor="order-notes" className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
                      Заметки печатнику
                    </label>
                    <textarea
                      id="order-notes"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Например: двухсторонняя, скрепка в углу, первая страница — обложка..."
                      rows={3}
                      className="block w-full p-3.5 rounded-xl bg-white/8 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
                    />
                  </div>

                  {/* Отделка — скрепление распечатанных страниц */}
                  {uploadedFiles.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
                        Отделка
                      </label>
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {([
                          { key: 'none', label: 'Нет' },
                          { key: 'staple', label: 'Степлер' },
                          { key: 'file', label: 'Файлик' },
                          { key: 'hard_cover', label: 'Твёрдый' },
                        ] as const).map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setBinding(opt.key)}
                            className={`py-2 rounded-lg text-[10.5px] font-black cursor-pointer transition-all border ${
                              binding === opt.key
                                ? 'bg-indigo-500/30 border-indigo-400/50 text-indigo-200'
                                : 'bg-white/8 border-white/15 text-white/70 hover:bg-white/15'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { key: 'spring_metal', label: 'Металлическая пружина', video: bindingSpringMetalAnim },
                          { key: 'spring_plastic', label: 'Пластиковая пружина', video: bindingSpringPlasticAnim },
                        ] as const).map(opt => {
                          const selected = binding === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setBinding(opt.key)}
                              className={`relative p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                                selected
                                  ? 'border-indigo-400 bg-indigo-500/20 ring-2 ring-indigo-400/30'
                                  : 'border-white/15 bg-white/5 hover:border-indigo-300/40'
                              }`}
                            >
                              {selected && (
                                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                                </div>
                              )}
                              <video
                                src={opt.video}
                                autoPlay loop muted playsInline
                                className="w-full aspect-square rounded-lg object-cover pointer-events-none"
                              />
                              <div className={`text-[10.5px] font-black leading-tight ${selected ? 'text-indigo-200' : 'text-white/80'}`}>{opt.label}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Чек */}
                  {uploadedFiles.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest text-center">* РАСЧЁТ СТОИМОСТИ *</p>

                      <div className="space-y-2 text-xs">
                        {/* Список файлов с ценами */}
                        {uploadedFiles.map((f, idx) => {
                          const isPhotoFile = f.paperType === 'photo';
                          const isCollageFile = f.paperType === 'collage';
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
                          const isBindingFile = f.format === 'binding';
                          const pp = isCollageFile ? collagePriceFor(f.collagePaper)
                            : isPhotoFile ? selSize.price
                            : isA3 ? a3FilePrice(f)
                            : isBindingFile ? bindingFilePrice(f)
                            : ((f.printColor || 'bw') === 'bw' ? 20 : (fillPct <= 20 ? 25 : fillPct <= 60 ? 40 : 65));
                          const fileCost = f.bundleFixedPrice !== undefined ? f.bundleFixedPrice : pp * (isPhotoFile || isCollageFile || isBindingFile ? 1 : pages) * fileCopies;
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
                              const isCollageFile = f.paperType === 'collage';
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
                              const isBindingFile = f.format === 'binding';
                              const pp = isCollageFile ? collagePriceFor(f.collagePaper)
                                : isPhotoFile ? selSize.price
                                : isA3 ? a3FilePrice(f)
                                : isBindingFile ? bindingFilePrice(f)
                                : ((f.printColor || 'bw') === 'bw' ? 20 : (fillPct <= 20 ? 25 : fillPct <= 60 ? 40 : 65));
                              return acc + (f.bundleFixedPrice !== undefined ? f.bundleFixedPrice : pp * (isPhotoFile || isCollageFile || isBindingFile ? 1 : pages) * fileCopies);
                            }, 0);
                            const totalPagesForBinding = uploadedFiles.reduce((acc, f) => acc + (f.pageCount || 1), 0);
                            const orderCopiesForBinding = uploadedFiles[0]?.fileCopies || 1;
                            const bindingFee = binding !== 'none' ? bindingFeePerCopy(binding, totalPagesForBinding) * orderCopiesForBinding : 0;
                            const subtotalWithBinding = subtotal + bindingFee;
                            const discount = activePromo ? getActiveDiscountPercent(activePromo) : 0;
                            const total = Math.round(subtotalWithBinding * (1 - discount / 100));
                            const savings = subtotalWithBinding - total;
                            return (
                              <>
                                {bindingFee > 0 && (
                                  <div className="flex justify-between text-white/60 font-bold text-[12px]">
                                    <span>Отделка:</span>
                                    <span>+{bindingFee} ₽</span>
                                  </div>
                                )}
                                {savings > 0 && (
                                  <div className="flex justify-between text-rose-400 font-bold text-[12px]">
                                    <span>Промокод ({activePromo}):</span>
                                    <span>−{savings} ₽</span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-[11px] font-black text-white/50 uppercase tracking-wider">Итого:</span>
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
                        <span className="text-[9px] font-mono tracking-widest text-white/25">* НОМЕР ПРИСВОИТСЯ ПОСЛЕ ОФОРМЛЕНИЯ *</span>
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
                          <p className="text-[11px] text-indigo-300 font-black uppercase tracking-widest">Услуга</p>
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
                    disabled={(uploadedFiles.length === 0 && !selectedService) || !isWorkingHours() || uploadedFiles.some(f => !f.url)}
                    className={`w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl font-black text-sm text-white transition-all ${
                      (uploadedFiles.length > 0 || selectedService) && isWorkingHours() && !uploadedFiles.some(f => !f.url)
                        ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                        : 'bg-white/10 text-white/30 cursor-not-allowed'
                    }`}
                  >
                    <FileCheck className="w-5 h-5" />
                    {!isWorkingHours()
                      ? 'Оформление временно недоступно'
                      : uploadedFiles.some(f => !f.url)
                        ? 'Загрузка файлов...'
                        : 'Оформить и оплатить онлайн'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handlePlaceOrder(e, true)}
                    disabled={(uploadedFiles.length === 0 && !selectedService) || !isWorkingHours() || uploadedFiles.some(f => !f.url)}
                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl font-bold text-xs mt-2 transition-all ${
                      (uploadedFiles.length > 0 || selectedService) && isWorkingHours() && !uploadedFiles.some(f => !f.url)
                        ? 'bg-white/8 hover:bg-white/15 text-white cursor-pointer border border-white/15'
                        : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
                    }`}
                  >
                    💵 Оплата при получении
                  </button>
                  {uploadedFiles.length === 0 && !selectedService && (
                    <p className="text-center text-[12px] text-white/30 mt-2">
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
                className="space-y-6 w-full md:overflow-y-auto md:flex-1 md:overscroll-contain min-h-0 pr-1"
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

              {orderFilter === 'completed' && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-900/40 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                  <span>🗑</span>
                  <span>Выданные заказы хранятся в архиве 48 часов, затем автоматически удаляются из базы вместе с файлами.</span>
                </div>
              )}

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
                </div>
              ) : (
                <div className="grid grid-cols-1 content-start auto-rows-max gap-6">
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
                              <span className="text-[11px] text-slate-400 font-medium">
                                {formatDateTime(ord.orderDate)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-450">
                              Файлов: <strong>{ord.files.length} шт.</strong> | {ord.copies} {ord.copies === 1 ? 'копия' : ord.copies < 5 ? 'копии' : 'копий'} &bull; Бумага: <strong>{ord.paperType.toUpperCase()}</strong> &bull; Цветность: <strong>{ord.printColor === 'bw' ? 'Черно-белая' : 'Цветная'}</strong>
                            </div>
                          </div>

                          {/* Order Status Badges indicators */}
                          <div className="flex flex-wrap items-center gap-2">
                            {ord.rejected && (
                              <span className="text-[12px] font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                                ⚠ Брак
                              </span>
                            )}
                            <span className={`text-[12px] font-bold px-3 py-1 rounded-full ${getStatusColor(ord.status)}`}>
                              {getStatusLabel(ord.status)}
                            </span>
                            {ord.paymentStatus === 'unpaid' && ord.paymentMethod === 'При получении (Наличные/Карта)' ? (
                              <span className="text-[12px] font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                                💵 Оплата при получении
                              </span>
                            ) : (
                              <span className={`text-[12px] font-bold px-3 py-1 rounded-full ${getPaymentStatusColor(ord.paymentStatus)}`}>
                                {getPaymentStatusLabel(ord.paymentStatus)}
                              </span>
                            )}
                          </div>
                        </div>

                        {ord.rejected && (
                          <div className="px-5 py-3 bg-rose-50 dark:bg-rose-950/15 border-b border-rose-100 dark:border-rose-900/40 flex items-start gap-2.5">
                            <span className="text-base shrink-0">⚠️</span>
                            <div>
                              <p className="text-[12px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-wide">Заказ не может быть выполнен</p>
                              <p className="text-xs text-rose-600 dark:text-rose-300 mt-0.5">{ord.rejectionReason}</p>
                            </div>
                          </div>
                        )}

                        {/* Order Status Stepper — mirrors admin's stage pills, read-only for client */}
                        {(
                          <div className="px-5 pt-4 pb-2 border-b border-slate-150 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/20">
                            <div className="flex items-start">
                              {[
                                { id: 'pending', label: 'Проверка' },
                                { id: 'approved', label: 'Одобрен' },
                                { id: 'printing', label: 'Печать' },
                                { id: 'ready', label: 'Готовность' },
                                { id: 'printed', label: 'Выдан' },
                              ].map((stage, idx, arr) => {
                                const stages = ['pending', 'approved', 'printing', 'ready', 'printed'];
                                const currentIdx = stages.indexOf(ord.status);
                                const isLastStage = idx === arr.length - 1;
                                const isPast = idx < currentIdx || (idx === currentIdx && isLastStage);
                                const isCurrent = idx === currentIdx && !isLastStage;
                                return (
                                  <React.Fragment key={stage.id}>
                                    <div className="flex flex-col items-center gap-1.5 shrink-0 w-14">
                                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black border-2 transition-all ${
                                        isPast
                                          ? 'bg-emerald-500 border-emerald-500 text-white'
                                          : isCurrent
                                          ? (stage.id === 'ready'
                                              ? 'bg-indigo-600 border-indigo-600 text-white stage-ready-blink'
                                              : 'bg-indigo-600 border-indigo-600 text-white animate-pulse shadow-lg shadow-indigo-500/30')
                                          : 'bg-slate-100 dark:bg-slate-850 border-slate-200 dark:border-slate-700 text-slate-400'
                                      }`}>
                                        {isPast ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                                      </div>
                                      <span className={`text-[10px] font-bold uppercase tracking-tight text-center leading-tight ${
                                        isCurrent
                                          ? 'text-indigo-600 dark:text-indigo-400'
                                          : isPast
                                          ? 'text-emerald-600 dark:text-emerald-400'
                                          : 'text-slate-400'
                                      }`}>
                                        {stage.label}
                                      </span>
                                    </div>
                                    {idx < arr.length - 1 && (
                                      <div className={`flex-1 h-0.5 mx-0.5 mt-3.5 rounded-full transition-all ${
                                        idx < currentIdx ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                                      }`} />
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Mid Section - Files & Notes */}
                        <div className="p-5 space-y-4">
                          <div className="space-y-2">
                            <div className="text-[12px] uppercase font-bold text-slate-400 tracking-wider">Загруженный комплект:</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 content-start auto-rows-max gap-3">
                              {ord.files.map(f => (
                                <div key={f.id} className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-between gap-2.5 text-xs relative group">
                                  <div className="flex items-center gap-2.5 overflow-hidden">
                                    <FileType className="w-4.5 h-4.5 text-indigo-505" />
                                    <div className="overflow-hidden">
                                      <span className="font-bold block truncate text-slate-700 dark:text-slate-350">{f.name}</span>
                                      <span className="text-[10px] text-slate-400 block">{formatFileSize(f.size)}</span>
                                    </div>
                                  </div>

                                  {canDeleteFileFromOrder(ord) && (
                                    <div className="shrink-0 flex items-center">
                                      {fileToConfirmDelete?.orderId === ord.id && fileToConfirmDelete?.fileId === f.id ? (
                                        <div className="flex items-center gap-1">
                                          <span className="text-[10px] font-black text-rose-500 uppercase mr-1 animate-pulse">Удалить?</span>
                                          <button
                                            onClick={() => handleDeleteFileFromOrder(ord.id, f.id)}
                                            className="bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition"
                                          >
                                            Да
                                          </button>
                                          <button
                                            onClick={() => setFileToConfirmDelete(null)}
                                            className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition"
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
                                      <p className="text-[11px] text-indigo-300 font-black uppercase tracking-widest">Услуга</p>
                                      <p className="text-white font-bold text-xs">{ord.notes.replace('Услуга: ', '').split(' — ')[0]}</p>
                                    </div>
                                  </div>
                                  <span className="text-emerald-400 font-black text-sm">{ord.notes.split(' — ')[1]}</span>
                                </div>
                              ) : (
                                <div className="text-[12px]">
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
                                disabled={retryPayingOrderId === ord.id}
                                onClick={async () => {
                                  setRetryPayingOrderId(ord.id);
                                  try {
                                    const res = await withTimeout(
                                      fetch('https://sever-18.ru/api/payment-create.php', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          orderId: ord.id,
                                          amount: ord.totalCost,
                                          email: user.email,
                                        }),
                                      }),
                                      15000
                                    );
                                    const data = await res.json();
                                    if (data.paymentUrl) {
                                      window.location.href = data.paymentUrl;
                                    } else {
                                      alert('Ошибка создания платежа. Попробуйте ещё раз.');
                                      setRetryPayingOrderId(null);
                                    }
                                  } catch (err) {
                                    const isTimeout = err instanceof Error && err.message === 'timeout';
                                    alert(
                                      isTimeout
                                        ? 'Не удалось создать платёж — слишком слабое соединение. Проверьте интернет и попробуйте ещё раз.'
                                        : 'Ошибка соединения. Проверьте интернет и попробуйте снова.'
                                    );
                                    setRetryPayingOrderId(null);
                                  }
                                }}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-black px-4.5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 transition"
                              >
                                {retryPayingOrderId === ord.id ? (
                                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                ) : (
                                  <CreditCard className="w-3.5 h-3.5" />
                                )}
                                {retryPayingOrderId === ord.id ? 'Создаём платёж...' : 'Оплатить онлайн'}
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

                            {/* Удалить заказ целиком — только пока не оплачен и не взят в обработку */}
                            {canDeleteOwnOrder(ord) && (
                              orderToConfirmDelete === ord.id ? (
                                <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/20 p-1 rounded-lg border border-rose-100 dark:border-rose-900/40">
                                  <span className="text-[10px] font-black text-rose-500 uppercase px-1 animate-pulse">Удалить заказ?</span>
                                  <button
                                    onClick={() => handleDeleteOwnOrder(ord.id)}
                                    disabled={deletingOrderId === ord.id}
                                    className="bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition disabled:opacity-50"
                                  >
                                    {deletingOrderId === ord.id ? '...' : 'Да'}
                                  </button>
                                  <button
                                    onClick={() => setOrderToConfirmDelete(null)}
                                    disabled={deletingOrderId === ord.id}
                                    className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition disabled:opacity-50"
                                  >
                                    Нет
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setOrderToConfirmDelete(ord.id)}
                                  title="Удалить заказ"
                                  className="flex items-center justify-center gap-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-bold px-3 py-2.5 rounded-xl transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
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
                        <span className="text-[11px] text-emerald-600 font-bold dark:text-emerald-400 uppercase tracking-widest block mt-0.5 animate-pulse">● В сети — отвечает быстро</span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-bold uppercase tracking-widest block mt-0.5">● Не в сети — ответит позже</span>
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
                  
                  <div className="hidden lg:block text-slate-400 text-[11px] font-bold uppercase tracking-wider pl-2">
                    Шифрование SSL
                  </div>
                </div>
              </div>

              {/* Chat Messages Log */}
              <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto overscroll-contain bg-slate-50/30 dark:bg-slate-950/10 chat-message-log">
              <div ref={chatContentRef} className="space-y-4">
                {userChats.length === 0 ? (
                  <div className="h-full flex flex-col justify-center items-center text-center p-8">
                    <div className="bg-slate-100 dark:bg-slate-900 w-14 h-14 rounded-full flex items-center justify-center text-slate-400 mb-3">
                      <MessageSquare className="w-7 h-7" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white">Чат пуст. Начните диалог первым!</p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
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
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 px-1">
                            <span>{isAdmin ? 'Оператор' : msg.senderName} &bull; {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
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
                              {msg.message.substring(10).endsWith('.webm') ? (
                                <video src={msg.message.substring(10)} className="msg-sticker__img" autoPlay loop muted playsInline />
                              ) : (
                                <img src={msg.message.substring(10)} loading="lazy" className="msg-sticker__img" alt="Стикер" />
                              )}
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
                                  loading="lazy"
                                  className="rounded-xl max-w-[200px] sm:max-w-xs cursor-pointer hover:opacity-90 shadow-sm border border-slate-200 dark:border-slate-800"
                                  alt="Пример готового продукта"
                                />
                                <span className="text-[10px] opacity-70 block italic">Защищено водяным знаком &bull; ПРИМЕР</span>
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
              </div>

              {/* Chat inputs panel */}
              <div className="border-t border-white/10 glass-panel">
                {micError && (
                  <div className="px-4 pt-2.5 text-[12px] font-bold text-rose-500 dark:text-rose-400">
                    {micError}
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="p-4 flex gap-2">
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
                  {speechRecognitionSupported && (
                    <button
                      type="button"
                      onClick={handleMicClick}
                      title={micState === 'listening' ? 'Слушаю…' : 'Голосовой ввод'}
                      aria-label={micState === 'listening' ? 'Слушаю…' : 'Голосовой ввод'}
                      className={`shrink-0 p-3 rounded-xl transition flex items-center justify-center border h-full ${
                        micState === 'listening'
                          ? 'bg-rose-500 border-rose-500 text-white animate-pulse'
                          : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-850'
                      }`}
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => handleChatInputChange(e.target.value)}
                    placeholder={micState === 'listening' ? 'Слушаю…' : 'Задайте ваш вопрос оператору...'}
                    aria-label="Сообщение оператору"
                    // text-base (16px) вместо text-xs — на iOS Safari фокус на
                    // поле с шрифтом меньше 16px автоматически зумит страницу
                    // для читаемости, что ощущается как "сильный зум".
                    className="flex-1 bg-slate-50 dark:bg-slate-950 text-base sm:text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:dark:bg-slate-850 text-white py-3 px-4.5 rounded-xl font-bold text-xs flex items-center justify-center transition"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
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
                className="space-y-6 w-full md:overflow-y-auto md:flex-1 md:overscroll-contain min-h-0 pr-1"
              >
              
              <div className="grid grid-cols-1 md:grid-cols-2 content-start auto-rows-max gap-6">

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
                            }}
                            className="w-24 h-24 rounded-2xl ring-4 ring-indigo-500/15"
                          />
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
                              onClick={() => setEditAvatarUrl(urlPreset)}
                              className={`w-11 h-11 rounded-xl object-cover overflow-hidden border-2 transition cursor-pointer ${
                                editAvatarUrl === urlPreset ? 'border-indigo-600 scale-105 shadow-md' : 'border-transparent hover:scale-102'
                              }`}
                            >
                              <img src={urlPreset} alt="" loading="lazy" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </button>
                          ))}
                        </div>

                        <div className="space-y-1 text-left">
                          <label htmlFor="edit-avatar-url" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Или укажите свою ссылку на изображение:</label>
                          <input
                            id="edit-avatar-url"
                            type="text"
                            value={editAvatarUrl}
                            onChange={(e) => setEditAvatarUrl(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="https://example.com/avatar.jpg"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label htmlFor="edit-full-name" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Ваше Имя и Фамилия:</label>
                          <input
                            id="edit-full-name"
                            type="text"
                            required
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 rounded-xl p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                            placeholder="Иван Иванов"
                          />
                        </div>

                        <div className="space-y-1">
                          <label htmlFor="edit-phone" className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Контактный телефон:</label>
                          <input
                            id="edit-phone"
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
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-100">Фото</span>
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
                            aria-label="Загрузить фото аватара"
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
                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{user.role === 'admin' ? 'Администратор' : 'Клиент Копи-Центра'}</p>
                        
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
                              <div className="flex justify-between items-baseline text-[11px] font-bold">
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
                              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                                <span>{tier.name}</span>
                                {paidTotal < 50000 ? (
                                  <span className="text-indigo-600 dark:text-indigo-400">До статуса {goalLabel}: {(nextGoal - paidTotal).toLocaleString('ru-RU')} ₽</span>
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
                          <span className="text-[11px] text-slate-400">Дата регистрации:</span>
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

                {/* Правая колонка: Безопасность и Настройки + Поделиться Сервисом
                    стопкой друг под другом — раньше "Поделиться" было отдельной
                    строкой во всю ширину и не занимало место под первой карточкой */}
                <div className="space-y-6">
                {/* Secure System & Synchronization Details */}
                <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-6">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <img src={settingsIconRefImg} alt="" className="w-6 h-6 rounded-lg shrink-0" />
                    <AnimatedTitle>Безопасность и Настройки</AnimatedTitle>
                  </h3>

                  <div className="space-y-4">
                    
                    {/* Social connection options */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-850">
                      <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block">Связанные соцсети</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
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
                      <span className="text-[11px] uppercase font-bold text-rose-500 tracking-wider block">Удаление профиля согласно GDPR</span>
                      <p className="text-[11px] text-rose-700/80 dark:text-rose-400/80">
                        Вы можете навсегда удалить все ваши учетные данные, загруженные файлы и историю из базы данных Копи-Центра.
                      </p>
                      <button
                        onClick={handleDeleteSelf}
                        className="py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg transition"
                      >
                        Применить удаление данных
                      </button>
                    </div>
                  </div>
                </div>

                {/* Social Share Referral Widget Card */}
                <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-5">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4.5 h-4.5 text-indigo-650" />
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider"><AnimatedTitle>Поделиться Сервисом</AnimatedTitle></h3>
                  </div>
                  
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-normal">
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
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">WhatsApp</span>
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
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">Telegram</span>
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
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">ВКонтакте</span>
                    </a>

                    {/* Email share */}
                    <a
                      href={`mailto:?subject=${encodeURIComponent('Онлайн Копи-Центр ОНЛАЙН')}&body=${encodeURIComponent('Привет! Стал заказывать распечатку документов и фотографий онлайн с доставкой/брошюровкой на этом сайте. Рекомендую и тебе: ' + window.location.origin)}`}
                      className="flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl border border-slate-100 dark:border-slate-850 bg-slate-50/30 hover:bg-indigo-50/20 dark:bg-slate-950/20 dark:hover:bg-indigo-950/20 hover:border-indigo-250 transition-all duration-200 group cursor-pointer"
                      title="Отправить по Email"
                    >
                      <Mail className="w-5 h-5 text-indigo-650 group-hover:scale-110 transition duration-200" />
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">Email</span>
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

              </div>

              {/* In App Notifications Journal */}
              <div className="glass-panel rounded-3xl p-6 md:p-8">
                <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-150 dark:border-slate-800">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Bell className="w-4.5 h-4.5 text-indigo-650" /> <AnimatedTitle>Журнал уведомлений</AnimatedTitle>
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
                            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap ml-1">{new Date(notif.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{notif.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              </motion.div>
            )}

          {/* ── CONTACTS TAB ── */}
          {activeTab === 'contacts' && (
          <motion.div
            key="contacts"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.22 }}
            className="space-y-5 pb-8 md:overflow-y-auto md:flex-1 md:overscroll-contain min-h-0 pr-1 w-full overflow-x-hidden"
          >
            <div className="mb-6 max-w-2xl mx-auto text-center">
              <h2 className="text-xl font-black text-white mb-1"><AnimatedTitle>Контакты студии</AnimatedTitle></h2>
              <p className="text-sm text-slate-400">Мы всегда рады помочь вам!</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 content-start auto-rows-max gap-5 max-w-2xl mx-auto">
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

            <a href="tel:+79680508800" className="flex items-center justify-center gap-2 w-full max-w-2xl mx-auto py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm hover:opacity-90 transition-opacity">
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
            className="space-y-5 pb-8 md:overflow-y-auto md:flex-1 md:overscroll-contain min-h-0 pr-1 w-full overflow-x-hidden"
          >
            <div className="mb-6 max-w-4xl mx-auto text-center">
              <h2 className="text-xl font-black text-white mb-1">
                <AnimatedTitle>{serviceCategoryFilter ? serviceCategoryLabels[serviceCategoryFilter] : 'Наши услуги'}</AnimatedTitle>
              </h2>
              {serviceCategoryFilter && (
                <button
                  onClick={() => setServiceCategoryFilter(null)}
                  className="mt-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  ← Показать все услуги
                </button>
              )}
            </div>

            {serviceCategoryFilter !== 'scanning' && (
              <div className="max-w-md mx-auto relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={serviceSearchQuery}
                  onChange={(e) => setServiceSearchQuery(e.target.value)}
                  placeholder="Поиск услуги, например «печать фото»..."
                  aria-label="Поиск услуги"
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                {serviceSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setServiceSearchQuery('')}
                    aria-label="Очистить поиск"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {serviceCategoryFilter === 'scanning' && (
              <div className="max-w-4xl mx-auto -mt-2 space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setScanTargetRatio('a4')}
                    className={`btn-glass-sheen px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${
                      scanTargetRatio === 'a4'
                        ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >Документ А4</button>
                  <button
                    onClick={() => setScanTargetRatio('card')}
                    className={`btn-glass-sheen px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${
                      scanTargetRatio === 'card'
                        ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >Карта (СНИЛС и т.п.)</button>
                </div>
                <input
                  ref={scanCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleScanCapture}
                  className="hidden"
                  aria-label="Сфотографировать документ для сканирования"
                />
                <button
                  onClick={openCamera}
                  className="glass-icon colored capsule-glow-cyan glass-icon-pill w-full py-3.5 rounded-2xl text-white font-black text-sm cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="beam"><i /></span>
                  <Camera className="relative z-[3] w-4 h-4" />
                  <span className="relative z-[3]">📷 Скан</span>
                </button>
                <p className="text-[12px] text-slate-400 text-center leading-relaxed">
                  Наведите камеру на документ и сфотографируйте — подтянем контраст, добавим резкость и обрежем по центру под выбранный формат. Если получилось криво, всегда можно переснять.
                </p>
              </div>
            )}

            {/* Для "Сканирование" витрина цен не показывается — сканирование
                теперь делается прямо в кабинете кнопкой "Скан" выше. */}
            {serviceCategoryFilter !== 'scanning' && (() => {
              const q = serviceSearchQuery.trim().toLowerCase();
              const activeServices = (database.services || []).filter(s => s.isActive);
              const shownServices = activeServices
                .filter(s => !serviceCategoryFilter || serviceCategoryMatchers[serviceCategoryFilter]?.(s.title.toLowerCase()))
                .filter(s => !q || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
              if (shownServices.length === 0) {
                return (
                  <div className="text-center py-16 text-slate-400">
                    <Printer className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-bold">
                      {q
                        ? `Ничего не нашлось по запросу «${serviceSearchQuery.trim()}»`
                        : serviceCategoryFilter
                        ? `Пока нет активных услуг в категории «${serviceCategoryLabels[serviceCategoryFilter]}»`
                        : 'Витрина услуг пока пуста'}
                    </p>
                    <p className="text-sm mt-1">{q ? 'Попробуйте другой запрос или сбросьте поиск' : 'Скоро здесь появятся все наши услуги'}</p>
                  </div>
                );
              }
              return null;
            })()}

            {serviceCategoryFilter !== 'scanning' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
              {sortServicesByGroup(
                (database.services || [])
                  .filter(s => !serviceCategoryFilter || serviceCategoryMatchers[serviceCategoryFilter]?.(s.title.toLowerCase()))
                  .filter(s => {
                    const q = serviceSearchQuery.trim().toLowerCase();
                    return !q || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
                  })
                  .filter(s => s.isActive)
              ).map(svc => {
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
                    <motion.div
                      key={svc.id}
                      layoutId={`svc-card-${svc.id}`}
                      onMouseMove={handleServiceCardTilt}
                      onMouseLeave={handleServiceCardTiltReset}
                      onClick={() => setExpandedService(svc)}
                      className="service-glass-card group relative cursor-pointer select-none flex flex-col"
                    >
                      {/* Картинка сверху — намеренно без overflow-hidden, чтобы при
                          наведении фото вылетало за пределы карточки, как в референсе */}
                      <div className="service-glass-card-media h-40 shrink-0 flex items-center justify-center relative">
                        {/* Свечение по центру картинки, усиливается при наклоне мышью */}
                        <div className="service-card-glow absolute inset-0 pointer-events-none" />
                        {svc.imageUrl ? (
                          <img src={svc.imageUrl} alt={svc.title}
                            loading="lazy"
                            className="w-full h-full object-cover rounded-t-[20px] relative z-10"
                            style={{ transform: `scale(${svc.imageScale || 1})` }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }}
                          />
                        ) : svc.iconUrl ? (
                          <img src={svc.iconUrl} alt={svc.title} loading="lazy" className="w-16 h-16 object-contain relative z-10" />
                        ) : (
                          <div className="relative z-10">{get3DIcon(svc.emoji, svc.title)}</div>
                        )}
                      </div>

                      {/* Название, описание и цена — статично, без hover */}
                      <div className="px-3.5 pt-3 pb-3.5 flex flex-col flex-1">
                        <p className="font-extrabold text-[13px] text-slate-800 dark:text-white mb-0.5 leading-tight">{svc.title}</p>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug">
                          {svc.description?.slice(0,50)}{(svc.description?.length||0) > 50 ? '...' : ''}
                        </p>
                        <p className="font-black text-xl text-indigo-600 dark:text-indigo-400 mt-2 mb-2">{formatServicePrice(svc.price)}</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const priceNum = parseInt(svc.price.replace(/[^0-9]/g, ''), 10) || 0;
                            setSelectedService({ id: svc.id, title: svc.title, price: priceNum });
                            setNotes(`Услуга: ${svc.title} — ${svc.price}`);
                            setActiveTab('upload');
                          }}
                          className="btn-3d-choose w-full mt-auto py-2.5 rounded-xl font-black text-xs text-white cursor-pointer"
                        >Заказать →</button>
                      </div>
                    </motion.div>
                  );
                })}
            </div>
            )}
          </motion.div>
          )}
          </AnimatePresence>
          </>)}

        </div>
      </main>

      {/* Раскрытая карточка услуги: та же карточка (общий layoutId) плавно
          вырастает из своего места в сетке до полного экрана и обратно —
          эффект открытия окна как в macOS/App Store. Фон и крестик закрывают. */}
      <AnimatePresence>
        {expandedService && (
          <motion.div
            key="svc-expanded-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm"
            onClick={() => setExpandedService(null)}
          >
            <motion.div
              layoutId={`svc-card-${expandedService.id}`}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 bg-white dark:bg-[#101422] flex flex-col overflow-y-auto overscroll-contain"
            >
              <button
                onClick={() => setExpandedService(null)}
                aria-label="Закрыть"
                className="fixed z-20 right-4 w-9 h-9 rounded-full bg-black/45 text-white text-lg font-black flex items-center justify-center cursor-pointer backdrop-blur-sm"
                style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
              >✕</button>

              <div className="w-full shrink-0 bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center">
                {expandedService.imageUrl ? (
                  <img
                    src={expandedService.imageUrl}
                    alt={expandedService.title}
                    className="w-full max-h-[55dvh] object-contain"
                  />
                ) : expandedService.iconUrl ? (
                  <img src={expandedService.iconUrl} alt={expandedService.title} className="w-40 h-40 object-contain my-16" />
                ) : (
                  <span className="text-[96px] leading-none my-16">{expandedService.emoji}</span>
                )}
              </div>

              <div className="flex-1 flex flex-col px-5 pt-5"
                style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              >
                <h2 className="text-2xl font-black text-slate-800 dark:text-white leading-tight"><AnimatedTitle>{expandedService.title}</AnimatedTitle></h2>
                {expandedService.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-2 whitespace-pre-wrap">{expandedService.description}</p>
                )}
                <p className="font-black text-3xl text-indigo-600 dark:text-indigo-400 mt-4">{formatServicePrice(expandedService.price)}</p>
                <button
                  onClick={() => {
                    const priceNum = parseInt(expandedService.price.replace(/[^0-9]/g, ''), 10) || 0;
                    setSelectedService({ id: expandedService.id, title: expandedService.title, price: priceNum });
                    setNotes(`Услуга: ${expandedService.title} — ${expandedService.price}`);
                    setExpandedService(null);
                    setActiveTab('upload');
                  }}
                  className="btn-3d-choose w-full mt-6 py-3.5 rounded-2xl font-black text-sm text-white cursor-pointer"
                >Заказать →</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Полноэкранный предпросмотр файла — PDF рендерится постранично через
          pdf.js (см. эффект на previewFile выше) вместо <iframe>, потому что
          встроенный PDF-вьюер браузера в iframe на телефонах либо не
          открывается, либо не даёт листать страницы свайпом. */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-fade-in">
          <div className="p-4 pt-5 flex items-start justify-between shrink-0 bg-gradient-to-b from-black/70 to-transparent absolute top-0 left-0 right-0 z-10">
            <div className="overflow-hidden mr-2">
              <h3 className="text-xs font-black text-white truncate"><AnimatedTitle>{previewFile.name}</AnimatedTitle></h3>
              <span className="text-[11px] text-white/50 font-medium block mt-0.5">
                {formatFileSize(previewFile.size)}
                {previewPdfPages.length > 1 && ` · Страница ${previewPageIndex + 1} из ${previewPdfPages.length}`}
              </span>
            </div>
          </div>

          <div
            className="flex-1 flex items-center justify-center overflow-hidden px-2"
            onTouchStart={(e) => { previewTouchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (previewTouchStartX.current === null || previewPdfPages.length < 2) return;
              const dx = e.changedTouches[0].clientX - previewTouchStartX.current;
              previewTouchStartX.current = null;
              if (Math.abs(dx) < 50) return;
              if (dx < 0) setPreviewPageIndex(p => Math.min(p + 1, previewPdfPages.length - 1));
              else setPreviewPageIndex(p => Math.max(p - 1, 0));
            }}
          >
            {previewFile.type?.startsWith('image/') || previewFile.formatGroup === 'image' ? (
              <img
                src={previewFile.previewUrl || previewFile.url}
                alt={previewFile.name}
                className="max-w-full max-h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (previewFile.type === 'application/pdf' || previewFile.name.toLowerCase().endsWith('.pdf')) ? (
              previewPdfLoading ? (
                <div className="flex flex-col items-center gap-3 text-white/70">
                  <span className="w-8 h-8 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                  <span className="text-xs font-bold">Готовим просмотр...</span>
                </div>
              ) : previewPdfPages.length > 0 ? (
                <img
                  src={previewPdfPages[previewPageIndex]}
                  alt={`Страница ${previewPageIndex + 1}`}
                  className="max-w-full max-h-full object-contain shadow-2xl"
                />
              ) : (
                <div className="text-center p-8 max-w-md text-white/70">
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-xs font-bold">Не удалось открыть предпросмотр PDF.</p>
                  <p className="text-[12px] mt-1.5 leading-relaxed">Но файл всё равно можно отправить на печать.</p>
                </div>
              )
            ) : (
              <div className="text-center p-8 max-w-md text-white/70">
                <div className="text-4xl mb-3">📄</div>
                <p className="text-xs font-bold">Прямой предпросмотр для этого формата недоступен.</p>
                <p className="text-[12px] mt-1.5 leading-relaxed">Но вы можете отправить его на печать! Мы поддерживаем чертежи, текстовые документы и архивы.</p>
              </div>
            )}
          </div>

          {previewPdfPages.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 py-3 shrink-0 overflow-x-auto px-4">
              {previewPdfPages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPreviewPageIndex(i)}
                  aria-label={`Страница ${i + 1}`}
                  className={`h-1.5 rounded-full shrink-0 transition-all cursor-pointer ${i === previewPageIndex ? 'bg-white w-5' : 'bg-white/25 w-1.5'}`}
                />
              ))}
            </div>
          )}

          {/* Закрыть — внизу, отдельной кнопкой на всю ширину. */}
          <div className="p-4 pb-6 shrink-0">
            <button
              onClick={() => setPreviewFile(null)}
              className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-black text-sm cursor-pointer backdrop-blur-sm transition-colors"
            >
              Закрыть просмотр
            </button>
          </div>
        </div>
      )}

      {/* Модалка "Настройте параметры печати" — открывается автоматически после каждой загрузки */}
      <AnimatePresence>{activeConfigFileId && (() => {
        const file = pendingUploads.find(f => f.id === activeConfigFileId);
        if (!file) return null;

        const isPhoto = file.paperType === 'photo';
        const isA3 = file.format === 'a3';
        const isBinding = file.format === 'binding';
        const pages = file.pageCount || 1;
        const copies = file.fileCopies || 1;
        const fillPct = file.colorFillPercent;
        const fillReady = fillPct !== undefined;
        // Заливку чернил можно посчитать только у файлов с превью (картинки/PDF —
        // см. previewUrl в handleFiles). У текстовых/офисных документов превью
        // нет и никогда не появится — раньше это вешало "Анализируем..." навечно,
        // потому что ждать было нечего. Для них просто берём минимальный тариф.
        const canAnalyzeFill = !!file.previewUrl;
        // .txt — гарантированно без цвета в принципе (обычный текстовый файл,
        // не может содержать ни цветных букв, ни картинок) — печать в цвете
        // тут ничем не отличается от Ч/Б, доплата за неё не имеет смысла.
        const isColorless = file.name.toLowerCase().endsWith('.txt');
        const bwPrice = 20;
        const colorPrice = isColorless ? 0 : (canAnalyzeFill ? (fillReady ? colorFillPrice(fillPct) : undefined) : 25);
        const colorlessBlocksConfirm = isColorless && !isPhoto && (file.printColor || 'bw') === 'color';

        const photoSizes = [
          { key: '10x15', label: '10×15', price: 20 },
          { key: 'polaroid', label: 'Полароид', price: 30 },
          { key: '13x18', label: '13×18', price: 50 },
          { key: '15x21', label: '15×21', price: 70 },
          { key: '20x30', label: '20×30', price: 100 },
          { key: '30x40', label: '30×40', price: 250 },
        ] as const;
        const selSize = photoSizes.find(s => s.key === (file.photoSize || '10x15')) || photoSizes[0];
        // Полароид — временно без настроек в этой модалке (по просьбе клиента,
        // будем добавлять поля постепенно) — размер уже проставлен плиткой
        // "Полароид" на Главной, выбор размера/рамки тут просто не показываем.
        const isPolaroidSize = isPhoto && file.photoSize === 'polaroid';

        const filePP = isPhoto ? selSize.price : (isA3 ? a3FilePrice(file) : (isBinding ? bindingFilePrice(file) : ((file.printColor || 'bw') === 'bw' ? bwPrice : (colorPrice ?? 0))));
        const fileCost = filePP * (isPhoto || isBinding ? 1 : pages) * copies;
        const canConfirm = (!isPhoto || !!file.photoSize) && (!isBinding || !!file.bindingKind) && !colorlessBlocksConfirm;

        const patch = (updates: Partial<PrintFile>) => patchFileState(file.id, updates);

        // Брошюровка — отдельная, самостоятельная модалка (по тому же принципу,
        // что и Полароид/А3 ниже): клиент выбирает тип пружины (металл/пластик)
        // видео-кнопками, цена — bindingFilePrice выше (та же ставка, что и у
        // "Отделки" на шаге оформления заказа).
        if (isBinding) {
          return (
            <motion.div
              key="bindingConfigModal"
              className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
            >
              <motion.div
                className="glass-window w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
                data-css-anim-off
                initial={{ opacity: 0, scale: 0.82, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
                exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
              >
                <div className="p-5 pb-0 text-center">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white"><AnimatedTitle>Брошюровка</AnimatedTitle></h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{file.name}</p>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Тип пружины</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {([
                        { key: 'spring_metal', label: 'Металлическая', video: bindingSpringMetalAnim },
                        { key: 'spring_plastic', label: 'Пластиковая', video: bindingSpringPlasticAnim },
                      ] as const).map(opt => {
                        const selected = file.bindingKind === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => patch({ bindingKind: opt.key })}
                            className={`btn-glass-sheen relative p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                              selected
                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25 scale-[1.03]'
                                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                            }`}
                          >
                            {selected && (
                              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center option-selected-pop">
                                <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                              </div>
                            )}
                            <video
                              src={opt.video}
                              autoPlay loop muted playsInline
                              className="w-full aspect-square rounded-xl object-cover pointer-events-none"
                            />
                            <div className={`text-[12px] font-black ${selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-white'}`}>{opt.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Копий</p>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => patch({ fileCopies: Math.max(1, copies - 1) })}
                        className="btn-glass-sheen w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-base font-black cursor-pointer flex items-center justify-center">−</button>
                      <input
                        type="number"
                        min={1}
                        value={copies}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          patch({ fileCopies: Number.isNaN(v) || v < 1 ? 1 : v });
                        }}
                        className="w-12 text-sm font-black text-slate-800 dark:text-white text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button type="button" onClick={() => patch({ fileCopies: copies + 1 })}
                        className="btn-glass-sheen w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-base font-black cursor-pointer flex items-center justify-center">+</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-150 dark:border-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {pages} стр. × {copies} шт.
                    </span>
                    <strong className="text-xl font-black text-slate-800 dark:text-white">{fileCost} ₽</strong>
                  </div>
                </div>

                <div className="p-5 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5 shrink-0">
                  <button
                    type="button"
                    disabled={!canConfirm}
                    onClick={() => confirmFileConfig(file.id, applyToAllPending)}
                    className="glass-icon colored capsule-glow-purple glass-icon-pill w-full py-3.5 rounded-2xl text-white font-black text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="beam"><i /></span>
                    <span className="relative z-[3]">{applyToAllPending ? `Применить ко всем и продолжить →` : 'Выбрать →'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelFileConfig(file.id)}
                    className="w-full py-2 text-xs font-bold text-rose-500 hover:text-rose-600 cursor-pointer"
                  >
                    Убрать файл
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        }

        // Полароид — отдельная, самостоятельная модалка (по просьбе клиента,
        // 2026-07-18: "создай новое окно именно для полароида, чтобы не портить
        // остальные окна"), не переиспользует разметку модалки ниже — там своя
        // анимация (камера печатает снимок, без хромакея) и минимум настроек.
        if (isPolaroidSize) {
          return (
            <motion.div
              key="polaroidConfigModal"
              className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
            >
              <motion.div
                className="glass-window w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
                data-css-anim-off
                initial={{ opacity: 0, scale: 0.82, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
                exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
              >
                <div className="p-5 pb-0 text-center">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white"><AnimatedTitle>Полароид</AnimatedTitle></h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{file.name}</p>
                </div>

                <div className="flex items-center justify-center py-2">
                  <img src={polaroidCameraAnim} alt="" className="w-48 h-48 object-contain pointer-events-none select-none" />
                </div>

                <div className="p-5 pt-0 space-y-4 overflow-y-auto">
                  {pendingUploads.filter(f => f.id !== file.id && f.formatGroup === 'image').length > 0 && (
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/25 border border-indigo-200/50 dark:border-indigo-900/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyToAllPending}
                        onChange={(e) => setApplyToAllPending(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer shrink-0"
                      />
                      <span className="text-[12px] font-bold text-indigo-700 dark:text-indigo-300">
                        Применить эти настройки ко всем {pendingUploads.filter(f => f.formatGroup === 'image').length} фото сразу
                      </span>
                    </label>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Копий</p>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => patch({ fileCopies: Math.max(1, copies - 1) })}
                        className="btn-glass-sheen w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-base font-black cursor-pointer flex items-center justify-center">−</button>
                      <input
                        type="number"
                        min={1}
                        value={copies}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          patch({ fileCopies: Number.isNaN(v) || v < 1 ? 1 : v });
                        }}
                        className="w-12 text-sm font-black text-slate-800 dark:text-white text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button type="button" onClick={() => patch({ fileCopies: copies + 1 })}
                        className="btn-glass-sheen w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-base font-black cursor-pointer flex items-center justify-center">+</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-150 dark:border-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Полароид × {copies} шт.</span>
                    <strong className="text-xl font-black text-slate-800 dark:text-white">{fileCost} ₽</strong>
                  </div>
                </div>

                <div className="p-5 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => confirmFileConfig(file.id, applyToAllPending)}
                    className="glass-icon colored capsule-glow-purple glass-icon-pill w-full py-3.5 rounded-2xl text-white font-black text-sm cursor-pointer"
                  >
                    <span className="beam"><i /></span>
                    <span className="relative z-[3]">{applyToAllPending ? `Применить ко всем и продолжить →` : 'Выбрать →'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelFileConfig(file.id)}
                    className="w-full py-2 text-xs font-bold text-rose-500 hover:text-rose-600 cursor-pointer"
                  >
                    Убрать файл
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        }

        // А3 — тоже отдельная, самостоятельная модалка (по тому же принципу, что
        // и Полароид выше): клиент сперва выбирает "Чертёж" (офисная бумага —
        // затем ещё Ч/Б или Цвет, и плотность 80/200 г/м²) или "Фото" (фотобумага —
        // затем покрытие глянец/матовая, цена не зависит от покрытия). Цены —
        // см. a3FilePrice выше (прайс от 2026-07-19).
        if (isA3) {
          return (
            <motion.div
              key="a3ConfigModal"
              className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
            >
              <motion.div
                className="glass-window w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
                data-css-anim-off
                initial={{ opacity: 0, scale: 0.82, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
                exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
              >
                <div className="p-5 pb-0 text-center">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white"><AnimatedTitle>А3</AnimatedTitle></h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{file.name}</p>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      { key: 'chertyozh', label: 'Чертёж', video: a3ChertyozhAnim },
                      { key: 'photo', label: 'Фото', video: a3PhotoAnim },
                    ] as const).map(opt => {
                      const selected = file.a3Kind === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => patch(opt.key === 'photo' ? { a3Kind: opt.key, printColor: 'color' } : { a3Kind: opt.key })}
                          className={`btn-glass-sheen relative p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                            selected
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25 scale-[1.03]'
                              : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                          }`}
                        >
                          {selected && (
                            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center option-selected-pop">
                              <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                            </div>
                          )}
                          <video
                            src={opt.video}
                            autoPlay loop muted playsInline
                            className="w-full aspect-square rounded-xl object-cover pointer-events-none"
                          />
                          <div className={`text-[12px] font-black ${selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-white'}`}>{opt.label}</div>
                        </button>
                      );
                    })}
                  </div>

                  {file.a3Kind === 'chertyozh' && (
                    <>
                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Цветность</p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {([
                            { key: 'bw', label: 'Ч/Б' },
                            { key: 'color', label: 'Цвет' },
                          ] as const).map(opt => {
                            const selected = (file.printColor || 'bw') === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => patch({ printColor: opt.key })}
                                className={`btn-glass-sheen relative p-2.5 rounded-xl border text-xs font-black cursor-pointer transition-all ${
                                  selected
                                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25 text-indigo-700 dark:text-indigo-300'
                                    : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white hover:border-indigo-300'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Плотность бумаги</p>
                        <div className="grid grid-cols-2 gap-2.5">
                          {([
                            { key: '80', label: '80 г/м²', sub: 'тонкая офисная' },
                            { key: '200', label: '200 г/м²', sub: 'плотная' },
                          ] as const).map(opt => {
                            const selected = file.a3PaperWeight === opt.key;
                            const price = a3FilePrice({ ...file, a3PaperWeight: opt.key });
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => patch({ a3PaperWeight: opt.key })}
                                className={`btn-glass-sheen relative p-2.5 rounded-xl border text-center cursor-pointer flex flex-col items-center gap-0.5 transition-all ${
                                  selected
                                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                                }`}
                              >
                                <span className={`text-xs font-black ${selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-white'}`}>{opt.label}</span>
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{opt.sub} · {price}₽</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {file.a3Kind === 'photo' && (
                    <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Покрытие</p>
                      <div className="grid grid-cols-2 gap-2.5">
                        {([
                          { key: 'glossy', label: 'Глянец' },
                          { key: 'matte', label: 'Матовая' },
                        ] as const).map(opt => {
                          const selected = file.a3PhotoFinish === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => patch({ a3PhotoFinish: opt.key })}
                              className={`btn-glass-sheen relative p-2.5 rounded-xl border text-xs font-black cursor-pointer transition-all ${
                                selected
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white hover:border-indigo-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {pendingUploads.filter(f => f.id !== file.id && f.format === 'a3').length > 0 && (
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/25 border border-indigo-200/50 dark:border-indigo-900/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyToAllPending}
                        onChange={(e) => setApplyToAllPending(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer shrink-0"
                      />
                      <span className="text-[12px] font-bold text-indigo-700 dark:text-indigo-300">
                        Применить эти настройки ко всем {pendingUploads.filter(f => f.format === 'a3').length} файлам А3 сразу
                      </span>
                    </label>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Копий</p>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => patch({ fileCopies: Math.max(1, copies - 1) })}
                        className="btn-glass-sheen w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-base font-black cursor-pointer flex items-center justify-center">−</button>
                      <input
                        type="number"
                        min={1}
                        value={copies}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          patch({ fileCopies: Number.isNaN(v) || v < 1 ? 1 : v });
                        }}
                        className="w-12 text-sm font-black text-slate-800 dark:text-white text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button type="button" onClick={() => patch({ fileCopies: copies + 1 })}
                        className="btn-glass-sheen w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-base font-black cursor-pointer flex items-center justify-center">+</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-150 dark:border-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {file.a3Kind === 'photo' ? 'Фото А3' : file.a3Kind === 'chertyozh' ? 'Чертёж А3' : 'А3'} × {pages > 1 ? `${pages} стр. × ` : ''}{copies} шт.
                    </span>
                    <strong className="text-xl font-black text-slate-800 dark:text-white">{fileCost} ₽</strong>
                  </div>
                </div>

                <div className="p-5 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5 shrink-0">
                  {(() => {
                    const a3Incomplete = !file.a3Kind
                      || (file.a3Kind === 'chertyozh' && !file.a3PaperWeight)
                      || (file.a3Kind === 'photo' && !file.a3PhotoFinish);
                    return (
                      <button
                        type="button"
                        disabled={a3Incomplete}
                        onClick={() => confirmFileConfig(file.id, applyToAllPending)}
                        className={`glass-icon colored capsule-glow-purple glass-icon-pill w-full py-3.5 rounded-2xl text-white font-black text-sm ${a3Incomplete ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span className="beam"><i /></span>
                        <span className="relative z-[3]">{applyToAllPending ? `Применить ко всем и продолжить →` : 'Выбрать →'}</span>
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => cancelFileConfig(file.id)}
                    className="w-full py-2 text-xs font-bold text-rose-500 hover:text-rose-600 cursor-pointer"
                  >
                    Убрать файл
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        }

        return (
          <motion.div
            key="activeConfigFileModal"
            className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
          >
            <motion.div
              className="glass-window w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
              data-css-anim-off
              initial={{ opacity: 0, scale: 0.82, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
              exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-950/30 shrink-0">
                <img src={printerInkIcon} alt="" className="w-16 h-16 shrink-0" />
                <div className="overflow-hidden flex-1">
                  <h3 className="text-sm font-black text-slate-800 dark:text-white"><AnimatedTitle>Настройте параметры печати</AnimatedTitle></h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">{file.name}</p>
                </div>
                {/* "Загружен" не показываем — анимация в зоне дропа перед
                    открытием этого окна уже показала клиенту, что файл
                    загрузился, дублировать незачем. Спиннер "Загрузка..."
                    оставляем — на случай, если реальная отправка на сервер
                    (отдельно от визуальной анимации) ещё не успела закончиться. */}
                {!file.url && (
                  <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-indigo-500">
                    <span className="w-3 h-3 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
                    Загрузка...
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 overflow-y-auto">
                {/* Цветность с ценами прямо на кнопках — для А4. Для А3 своя объединённая группа ниже, после выбора формата.
                    Для полароида не показываем — печать там всегда цветная, выбор нечего настраивать. */}
                {!isA3 && !isPolaroidSize && (
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Цветность</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={isPhoto}
                        onClick={() => patch({ printColor: 'bw' })}
                        className={`btn-glass-sheen relative p-3 rounded-2xl border flex flex-col items-center text-center transition-all duration-200 cursor-pointer ${isPhoto ? 'opacity-30 cursor-not-allowed' : ''} ${
                          (file.printColor || 'bw') === 'bw' && !isPhoto
                            ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/50 ring-2 ring-indigo-500/40 scale-[1.03] shadow-lg shadow-indigo-500/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/20'
                        }`}
                      >
                        {(file.printColor || 'bw') === 'bw' && !isPhoto && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center option-selected-pop">
                            <Check className="w-3 h-3" strokeWidth={3} />
                          </div>
                        )}
                        <img src={printerInkIcon} alt="" className="w-14 h-14" style={{ filter: 'grayscale(100%)' }} />
                        <div className="text-xs font-black text-slate-800 dark:text-white mt-0.5">Ч/Б</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => patch({ printColor: 'color' })}
                        className={`btn-glass-sheen relative p-3 rounded-2xl border flex flex-col items-center text-center transition-all duration-200 cursor-pointer ${
                          (file.printColor || 'bw') === 'color' || isPhoto
                            ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/50 ring-2 ring-indigo-500/40 scale-[1.03] shadow-lg shadow-indigo-500/20'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/20'
                        }`}
                      >
                        {((file.printColor || 'bw') === 'color' || isPhoto) && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center option-selected-pop">
                            <Check className="w-3 h-3" strokeWidth={3} />
                          </div>
                        )}
                        <img src={printerInkIcon} alt="" className="w-14 h-14" />
                        <div className="text-xs font-black text-slate-800 dark:text-white mt-0.5">Цвет</div>
                      </button>
                    </div>

                    {colorlessBlocksConfirm && (
                      <div className="mt-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-3 text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>В этом файле нет цвета — это обычный текстовый файл, цветная печать не будет ничем отличаться от Ч/Б. Выберите Ч/Б, чтобы продолжить.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Сообщение про заливку чернил — для А3 не показываем (там фиксированные
                    цены без учёта заливки), и только если её вообще можно посчитать
                    (есть превью — картинка/PDF). Для текстовых/офисных файлов превью
                    нет и не будет, поэтому и крутить "Анализируем..." незачем. */}
                {!isPhoto && !isA3 && canAnalyzeFill && (file.printColor || 'bw') === 'color' && (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-3.5">
                    {fillReady ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg shrink-0">🎨</span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300 truncate">{colorFillLabel(fillPct)}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <div className="w-16 h-1.5 rounded-full bg-amber-200/60 dark:bg-amber-900/50 overflow-hidden shrink-0">
                                <div className="h-full rounded-full bg-amber-500" style={{ width: `${fillPct}%` }} />
                              </div>
                              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 shrink-0">{fillPct}%</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-xl font-black text-amber-800 dark:text-amber-300 shrink-0">
                          {colorPrice} <span className="text-[11px] font-bold">₽/стр.</span>
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" /> Анализируем заливку чернил на странице...
                      </p>
                    )}
                  </div>
                )}

                {/* Размер фото — обязателен для фотобумаги, кроме полароида (там
                    размер один и тот же, настраивать нечего) */}
                {isPhoto && !isPolaroidSize && (
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Размер фотографии</p>
                    <div className="grid grid-cols-3 gap-2">
                      {photoSizes.map(s => {
                        const sizeSelected = (file.photoSize || '10x15') === s.key;
                        return (
                          <button key={s.key} type="button" onClick={() => patch({ photoSize: s.key })}
                            className={`btn-glass-sheen relative p-2 rounded-xl border text-center transition-all cursor-pointer ${
                              sizeSelected
                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25 scale-[1.03]'
                                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                            }`}
                          >
                            {sizeSelected && (
                              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center option-selected-pop">
                                <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                              </div>
                            )}
                            <div className={`text-[12px] font-black ${sizeSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-white'}`}>{s.label}</div>
                            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{s.price} ₽</div>
                          </button>
                        );
                      })}
                    </div>
                    {/* Предупреждение о качестве (Важное.md, часть 2) — не блокирует
                        заказ, просто честно предупреждает, если реального
                        разрешения фото не хватает на выбранный размер при 150
                        DPI (общепринятый минимум для фотопечати без видимой
                        размытости). Сравниваем без привязки к ориентации
                        (большая/меньшая сторона), т.к. кадрирование при печати
                        и так меняет пропорции. */}
                    {(() => {
                      const PHOTO_SIZE_CM: Record<string, [number, number]> = {
                        '10x15': [10, 15], '13x18': [13, 18], '15x21': [15, 21], '20x30': [20, 30], '30x40': [30, 40],
                      };
                      const cm = PHOTO_SIZE_CM[selSize.key];
                      const hasRes = !!(file.imagePixelWidth && file.imagePixelHeight);
                      if (!cm || !hasRes) return null;
                      const MIN_DPI = 150;
                      const needA = Math.round((cm[0] / 2.54) * MIN_DPI);
                      const needB = Math.round((cm[1] / 2.54) * MIN_DPI);
                      const needMax = Math.max(needA, needB);
                      const needMin = Math.min(needA, needB);
                      const imgMax = Math.max(file.imagePixelWidth!, file.imagePixelHeight!);
                      const imgMin = Math.min(file.imagePixelWidth!, file.imagePixelHeight!);
                      const isLowRes = imgMax < needMax || imgMin < needMin;
                      if (!isLowRes) return null;
                      return (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-200/60 dark:border-amber-900/40 flex items-start gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                            Это фото маловато для печати {selSize.label} — при печати может быть размыто. Если есть оригинал большего размера, лучше загрузить его; можно печатать и как есть.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Рамка — с белыми полями или край-в-край, только для фотобумаги (не для полароида) */}
                {isPhoto && !isPolaroidSize && (
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Печать</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mb-2">
                      Если пропорции фото не совпадают с размером бумаги: «без рамки» обрежет края фото, «с рамкой» покажет фото целиком с белыми полями.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {([
                        { key: 'borderless', label: 'Без рамки', sub: 'может обрезать края' },
                        { key: 'bordered', label: 'С рамкой', sub: 'видно всё фото' },
                      ] as const).map(opt => {
                        const selected = (file.photoBorder || 'borderless') === opt.key;
                        return (
                          <button key={opt.key} type="button" onClick={() => patch({ photoBorder: opt.key })}
                            className={`btn-glass-sheen relative p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                              selected
                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25 scale-[1.03]'
                                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                            }`}
                          >
                            {selected && (
                              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center option-selected-pop">
                                <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                              </div>
                            )}
                            <div className={`w-20 h-28 rounded-sm overflow-hidden border border-slate-300 dark:border-slate-600 shadow-sm ${opt.key === 'bordered' ? 'bg-white p-2' : 'bg-slate-200 dark:bg-slate-700'}`}>
                              {file.previewUrl ? (
                                <img
                                  src={file.previewUrl}
                                  alt=""
                                  // Тонкая рамка вокруг самого фото у "С рамкой" — белый фон
                                  // иначе "съедает" светлые фото (например, скриншоты),
                                  // они становятся не видны на превью.
                                  className={`w-full h-full ${opt.key === 'bordered' ? 'object-contain border border-slate-200' : 'object-cover'}`}
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-sky-300 to-indigo-400" />
                              )}
                            </div>
                            <div className={`text-[12px] font-black ${selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-white'}`}>{opt.label}</div>
                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{opt.sub}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Массовое применение — когда клиент разом загрузил много фото
                    (например 30 штук), не заставляем настраивать каждое отдельно */}
                {isPhoto && pendingUploads.filter(f => f.id !== file.id && f.formatGroup === 'image').length > 0 && (
                  <label className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/25 border border-indigo-200/50 dark:border-indigo-900/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyToAllPending}
                      onChange={(e) => setApplyToAllPending(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer shrink-0"
                    />
                    <span className="text-[12px] font-bold text-indigo-700 dark:text-indigo-300">
                      Применить эти настройки ко всем {pendingUploads.filter(f => f.formatGroup === 'image').length} фото сразу
                    </span>
                  </label>
                )}

                {/* А3 — временно пусто по просьбе клиента (2026-07-18), пока не
                    решено, что здесь будет; "Копий"/"Итог" ниже спрятаны только
                    для А3 — цена и 1 копия по умолчанию остаются в силе, заказ
                    всё равно можно оформить. */}
                {!isA3 && (
                <>
                {/* Копии */}
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Копий</p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => patch({ fileCopies: Math.max(1, copies - 1) })}
                      className="btn-glass-sheen w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-base font-black cursor-pointer flex items-center justify-center">−</button>
                    <input
                      type="number"
                      min={1}
                      value={copies}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        patch({ fileCopies: Number.isNaN(v) || v < 1 ? 1 : v });
                      }}
                      className="w-12 text-sm font-black text-slate-800 dark:text-white text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button type="button" onClick={() => patch({ fileCopies: copies + 1 })}
                      className="btn-glass-sheen w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white text-base font-black cursor-pointer flex items-center justify-center">+</button>
                  </div>
                </div>

                {/* Итог */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-150 dark:border-slate-800">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {isPhoto ? `${selSize.label} × ${copies} шт.` : `${pages} стр. × ${filePP} ₽ × ${copies} шт.`}
                  </span>
                  <strong className="text-xl font-black text-slate-800 dark:text-white">{fileCost} ₽</strong>
                </div>
                </>
                )}
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5 shrink-0">
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={() => confirmFileConfig(file.id, applyToAllPending)}
                  className="glass-icon colored capsule-glow-purple glass-icon-pill w-full py-3.5 rounded-2xl text-white font-black text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="beam"><i /></span>
                  <span className="relative z-[3]">{applyToAllPending ? `Применить ко всем и продолжить →` : 'Выбрать →'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => cancelFileConfig(file.id)}
                  className="w-full py-2 text-xs font-bold text-rose-500 hover:text-rose-600 cursor-pointer"
                >
                  Убрать файл
                </button>
              </div>
            </motion.div>
          </motion.div>
        );
      })()}</AnimatePresence>

      {/* --- PREMIUM HIGH-FIDELITY INTERACTIVE 3D MOCKUP INSPECTOR MODAL --- */}
      <AnimatePresence>{show3DMockupModal && (
        <motion.div
          key="show3DMockupModal"
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6 text-slate-800 dark:text-slate-100"
          onClick={() => setShow3DMockupModal(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
        >
          <motion.div
            className="glass-window w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
            data-css-anim-off
            initial={{ opacity: 0, scale: 0.82, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
            exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-150 dark:border-slate-850 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Layers className="w-5 h-5 text-indigo-500 animate-spin-slow" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-850 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <AnimatedTitle><span>Интерактивный 3D-осмотр тиража партии</span></AnimatedTitle>
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-250/30">В ФОКУСЕ 100%</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-bold block mt-0.5 leading-none">
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
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 md:p-8 grid grid-cols-1 lg:grid-cols-12 content-start auto-rows-max gap-8 bg-slate-50/40 dark:bg-slate-950/20">
              
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
                            <div className="absolute top-2 right-2 w-4 h-4 rounded-full border border-sky-500/15 flex items-center justify-center bg-white/90 shadow-md text-sky-600 font-extrabold text-[10px]">
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
                            <div className="flex justify-between items-end border-t border-slate-800 pt-2 text-[8px] text-slate-400 font-mono">
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
                                  <div className="absolute top-1.5 right-1.5 bg-indigo-600 px-2 py-0.5 text-white text-[8px] font-black tracking-widest rounded-md">
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
                                    <div className="text-[11px] font-black tracking-wide text-indigo-700 dark:text-indigo-400">
                                      {uploadedFiles[0].name.toUpperCase()}
                                    </div>
                                    <div className="text-[7.5px] text-slate-500 dark:text-slate-400 font-bold font-mono">
                                      {formatFileSize(uploadedFiles[0].size)} • {uploadedFiles[0].pageCount || 1} стр.
                                    </div>
                                  </div>

                                  {/* Simulated detailed paragraph blocks */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-3 h-3 rounded-full bg-indigo-505 flex items-center justify-center text-[8px] text-white font-black">1</div>
                                      <p className="text-[8.5px] font-extrabold text-slate-750 dark:text-slate-300">Реальные параметры партии:</p>
                                    </div>
                                    <div className="pl-4 space-y-1">
                                      <div className="h-1 bg-slate-300 dark:bg-slate-700 rounded-full w-full" />
                                      <div className="h-1 bg-slate-300 dark:bg-slate-700 rounded-full w-5/6" />
                                      <div className="h-1 bg-slate-350 dark:bg-slate-650 rounded-full w-11/12" />
                                    </div>
                                  </div>

                                  {/* Real parameters stamped inside mockup page */}
                                  <div className="bg-slate-100/50 dark:bg-slate-900/55 p-2 rounded-lg text-[8px] font-mono space-y-0.5 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/40">
                                    <div>Плотность: {paperDensity === 'thick' ? 'Плотная 160 г/м²' : 'Стандартная 80 г/м²'}</div>
                                    <div>Тираж: {copies} шт • Страниц: {uploadedFiles.reduce((acc, f) => acc + (f.pageCount || 1), 0)}</div>
                                    <div>Скрепление: {binding === 'none' ? 'Нет' : binding === 'staple' ? 'Степлер (угол)' : binding === 'file' ? 'Файлик' : binding === 'spring_metal' ? 'Металлическая пружина' : binding === 'spring_plastic' ? 'Пластиковая пружина' : 'Твёрдый переплет'}</div>
                                  </div>
                                </div>

                                {/* Stamps or bottom seals */}
                                <div className="flex justify-between items-end border-t border-slate-200/60 dark:border-slate-800/60 pt-2 text-[8px] font-bold text-slate-400">
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
                                    <div className="text-[10px] font-black tracking-wide text-slate-800 dark:text-slate-200">
                                      DOCUMENT_REPORT.PDF
                                    </div>
                                    <div className="text-[8px] text-slate-450 dark:text-slate-500 font-medium">
                                      Типография: Северное шоссе, 18 • 1.04 MB • 1 стр.
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex items-center justify-center text-[7px] text-white font-black">1</div>
                                      <p className="text-[9px] font-semibold text-slate-750 dark:text-slate-300">Спецификация партии на печать:</p>
                                    </div>
                                    <div className="pl-4 space-y-1">
                                      <div className="h-1 bg-slate-300 dark:bg-slate-700 rounded-full w-full" />
                                      <div className="h-1 bg-slate-300 dark:bg-slate-700 rounded-full w-5/6" />
                                    </div>
                                  </div>

                                  <div className="bg-slate-100/50 dark:bg-slate-900/55 p-2 rounded-lg text-[8px] font-mono space-y-0.5 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/40">
                                    <div>Плотность: {paperDensity === 'thick' ? 'Плотная 160 г/м²' : 'Стандартная 80 г/м²'}</div>
                                    <div>Тираж: {copies} шт • Страниц: 1</div>
                                    <div>Скрепление: {binding === 'none' ? 'Нет' : binding === 'staple' ? 'Степлер (угол)' : binding === 'file' ? 'Файлик' : binding === 'spring_metal' ? 'Металлическая пружина' : binding === 'spring_plastic' ? 'Пластиковая пружина' : 'Твёрдый переплет'}</div>
                                  </div>
                                </div>

                                <div className="flex justify-between items-end border-t border-slate-200/60 dark:border-slate-800/60 pt-2 text-[8px] font-bold text-slate-400">
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
                <div className="absolute bottom-4 left-4 bg-slate-900/90 text-white font-mono text-[10px] p-2.5 rounded-xl space-y-0.5 border border-slate-800 z-30 shadow-lg select-none backdrop-blur-xs">
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
                      aria-label="Вращение манекена по горизонтали"
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-bold">
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
                      aria-label="Наклон манекена по вертикали"
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-bold">
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
                      aria-label="Масштабирование манекена"
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-bold">
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
                  <p className="text-[12px] text-slate-600 dark:text-slate-400">
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
          </motion.div>
        </motion.div>
      )}</AnimatePresence>
      <AnimatePresence>{payingOrder && (
        <motion.div
          key="payingOrderModal"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
        >
          <motion.div
            className="glass-window w-full max-w-md overflow-hidden text-left transform transition-all relative"
            data-css-anim-off
            initial={{ opacity: 0, scale: 0.82, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
            exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
          >

            {/* Header */}
            <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">ЗАКАЗ В ОБРАБОТКЕ: <strong>{payingOrder.id}</strong></span>
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
                <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wide"><AnimatedTitle>Заказ принят на обработку!</AnimatedTitle></h3>
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

          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      {/* CUSTOM SELF DELETE CONFIRMATION MODAL */}
      <AnimatePresence>{showSelfDeleteModal && (
        <motion.div
          key="showSelfDeleteModal"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
        >
          <motion.div
            className="glass-window max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            data-css-anim-off
            initial={{ opacity: 0, scale: 0.82, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
            exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
          >
            <div className="flex items-center gap-3 text-rose-500 dark:text-rose-400 mb-4">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-100/50 dark:border-rose-900/35">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white"><AnimatedTitle>Удаление аккаунта</AnimatedTitle></h3>
                <p className="text-[11px] text-slate-400 font-bold">Это действие невозможно отменить</p>
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
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

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

      {/* "СПАСИБО" ЗА ОТЗЫВ — праздничный оверлей на весь экран поверх конфетти */}
      <AnimatePresence>
        {feedbackCelebrate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none px-4"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: [0, -8, 8, -8, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                className="inline-flex p-5 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-full shadow-2xl shadow-fuchsia-500/40 mb-4"
              >
                <Sparkles className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-3xl sm:text-4xl font-black text-white drop-shadow-lg">Спасибо! 💜</h2>
              <p className="text-sm sm:text-base text-white/90 font-bold mt-2 drop-shadow-lg">Вы помогаете нам стать лучше</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GIFT PROMO MODAL FOR CLIENT */}
      {/* Онбординг для новых клиентов */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)'}}>
          <div className="w-full max-w-sm glass-panel glass-panel-modal rounded-3xl p-7 flex flex-col items-center gap-6 animate-fade-in">
            {/* Логотип */}
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-3xl shadow-lg">
              🖨️
            </div>
            <div className="text-center">
              <h2 className="text-xl font-black text-white mb-1"><AnimatedTitle>Добро пожаловать!</AnimatedTitle></h2>
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
                    <p className="text-white/40 text-[12px]">{step.desc}</p>
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
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 170, damping: 20, mass: 1 }}
            className="coupon-neon-frame rounded-3xl max-w-md w-full relative"
          >
          <div data-css-anim-off className="glass-window overflow-hidden max-w-md w-full relative flex flex-col rounded-3xl">
            {/* Купон — логотип по центру, неоновая анимированная рамка вокруг всей
                карточки (та же техника, что у .btn-holo-glass, только ярче и толще).
                Рамка — на ОТДЕЛЬНОЙ обёртке без overflow-hidden, иначе её обрезает
                тот же overflow-hidden, что нужен для скругления баннера внутри. */}
            <div className="h-44 relative overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 40%, rgba(99,102,241,0.35), rgba(15,15,25,0.95) 70%)' }}>
              {/* Glow rings pulsing behind the logo */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-indigo-500/25 blur-xl gift-glow-ring" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-44 h-44 rounded-full border border-indigo-400/20 gift-glow-ring" style={{ animationDelay: '0.6s' }} />

              {/* Centered animated gift box */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl gift-box-bounce" style={{ filter: 'drop-shadow(0 8px 20px rgba(99,102,241,0.5))' }}>
                🎁
              </div>

              {/* Floating confetti/sparkle particles */}
              <div className="absolute top-6 left-8 text-lg gift-confetti-float">🎉</div>
              <div className="absolute top-10 right-10 text-base gift-confetti-float" style={{ animationDelay: '0.8s' }}>✨</div>
              <div className="absolute top-20 left-14 text-sm gift-confetti-float" style={{ animationDelay: '1.4s' }}>🎊</div>
              <div className="absolute top-8 right-20 text-sm gift-confetti-float" style={{ animationDelay: '0.3s' }}>⭐</div>

              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/10 to-transparent"></div>

              <div className="absolute bottom-4 left-5 right-5 flex justify-end items-end">
                <span className="font-mono text-xs text-white/70 font-semibold">Копи-точка А4 / А3</span>
              </div>
            </div>

            {/* Circular seal badge straddling the banner/body seam — чистый логотип,
                без цветной подложки за ним, только лёгкое свечение. */}
            <div className="relative z-10 flex justify-center -mt-6">
              <img src={logoImg} alt="Фото-Север" className="w-12 h-12 object-contain" style={{ filter: 'drop-shadow(0 4px 10px rgba(99,102,241,0.5))' }} />
            </div>

            {/* Coupon Body */}
            <div className="p-6 sm:p-8 pt-3 space-y-5 text-center">
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-slate-850 dark:text-white uppercase tracking-wider font-sans">
                  <AnimatedTitle>Скидочный купон!</AnimatedTitle>
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
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 tracking-widest block uppercase">Ваш личный промокод:</span>
                
                <h2 className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-widest bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 py-2.5 px-4 rounded-xl shadow-xs inline-block">
                  {user.promoCode}
                </h2>

                <div className="text-[12px] font-black text-emerald-650 bg-emerald-50 dark:bg-emerald-900/30 py-1.5 px-3 rounded-xl border border-emerald-500/10 inline-flex items-center gap-1.5">
                  Скидка на все услуги печати: <span className="text-sm font-extrabold text-amber-500">-{user.promoDiscount}%</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                Скопируйте промокод и примените его при оформлении следующего заказа, чтобы применить скидку в {user.promoDiscount}%!
              </p>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 content-start gap-2.5 pt-2">
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
          </div>
          </motion.div>
        </div>
      )}

      {showCollageBuilder && (
        <div
          className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => !collageBuilding && setShowCollageBuilder(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 170, damping: 20, mass: 1 }}
            onClick={(e) => e.stopPropagation()}
            data-css-anim-off
            className="glass-window w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-950/30 shrink-0">
              <div className="p-2.5 glass-icon-capsule glass-icon-indigo shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="overflow-hidden flex-1">
                <h3 className="text-sm font-black text-slate-800 dark:text-white"><AnimatedTitle>Конструктор коллажа А4</AnimatedTitle></h3>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  Выберите фото — сетка на листе подберётся автоматически
                </p>
              </div>
              {!collageBuilding && (
                <button
                  onClick={() => setShowCollageBuilder(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white transition cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Бумага для листа-коллажа */}
              <div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Бумага</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCollagePaperChoice('plain')}
                    className={`relative p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      collagePaperChoice === 'plain'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25'
                        : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                    }`}
                  >
                    {collagePaperChoice === 'plain' && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center option-selected-pop">
                        <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                      </div>
                    )}
                    <div className="text-[12px] font-black text-slate-800 dark:text-white">Обычная</div>
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{COLLAGE_PRICE_PLAIN} ₽/лист</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollagePaperChoice('photo')}
                    className={`relative p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      collagePaperChoice === 'photo'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/25'
                        : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                    }`}
                  >
                    {collagePaperChoice === 'photo' && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center option-selected-pop">
                        <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                      </div>
                    )}
                    <div className="text-[12px] font-black text-slate-800 dark:text-white">Фото 🖼</div>
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{COLLAGE_PRICE_PHOTO} ₽/лист</div>
                  </button>
                </div>
              </div>

              {/* Выбор фото */}
              <div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Фото для коллажа ({collageSelectedIds.length} выбрано)
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                  {collageEligibleFiles.map(f => {
                    const selected = collageSelectedIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleCollageSelect(f.id)}
                        className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                          selected ? 'border-indigo-500 ring-2 ring-indigo-500/40 scale-[0.96]' : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                        }`}
                      >
                        <img src={f.previewUrl} alt={f.name} loading="lazy" className="w-full h-full object-cover" />
                        {selected && (
                          <div className="absolute inset-0 bg-indigo-600/25 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center option-selected-pop">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Превью листов */}
              {collageSheets.length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Предпросмотр {collageSheets.length > 1 ? `(${collageSheets.length} листа А4)` : '(лист А4)'}
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {collageSheets.map((sheet, si) => {
                      const { cols, rows } = collageGridFor(sheet.length);
                      return (
                        <div
                          key={si}
                          className="shrink-0 bg-white rounded-lg shadow-md p-1.5 border border-slate-200"
                          style={{ width: 120, height: Math.round(120 * (297 / 210)) }}
                        >
                          <div
                            className="w-full h-full grid gap-1"
                            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
                          >
                            {sheet.map(f => (
                              <div key={f.id} className="bg-slate-100 rounded-xs overflow-hidden">
                                <img src={f.previewUrl} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <span>{collageSheets.length} {collageSheets.length === 1 ? 'лист' : 'листа'} × {collagePriceFor(collagePaperChoice)} ₽</span>
                <strong className="text-slate-800 dark:text-white text-base">{collageSheets.length * collagePriceFor(collagePaperChoice)} ₽</strong>
              </div>
              <button
                type="button"
                disabled={collageSelectedIds.length < 2 || collageBuilding}
                onClick={confirmCollage}
                className="btn-3d-choose w-full py-3.5 rounded-2xl text-white font-black text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {collageBuilding ? (
                  <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Собираем коллаж...</span>
                ) : collageSelectedIds.length < 2 ? (
                  'Выберите минимум 2 фото'
                ) : (
                  `Добавить коллаж — ${collageSheets.length * collagePriceFor(collagePaperChoice)} ₽ →`
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
      {showTelegramModal && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setShowTelegramModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel glass-panel-modal p-6 md:p-8 rounded-3xl space-y-5 max-w-md w-full relative"
            style={{ boxShadow: '0 0 0 1px rgba(56,189,248,0.15), 0 20px 60px -20px rgba(14,165,233,0.35)' }}
          >
            <button
              onClick={() => setShowTelegramModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <Send className="w-4.5 h-4.5 text-sky-500" />
              <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider"><AnimatedTitle>Telegram-уведомления</AnimatedTitle></h3>
            </div>

            <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-normal">
              Подключите бота один раз — и больше не придётся заходить на сайт, чтобы узнать новости о заказе:
            </p>

            <ul className="space-y-2">
              <li className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
                <span className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">🖨</span>
                Узнаете, когда заказ <b>взяли в печать</b>
              </li>
              <li className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
                <span className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">✅</span>
                Узнаете, когда заказ <b>готов к выдаче</b>
              </li>
              <li className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
                <span className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">💬</span>
                Сразу увидите, если <b>вам ответили</b> в чате
              </li>
            </ul>

            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
                <div>
                  <span className="text-xs font-black text-white block">Включить уведомления</span>
                  <span className="text-[10px] text-white/40 mt-0.5 block">Уведомления о заказах</span>
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

              <div className="space-y-3">
                {telegramLinked || user.telegramChatId ? (
                  <div className="flex items-center gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-black text-emerald-400">Telegram подключён</p>
                      <p className="text-[11px] text-white/50 mt-0.5">Вы будете получать уведомления в Telegram</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Нажмите кнопку — откроется бот в Telegram. Там просто нажмите <b className="text-white/80">«Отправить»</b> и всё готово.
                    </p>
                    <button
                      type="button"
                      onClick={handleConnectTelegram}
                      disabled={telegramLinking}
                      className="w-full py-3.5 px-4 disabled:opacity-50 text-white font-black text-sm rounded-2xl transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer"
                      style={{
                        background: 'linear-gradient(135deg, #38bdf8, #0ea5e9 60%, #0284c7)',
                        boxShadow: '0 8px 24px -6px rgba(14,165,233,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                      }}
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
          </motion.div>
        </div>
      )}

      {showDocCheckModal && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" onClick={handleCloseDocCheckModal}>
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel glass-panel-modal p-6 md:p-8 rounded-3xl space-y-5 max-w-md w-full relative max-h-[85vh] overflow-y-auto"
            style={{ boxShadow: '0 0 0 1px rgba(16,185,129,0.15), 0 20px 60px -20px rgba(16,185,129,0.35)' }}
          >
            <button
              onClick={handleCloseDocCheckModal}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <FileCheck className="w-4.5 h-4.5 text-emerald-500" />
              <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider"><AnimatedTitle>Проверка фото на документы</AnimatedTitle></h3>
            </div>

            <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-normal">
              Выберите документ, сделайте селфи или загрузите фото — покажем, соответствует ли оно требованиям, прежде чем печатать.
            </p>
            {docCheckFreeRemaining > 0 ? (
              <p className="text-[11px] font-bold text-emerald-500">
                Бесплатных проверок осталось: {docCheckFreeRemaining} из {DOC_CHECK_FREE_LIMIT}
              </p>
            ) : (
              <p className="text-[11px] font-bold text-amber-500">
                Бесплатные проверки закончились ({DOC_CHECK_FREE_LIMIT} из {DOC_CHECK_FREE_LIMIT} использовано). Следующая проверка — {DOC_CHECK_PAID_PRICE} ₽.
              </p>
            )}

            <div>
              <label className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">Тип документа</label>
              <select
                value={docCheckType}
                onChange={(e) => { setDocCheckType(e.target.value); setDocCheckResult(null); setDocCheckError(null); }}
                className="w-full py-3 px-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold outline-none focus:border-emerald-500/50 cursor-pointer"
              >
                {DOC_CHECK_TYPES.map(t => (
                  <option key={t.key} value={t.key} className="bg-slate-900 text-white">{t.label}</option>
                ))}
              </select>
            </div>

            {docCheckImage ? (
              <div className="relative">
                <img src={docCheckImage} alt="Фото для проверки" className="w-full max-h-64 object-contain rounded-2xl border border-white/10 bg-black/20" />
                <button
                  onClick={() => { setDocCheckImage(null); setDocCheckResult(null); setDocCheckError(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => docCheckSelfieInputRef.current?.click()}
                  className="flex flex-col items-center gap-1.5 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition cursor-pointer"
                >
                  <Camera className="w-5 h-5 text-emerald-400" />
                  <span className="text-[11px] font-black text-white/70 uppercase tracking-wider">Сделать селфи</span>
                </button>
                <button
                  type="button"
                  onClick={() => docCheckUploadInputRef.current?.click()}
                  className="flex flex-col items-center gap-1.5 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition cursor-pointer"
                >
                  <Upload className="w-5 h-5 text-emerald-400" />
                  <span className="text-[11px] font-black text-white/70 uppercase tracking-wider">Загрузить фото</span>
                </button>
              </div>
            )}
            <input type="file" accept="image/*" capture="user" ref={docCheckSelfieInputRef} onChange={handleDocCheckFile} className="hidden" aria-label="Сделать селфи для проверки документа" />
            <input type="file" accept="image/*" ref={docCheckUploadInputRef} onChange={handleDocCheckFile} className="hidden" aria-label="Загрузить фото для проверки документа" />

            {docCheckImage && !docCheckResult && docCheckFreeRemaining > 0 && (
              <button
                type="button"
                onClick={handleDocCheckSubmit}
                disabled={docCheckLoading}
                className="w-full py-3.5 px-4 disabled:opacity-50 text-white font-black text-sm rounded-2xl transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #34d399, #10b981 60%, #059669)',
                  boxShadow: '0 8px 24px -6px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                {docCheckLoading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Проверяем...</>
                ) : (
                  <><FileCheck className="w-4 h-4" /> Проверить фото</>
                )}
              </button>
            )}

            {docCheckImage && !docCheckResult && docCheckFreeRemaining === 0 && (
              <button
                type="button"
                onClick={handleDocCheckPaidSubmit}
                disabled={docCheckLoading}
                className="w-full py-3.5 px-4 disabled:opacity-50 text-white font-black text-sm rounded-2xl transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b 60%, #d97706)',
                  boxShadow: '0 8px 24px -6px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                }}
              >
                {docCheckLoading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Создаём платёж...</>
                ) : (
                  <><FileCheck className="w-4 h-4" /> Оплатить {DOC_CHECK_PAID_PRICE} ₽ и проверить</>
                )}
              </button>
            )}

            {docCheckError && (
              <p className="text-[12px] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">{docCheckError}</p>
            )}

            {docCheckResult && (
              <div className="space-y-2">
                {docCheckResult.map(check => (
                  <div key={check.id} className={`flex items-start gap-2.5 p-3 rounded-2xl border ${check.ok ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                    {check.ok ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`text-xs font-black ${check.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{check.label}</p>
                      {check.issue && <p className="text-[12px] text-white/60 mt-0.5">{check.issue}</p>}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => { setDocCheckImage(null); setDocCheckResult(null); setDocCheckError(null); }}
                  className="w-full py-3 px-4 text-white/70 hover:text-white font-bold text-xs rounded-2xl bg-white/5 hover:bg-white/10 transition cursor-pointer mt-1"
                >
                  Проверить другое фото
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Отдельное окно ИИ-консультанта (tz-fable-ai-chat-master.md +
          tz-fable-chat-icon-attach.md) — независимое от чата с оператором,
          открывается только с центральной кнопки дока. */}
      <AnimatePresence>
      {showAiChat && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={handleCloseAiChat}>
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel glass-panel-modal rounded-3xl w-full max-w-md h-[min(640px,85vh)] flex flex-col relative overflow-hidden"
            style={{ boxShadow: '0 0 0 1px rgba(129,140,248,0.15), 0 20px 60px -20px rgba(99,102,241,0.35)' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <video autoPlay loop muted playsInline className="rounded-full object-cover" style={{ width: 28, height: 28 }}>
                  <source src={aiAssistantCoinWebm} type="video/webm" />
                  <source src={aiAssistantCoinMp4} type="video/mp4" />
                </video>
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider"><AnimatedTitle>ИИ-консультант</AnimatedTitle></h3>
              </div>
              <div className="flex items-center gap-1.5">
                {blockedSpeechUrl && (
                  <button
                    onClick={playBlockedSpeech}
                    title="Браузер заблокировал автопроигрывание — нажми, чтобы услышать ответ"
                    aria-label="Озвучить ответ"
                    className="px-2.5 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1 text-[11px] font-bold text-white transition cursor-pointer animate-pulse"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Озвучить
                  </button>
                )}
                <button
                  onClick={toggleAiChatSpeak}
                  title={aiChatSpeakEnabled ? 'Озвучивать ответы: вкл' : 'Озвучивать ответы: выкл'}
                  aria-label="Озвучивать ответы"
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition cursor-pointer"
                >
                  {aiChatSpeakEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleCloseAiChat}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {aiChatMessages.length === 0 && (
                <div className="text-center text-xs text-slate-500 dark:text-slate-400 py-8 px-4">
                  Спросите про услуги, цены или часы работы — текстом или голосом 🎤
                </div>
              )}
              {aiChatMessages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} gap-2`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-100'
                  }`}>
                    {m.content}
                  </div>
                  {m.showRoute && (
                    <button
                      onClick={openAiChatRoute}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Построить маршрут 📍
                    </button>
                  )}
                  {m.price && <AiPriceCard price={m.price} />}
                </div>
              ))}
              {aiChatSending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3.5 py-2.5 bg-slate-100 dark:bg-white/5 text-xs text-slate-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '240ms' }} />
                  </div>
                </div>
              )}
              <div ref={aiChatBottomRef} />
            </div>

            <form onSubmit={handleSendAiChatMessage} className="p-4 border-t border-white/10 flex gap-2 shrink-0">
              {speechRecognitionSupported && (
                <button
                  type="button"
                  onClick={handleOpenVoiceOverlay}
                  title="Голосовой вопрос"
                  aria-label="Голосовой вопрос"
                  className="shrink-0 p-3 rounded-xl transition flex items-center justify-center border bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-850"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
              <input
                type="text"
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                placeholder="Задайте вопрос..."
                aria-label="Сообщение ИИ-консультанту"
                className="flex-1 bg-slate-50 dark:bg-slate-950 text-base sm:text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-850 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!aiChatInput.trim() || aiChatSending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:dark:bg-slate-850 text-white py-3 px-4.5 rounded-xl font-bold text-xs flex items-center justify-center transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Полноэкранный голосовой режим ИИ-чата (как voice mode в GPT-чатах) */}
      <AnimatePresence>
      {showVoiceOverlay && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-lg flex flex-col items-center justify-center p-6 z-[60]">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.9 }}
            className="flex flex-col items-center justify-center gap-8 w-full max-w-sm"
          >
            {/* Рация: зажми кружок и говори, отпусти — вопрос сразу уходит.
                pointer-события покрывают и палец, и мышь одним обработчиком;
                onPointerLeave страхует случай, когда палец соскользнул с
                кружка не отпуская экран вообще. */}
            <div
              onPointerDown={(e) => { e.preventDefault(); startVoiceCapture(); }}
              onPointerUp={stopVoiceCapture}
              onPointerLeave={stopVoiceCapture}
              onPointerCancel={stopVoiceCapture}
              className="relative flex items-center justify-center select-none touch-none cursor-pointer"
              style={{ width: 180, height: 180, WebkitTouchCallout: 'none' }}
            >
              {voiceOverlayPhase === 'listening' && (
                <>
                  <span className="absolute inset-0 rounded-full bg-rose-500/40 voice-pulse-ring" />
                  <span className="absolute inset-0 rounded-full bg-rose-500/40 voice-pulse-ring" style={{ animationDelay: '0.5s' }} />
                </>
              )}
              <video
                autoPlay loop muted playsInline
                className="rounded-full object-cover relative z-10 pointer-events-none"
                style={{ width: 150, height: 150 }}
              >
                <source src={aiAssistantCoinWebm} type="video/webm" />
                <source src={aiAssistantCoinMp4} type="video/mp4" />
              </video>
              {aiIsSpeaking && (
                <div className="absolute inset-0 z-20 flex items-center justify-center gap-1 pointer-events-none">
                  {[0, 1, 2, 3, 4].map(i => (
                    <span
                      key={i}
                      className="w-1 rounded-full bg-slate-900 voice-track-bar"
                      style={{ height: 34, animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="text-center min-h-[3em] px-2">
              {voiceOverlayPhase === 'idle' && (
                <p className="text-white/60 text-sm font-bold">Зажми кружок и говори</p>
              )}
              {voiceOverlayPhase === 'listening' && (
                <p className="text-white text-sm font-bold">Слушаю…</p>
              )}
              {voiceOverlayPhase === 'thinking' && (
                <p className="text-white/70 text-sm font-bold">Думаю…</p>
              )}
              {voiceOverlayPhase === 'error' && (
                <p className="text-rose-400 text-sm font-bold">{voiceOverlayError}</p>
              )}
              {voiceOverlayPhase === 'answered' && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-white text-sm leading-relaxed text-center">{voiceOverlayReply}</p>
                  {voiceOverlayShowRoute && (
                    <button
                      onClick={openAiChatRoute}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Построить маршрут 📍
                    </button>
                  )}
                  {voiceOverlayPrice && <AiPriceCard price={voiceOverlayPrice} />}
                  {blockedSpeechUrl && (
                    <button
                      onClick={playBlockedSpeech}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer animate-pulse"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> Озвучить
                    </button>
                  )}
                  {speechDiag && (
                    <p className="text-rose-400 text-[11px] font-bold text-center">Озвучка не удалась: {speechDiag}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {(voiceOverlayPhase === 'answered' || voiceOverlayPhase === 'error') && (
                <p className="text-white/50 text-[12px] font-bold">Зажми кружок, чтобы спросить ещё</p>
              )}
              <button
                onClick={handleCloseVoiceOverlay}
                className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Причина, по которой камера не открылась — видна пользователю, а не
          только в консоли; сама по себе не блокирует работу, файловый
          проводник как запасной вариант уже открылся параллельно. */}
      {cameraError && (
        <div className="fixed inset-x-4 bottom-4 z-[60] animate-fade-in">
          <div className="glass-panel rounded-2xl p-4 max-w-md mx-auto flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-white/90 flex-1">{cameraError}</p>
            <button onClick={() => setCameraError(null)} className="text-white/50 hover:text-white cursor-pointer shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Живой просмотр камеры (getUserMedia) — работает и на телефоне, и на
          ПК с веб-камерой, в отличие от input[capture], который на десктопе
          просто открывает обычный проводник. */}
      {showLiveCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-fade-in">
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            <video
              ref={cameraVideoRef}
              autoPlay
              playsInline
              muted
              className="max-w-full max-h-full object-contain"
            />
            {/* Рамка-подсказка под нужное соотношение сторон — просто ориентир,
                не обрезает и не анализирует кадр. */}
            <div
              className="absolute border-2 border-dashed border-white/50 pointer-events-none rounded-lg"
              style={
                scanTargetRatio === 'a4'
                  ? { width: '55%', aspectRatio: '210 / 297' }
                  : { width: '70%', aspectRatio: '85.6 / 54' }
              }
            />
          </div>
          <div className="p-4 pb-6 shrink-0 flex items-center justify-center gap-6">
            <button
              onClick={closeCamera}
              className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center justify-center cursor-pointer"
              aria-label="Отмена"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={captureFromCamera}
              className="w-18 h-18 rounded-full bg-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
              style={{ width: 72, height: 72 }}
              aria-label="Сфотографировать"
            >
              <span className="w-16 h-16 rounded-full border-2 border-slate-300" />
            </button>
            <div className="w-12 h-12" />
          </div>
        </div>
      )}

      {/* Результат скана — переснять, если криво, или использовать (уходит в
          обычную загрузку файлов через handleFiles, дальше — стандартный
          путь: модалка "Настройте параметры печати" и т.д.). */}
      {scanRawImageUrl && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-fade-in">
          <div className="p-4 pt-5 shrink-0">
            <h3 className="text-xs font-black text-white uppercase tracking-wider text-center"><AnimatedTitle>Результат скана</AnimatedTitle></h3>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
            {scanProcessing ? (
              <div className="flex flex-col items-center gap-3 text-white/70">
                <span className="w-8 h-8 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                <span className="text-xs font-bold">Обрабатываем скан...</span>
              </div>
            ) : scanProcessedImageUrl ? (
              <img src={scanProcessedImageUrl} alt="Результат скана" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
            ) : null}
          </div>
          <div className="p-4 pb-6 shrink-0 space-y-2.5">
            <button
              onClick={confirmScan}
              disabled={scanProcessing || !scanProcessedImageUrl}
              className="glass-icon colored capsule-glow-green glass-icon-pill w-full py-3.5 rounded-2xl text-white font-black text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="beam"><i /></span>
              <span className="relative z-[3]">Использовать этот скан →</span>
            </button>
            <button
              onClick={openCamera}
              disabled={scanProcessing}
              className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-sm cursor-pointer disabled:opacity-40"
            >
              Переснять
            </button>
            <button
              onClick={() => { setScanRawImageUrl(null); setScanProcessedImageUrl(null); }}
              className="w-full py-2 text-xs font-bold text-rose-400 hover:text-rose-300 cursor-pointer"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Отдельное окно "Заметили ошибку?" — не связано с формой пожеланий выше,
          можно приложить скриншот (грузится в Storage сразу при выборе файла,
          см. handleBugReportFileChange). Закрывается по клику на фон/крестик —
          если человеку неинтересно, ничего не мешает просто закрыть. */}
      <AnimatePresence>
      {showBugReportModal && (
        <div
          className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => { if (!bugReportSending) setShowBugReportModal(false); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel glass-panel-modal p-6 md:p-8 rounded-3xl space-y-4 max-w-md w-full relative"
          >
            <button
              onClick={() => setShowBugReportModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-lg">🐞</span>
              <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider"><AnimatedTitle>Заметили ошибку?</AnimatedTitle></h3>
            </div>

            {bugReportSent ? (
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm py-6 justify-center">
                <CheckCircle className="w-5 h-5" /> Спасибо, мы проверим!
              </div>
            ) : (
              <form onSubmit={handleSendBugReport} className="space-y-3">
                <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-normal">
                  Опишите, что пошло не так, и приложите скриншот — так мы быстрее разберёмся.
                </p>
                <textarea
                  value={bugReportText}
                  onChange={(e) => setBugReportText(e.target.value)}
                  placeholder="Что случилось? (необязательно, если есть скриншот)"
                  maxLength={1000}
                  rows={3}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-rose-400/40 resize-none"
                />

                <input
                  ref={bugReportFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBugReportFileChange}
                />

                {bugReportPreviewUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={bugReportPreviewUrl}
                      alt="Скриншот ошибки"
                      className="max-h-32 rounded-xl border border-slate-200 dark:border-white/10 object-contain"
                    />
                    {bugReportUploading && (
                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center text-white text-[11px] font-bold">
                        Загрузка...
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setBugReportPreviewUrl(null); setBugReportScreenshotUrl(null); if (bugReportFileInputRef.current) bugReportFileInputRef.current.value = ''; }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => bugReportFileInputRef.current?.click()}
                    className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/5 border border-dashed border-slate-300 dark:border-white/15 rounded-xl px-4 py-3 hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4" /> Прикрепить скриншот
                  </button>
                )}

                <button
                  type="submit"
                  disabled={(!bugReportText.trim() && !bugReportScreenshotUrl) || bugReportSending || bugReportUploading}
                  className="w-full flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs px-5 py-3 rounded-xl shadow-md transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> {bugReportSending ? 'Отправка...' : 'Отправить'}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      )}
      </AnimatePresence>

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
                <div className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Активация</div>
                <div className="text-2xl font-black text-slate-850 dark:text-slate-205 font-mono">
                  {tornPromoCode.slice(0, Math.ceil(tornPromoCode.length / 2))}
                </div>
              </div>

              <div className="text-[11px] font-bold text-slate-450 font-mono">
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
                <div className="text-[11px] font-black text-rose-500 uppercase tracking-widest">Скидка</div>
                <div className="text-2xl font-black text-slate-850 dark:text-slate-205 font-mono">
                  {tornPromoCode.slice(Math.ceil(tornPromoCode.length / 2))}
                </div>
              </div>

              <div className="text-[11px] font-black text-emerald-650 font-mono text-right">
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
      <AnimatePresence>{activeLegalDoc && (
        <motion.div
          key="activeLegalDocModal"
          className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
        >
          <motion.div
            className="glass-window w-full max-w-2xl p-6 md:p-8 flex flex-col max-h-[85vh] relative"
            data-css-anim-off
            initial={{ opacity: 0, scale: 0.82, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
            exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
          >
            <button
              onClick={() => setActiveLegalDoc(null)} 
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-450 dark:text-slate-400 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-850 dark:text-white border-b border-slate-100 dark:border-slate-850 pb-3 mb-4 select-none text-left">
              <AnimatedTitle>
                {activeLegalDoc === 'privacy' && 'Политика конфиденциальности (152-ФЗ РФ)'}
                {activeLegalDoc === 'terms' && 'Договор публичной оферты'}
                {activeLegalDoc === 'delivery' && 'Условия оплаты, доставки и возврата средств'}
              </AnimatedTitle>
            </h2>
            
            <div className="overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium md:pr-2 text-left">
              {(activeLegalDoc === 'privacy' || activeLegalDoc === 'terms') && (
                <>
                  <p>
                    Полный текст {activeLegalDoc === 'privacy' ? 'политики обработки персональных данных' : 'публичной оферты'} — единый документ для всего сайта, чтобы условия нигде не расходились.
                  </p>
                  <a
                    href="/legal.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors"
                  >
                    Открыть {activeLegalDoc === 'privacy' ? 'политику ПДн' : 'публичную оферту'} →
                  </a>
                </>
              )}
              {activeLegalDoc === 'delivery' && (
                <>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">1. Способы оплаты заказа</p>
                  <p>Оплата заказов осуществляется через Сертифицированный банковский эквайринг (МИР, Visa, MasterCard) после подтверждения характеристик файла. Опционально возможна быстрая оплата на кассе или через СБП QR в пункте выдачи.</p>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200">2. Условия выдачи и доставки</p>
                  <p>Выдача заказов производится по адресу: г. Раменское, Московская область, Северное шоссе, д. 18. Возможна курьерская доставка по согласованию с оператором.</p>
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
          </motion.div>
        </motion.div>
      )}</AnimatePresence>


    </div>
  );
}
