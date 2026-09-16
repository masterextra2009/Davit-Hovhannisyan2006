/**
 * Клиент нашего сервера (api/v2) — замена Firebase.
 *
 * Пока этот файл никуда не подключён: переключение сайта с Firebase на свой
 * сервер идёт отдельным шагом, и включаться оно будет флагом (см. isV2Enabled
 * ниже), чтобы боевой сайт продолжал работать как раньше, пока всё не
 * проверено на копии sever-18.ru/proverka/.
 *
 * Главное отличие от Firebase: живой подписки нет. Вместо неё опрос —
 * «что изменилось с такого-то времени». Сервер вместе с данными возвращает
 * своё время (serverTime), его и отправляем следующим запросом: часы на
 * телефоне клиента могут врать, а сервер сам себе всегда верен.
 */

import { User, Order, ChatMessage, Notification, Promo, DatabaseState } from '../types';

const BASE = 'https://sever-18.ru/api/v2';

/** Ключ, под которым лежит пропуск (токен входа) в этом браузере. */
const TOKEN_KEY = 'sever18_token';
/** Как часто спрашиваем сервер «что нового». */
const POLL_MS = 5000;
/** Реже, чем всё остальное: новости меняются раз в недели, а не в секунды. */
const PROMOS_EVERY = 12;
/** Сигнал «я на сайте» — по нему сервер решает, слать ли push. */
const HEARTBEAT_MS = 45000;

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* приватный режим браузера — просто останемся без сохранённого входа */
  }
}

/**
 * Включён ли новый сервер. По умолчанию — нет, то есть сайт работает через
 * Firebase, как и раньше. Включается либо сборкой (VITE_BACKEND=v2), либо
 * вручную в браузере: localStorage.setItem('sever18_backend', 'v2').
 */
export function isV2Enabled(): boolean {
  try {
    if (localStorage.getItem('sever18_backend') === 'v2') return true;
    if (localStorage.getItem('sever18_backend') === 'firebase') return false;
  } catch {
    /* localStorage может быть недоступен — тогда решает только сборка */
  }
  return (import.meta as any).env?.VITE_BACKEND === 'v2';
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown; form?: FormData } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}/${path}`, {
    method: options.method || (options.body || options.form ? 'POST' : 'GET'),
    headers,
    body: options.form ? options.form : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* сервер мог отдать пустой ответ или файл — разберёмся по коду ниже */
  }
  if (!res.ok || (data && data.ok === false)) {
    const message = (data && (data.error as string)) || 'Сервер недоступен. Попробуйте ещё раз.';
    // Пропуск протух или отозван — пусть верхний слой предложит войти заново.
    if (res.status === 401) setToken('');
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ─────────────────────────── Вход и аккаунт ───────────────────────────

export interface AuthAnswer { ok: true; token: string; user: User }

export async function register(input: {
  email: string; password: string; fullName: string; phone?: string;
  consentVersion: string; personalDataConsent: boolean; marketingConsent?: boolean;
  referralCode?: string; source?: 'site' | 'app';
}): Promise<User> {
  const data = await request<AuthAnswer>('auth.php?action=register', { body: input });
  setToken(data.token);
  return data.user;
}

export async function login(email: string, password: string): Promise<User> {
  const data = await request<AuthAnswer>('auth.php?action=login', { body: { email, password, source: 'site' } });
  setToken(data.token);
  return data.user;
}

export async function me(): Promise<User | null> {
  if (!getToken()) return null;
  try {
    const data = await request<{ user: User }>('auth.php?action=me');
    return data.user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function logout(): Promise<void> {
  try {
    await request('auth.php?action=logout', { method: 'POST', body: {} });
  } catch {
    /* даже если сервер не ответил, локальный пропуск всё равно убираем */
  }
  setToken('');
}

// ─────────────────────────── Заказы ───────────────────────────

export const orders = {
  /** Номер заказа бронируется ДО загрузки файлов — как и раньше. */
  reserve: () => request<{ orderId: string }>('orders.php?action=reserve', { body: {} }),
  create: (order: Partial<Order>) => request<{ order: Order }>('orders.php?action=create', { body: { order } }),
  list: (since?: string) =>
    request<{ orders: Order[]; deletedIds: string[]; serverTime: string }>(
      `orders.php?action=list${since ? `&since=${encodeURIComponent(since)}` : ''}`),
  get: (id: string) => request<{ order: Order }>(`orders.php?action=get&id=${encodeURIComponent(id)}`),
  rate: (id: string, rating: number, ratingComment?: string) =>
    request('orders.php?action=rate', { body: { id, rating, ratingComment } }),
  cancel: (id: string) => request('orders.php?action=cancel', { body: { id } }),
  save: (order: Order) => request<{ order: Order }>('orders.php?action=save', { body: { order } }),
  remove: (id: string) => request('orders.php?action=delete', { body: { id } }),
};

// ─────────────────────────── Чат ───────────────────────────

export const chat = {
  list: (since?: string) =>
    request<{ messages: ChatMessage[]; deletedIds: string[]; adminTyping: boolean; serverTime: string }>(
      `chat.php?action=list${since ? `&since=${encodeURIComponent(since)}` : ''}`),
  send: (message: string, userId?: string) =>
    request<{ message: ChatMessage }>('chat.php?action=send', { body: userId ? { message, userId } : { message } }),
  markRead: (userId?: string) => request('chat.php?action=read', { body: userId ? { userId } : {} }),
  typing: (userId: string, on: boolean) => request('chat.php?action=typing', { body: { userId, on } }),
  remove: (id: string) => request('chat.php?action=delete', { body: { id } }),
  clear: (userId: string) => request<{ deleted: number }>('chat.php?action=clear', { body: { userId } }),
};

// ─────────────────────────── Уведомления ───────────────────────────

export const notifications = {
  list: (since?: string) =>
    request<{ notifications: Notification[]; deletedIds: string[]; serverTime: string }>(
      `notifications.php?action=list${since ? `&since=${encodeURIComponent(since)}` : ''}`),
  create: (n: { title: string; body: string; type: Notification['type']; userId?: string }) =>
    request<{ notification: Notification }>('notifications.php?action=create', { body: n }),
  markRead: (id?: string) => request('notifications.php?action=read', { body: id ? { id } : {} }),
  remove: (id: string) => request('notifications.php?action=delete', { body: { id } }),
};

// ─────────────────────────── Новости и акции ───────────────────────────

export const promos = {
  list: (all = false) => request<{ promos: Promo[] }>(`promos.php?action=list${all ? '&all=1' : ''}`),
  save: (promo: Partial<Promo>) => request<{ promo: Promo }>('promos.php?action=save', { body: promo }),
  toggle: (id: string, active: boolean) => request('promos.php?action=toggle', { body: { id, active } }),
  remove: (id: string) => request('promos.php?action=delete', { body: { id } }),
};

// ─────────────────────────── Приглашения ───────────────────────────

export const referrals = {
  info: () => request<{ code: string; link: string; invitedCount: number; rewardedCount: number }>(
    'referrals.php?action=info'),
};

// ─────────────────────────── Файлы ───────────────────────────

export const files = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ path: string; url: string; name: string; size: number }>('files.php?action=upload', { form });
  },
  /** Временная ссылка — для картинок и печати, где заголовок с входом не приложить. */
  link: (path: string, hours?: number) => request<{ url: string }>('files.php?action=link', { body: { path, hours } }),
};

// ─────────────────────────── Уведомления на устройство ───────────────────────────

export const push = {
  publicKey: () => request<{ publicKey: string }>('push.php?action=key'),
  registerExpo: (token: string) => request('push.php?action=register', { body: { token } }),
  subscribeBrowser: (subscription: PushSubscriptionJSON) =>
    request('push.php?action=subscribe', { body: { subscription } }),
  unsubscribeBrowser: () => request('push.php?action=unsubscribe', { body: {} }),
  heartbeat: (online: boolean) => request('push.php?action=heartbeat', { body: { online } }),
};

/**
 * Подписка браузера на уведомления сайта.
 *
 * Ключ у нас новый (старый лежал в секретах Firebase и недоступен), поэтому
 * подписку, сделанную на прежний ключ, надо сначала отменить — иначе браузер
 * вернёт старую, и уведомления просто не будут доходить.
 */
export async function subscribeBrowserPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Уведомления не поддерживаются этим браузером');
  }
  const { publicKey } = await push.publicKey();
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const same = existing.options?.applicationServerKey
      && bytesToBase64Url(new Uint8Array(existing.options.applicationServerKey as ArrayBuffer)) === publicKey;
    if (same) {
      await push.subscribeBrowser(existing.toJSON());
      return;
    }
    await existing.unsubscribe();
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
  await push.subscribeBrowser(subscription.toJSON());
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─────────────────────────── Опрос вместо живой подписки ───────────────────────────

/**
 * Заменяет subscribeToFirebaseCollections: раз в несколько секунд спрашивает
 * сервер, что изменилось, и отдаёт изменения тем же колбэком onSync.
 *
 * Правила, из-за которых это не просто setInterval:
 *  • пока вкладка спрятана, не опрашиваем вовсе — незачем будить телефон;
 *    при возврате на вкладку спрашиваем сразу, не дожидаясь очереди;
 *  • новый запрос не уходит, пока не ответил прошлый (иначе на медленной
 *    связи запросы наложатся друг на друга);
 *  • удалённые записи приходят отдельным списком deletedIds — опрос «что
 *    нового» иначе их не увидит, их же в базе уже нет.
 */
export function subscribeByPolling(
  currentUser: User,
  onSync: (updates: Partial<DatabaseState>, deleted?: { orders?: string[]; chatMessages?: string[]; notifications?: string[] }) => void,
  onTyping?: (adminTyping: boolean) => void
): () => void {
  let stopped = false;
  let busy = false;
  let ticks = 0;
  let sinceOrders: string | undefined;
  let sinceChat: string | undefined;
  let sinceAlerts: string | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    if (stopped || busy || document.visibilityState === 'hidden') return;
    busy = true;
    try {
      const [o, c, n] = await Promise.all([orders.list(sinceOrders), chat.list(sinceChat), notifications.list(sinceAlerts)]);

      const updates: Partial<DatabaseState> = {};
      if (o.orders.length || !sinceOrders) updates.orders = o.orders;
      if (c.messages.length || !sinceChat) updates.chatMessages = c.messages;
      if (n.notifications.length || !sinceAlerts) updates.notifications = n.notifications;

      // Новости спрашиваем реже — они меняются не каждую секунду.
      if (ticks % PROMOS_EVERY === 0) {
        const p = await promos.list(currentUser.role === 'admin');
        updates.promos = p.promos;
      }

      sinceOrders = o.serverTime;
      sinceChat = c.serverTime;
      sinceAlerts = n.serverTime;
      ticks++;

      if (Object.keys(updates).length) {
        onSync(updates, {
          orders: o.deletedIds,
          chatMessages: c.deletedIds,
          notifications: n.deletedIds,
        });
      }
      onTyping?.(c.adminTyping);
    } catch (e) {
      // Сеть моргнула — просто пропускаем круг. Следующий опрос через POLL_MS,
      // никакого «подписка умерла навсегда», как было у Firestore onSnapshot.
      console.warn('Опрос сервера не удался, попробуем снова:', e);
    } finally {
      busy = false;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void tick();
  };

  void tick();
  timer = setInterval(tick, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);

  // «Я на сайте» — сервер по этому признаку не шлёт push тому, кто и так
  // смотрит на экран.
  void push.heartbeat(true).catch(() => {});
  heartbeat = setInterval(() => {
    if (document.visibilityState === 'visible') void push.heartbeat(true).catch(() => {});
  }, HEARTBEAT_MS);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    if (heartbeat) clearInterval(heartbeat);
    document.removeEventListener('visibilitychange', onVisible);
    void push.heartbeat(false).catch(() => {});
  };
}
