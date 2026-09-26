/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { trackAnalyticsEvent, getCurrentUser } from './utils';
import { User, Order, ChatMessage, Notification, Feedback, DatabaseState } from './types';
import * as v2 from './api/v2';

/**
 * Данные сайта — только на своём сервере (api/v2, клиент — src/api/v2.ts).
 *
 * До 26.09.2026 каждая функция здесь умела работать и по-старому, через
 * Firebase (Google, серверы за рубежом), — на время переезда. Переезд
 * закончен, ветки Firebase и сама библиотека удалены. Имена функций
 * («…ToFirebase») оставлены прежними, чтобы не переписывать компоненты.
 */
const CONSENT_VERSION = v2.CONSENT_VERSION;

/**
 * Кто сейчас вошёл — по ответу нашего сервера. Нужен там, где поведение
 * зависит от роли (например, клиент оформляет заказ, а админ правит чужой).
 * Firebase держал это в auth.currentUser; у нас профиль приходит с сервера,
 * поэтому запоминаем последний известный и обновляем при каждом входе.
 */
let cachedUser: User | null = null;
export function setCachedUser(user: User | null): void {
  cachedUser = user;
}

/**
 * Register a user via Firebase Auth and create their Firestore document profile
 */
export async function registerUserWithFirebase(email: string, password: string,fullName: string, phone: string, role: 'client' | 'admin' = 'client', referralCodeInput?: string, marketingConsent = false): Promise<User> {
  const trimmedEmail = email.trim();
  const input = {
      email: trimmedEmail,
      password,
      fullName: fullName.trim(),
      phone: phone.trim(),
      consentVersion: CONSENT_VERSION,
      personalDataConsent: true,
      // Реклама — только по отдельному согласию (38-ФЗ, ст. 18). Галочка при
      // регистрации выключена по умолчанию, её ответ сервер пишет в consents
      // вместе с датой и версией документа.
      marketingConsent,
      referralCode: referralCodeInput,
    };
    // Если в этой вкладке уже есть гостевой пропуск («Загрузить файл» без
    // регистрации) — не заводим второй аккаунт, а достраиваем этот: иначе
    // заказы гостя остались бы на прежнем номере, и человек увидел бы пустой
    // кабинет. На стороне сервера это auth.php?action=upgrade.
    const current = await v2.me();
    const user = current?.isGuest ? await v2.upgradeGuest(input) : await v2.register(input);
    setCachedUser(user);
    trackAnalyticsEvent('registration');
    return user;
}

/**
 * Sign in a user via Firebase Auth and load their Firestore document profile
 */
export async function signInUserWithFirebase(email: string, password: string): Promise<User> {
  const trimmedEmail = email.trim();
  const user = await v2.login(trimmedEmail, password);
    setCachedUser(user);
    return user;
}

/**
 * Sign in a user via a real Google account.
 *
 * Uses signInWithPopup, NOT signInWithRedirect. Root cause of the long-standing
 * "Google sign-in never completes" bug: our Firebase project's authDomain is
 * gen-lang-client-0575610984.firebaseapp.com, which is a different domain than
 * the one this app is served from (sever-18.ru). signInWithRedirect's
 * getRedirectResult() relies on a cross-origin iframe/storage relay hosted on
 * authDomain to hand the sign-in result back to the app's origin — and every
 * modern browser (Chrome 115+, Firefox 109+, Safari 16.1+; this is required
 * behavior, not a bug) blocks that relay by default as third-party storage
 * access. That is exactly why getRedirectResult() always resolved null with no
 * error, on every browser tested. See:
 * https://firebase.google.com/docs/auth/web/redirect-best-practices
 *
 * signInWithPopup sidesteps this: the popup communicates the result back to
 * the opener via window.postMessage, which is unaffected by third-party
 * storage partitioning (it's not a storage read at all). Firebase's own docs
 * list signInWithPopup as the primary fallback for this exact situation.
 *
 * (The proper long-term fix for redirect — pointing authDomain at sever-18.ru
 * and reverse-proxying /__/auth/* to the Firebase authDomain — needs a server
 * change plus a matching Google Cloud OAuth "authorized redirect URI" entry,
 * and wasn't applied here since it can't be safely tested from this repo.)
 */
export async function signInWithGoogleFirebase(): Promise<User> {
  // На своём сервере это не всплывающее окно, а обычный переход на страницу
    // Google и возврат обратно с билетом (?auth_ticket=…), который меняется на
    // вход уже в App.tsx. Поэтому здесь страница просто уходит, и обещание
    // никогда не выполняется — это нормально.
    v2.startSocialLogin('google');
    return new Promise<User>(() => {});
}

/**
 * "Загрузить файл" без регистрации: подписывает анонимно через Firebase
 * (signInAnonymously) и создаёт лёгкий гостевой профиль — тот же паттерн,
 * что и для входа через Telegram (email: '' и т.д.), плюс isGuest: true.
 * fullName/phone дозаполняются позже, на "Шаг 2. Оформление" (см.
 * Dashboard.tsx). Если этот же браузер потом регистрируется по-настоящему
 * через AuthScreen, registerUserWithFirebase апгрейдит этот же профиль на
 * месте (linkWithCredential) — заказы остаются на том же uid.
 */
export async function signInAsGuest(): Promise<User> {
  const user = await v2.guest(CONSENT_VERSION);
    setCachedUser(user);
    return user;
}

/**
 * Log out user from Firebase Auth
 */
export async function signOutUserWithFirebase(): Promise<void> {
  await v2.logout();
    setCachedUser(null);
    return;
}

/**
 * Deletes a single order document from Firestore
 */
export async function deleteOrderFromFirebase(orderId: string): Promise<void> {
  await v2.orders.remove(orderId);
    return;
}

/**
 * Deletes user profile and related resources from Firestore
 */
export async function deleteUserAccountWithFirebase(userId: string): Promise<void> {
  // «Удалить СЕБЯ» (auth.php delete-account) смотрит на того, кто прислал
    // запрос, и userId не читает — позвать его из админки для клиента значит
    // удалить самого администратора. Поэтому чужой аккаунт админ удаляет
    // отдельным действием users.php delete (24.09.2026).
    const me = getCurrentUser();
    if (me && me.id !== userId) {
      await v2.users.remove(userId);
      return;
    }
    // Клиент удаляет себя сам; сервер обезличивает профиль и обрывает входы.
    await v2.deleteAccount();
    return;
}

/**
 * Атомарно резервирует следующий порядковый номер заказа через Firestore-
 * транзакцию (counters/orders, поле next) — гарантирует уникальность даже
 * при одновременном оформлении заказов разными клиентами. Старые заказы
 * (формат ORD-<base36 timestamp><random>) не трогаем — только для новых.
 * При сбое транзакции откатываемся на прежнюю схему ID, чтобы оформление
 * заказа не заблокировалось из-за проблемы со счётчиком.
 */
export async function getNextOrderNumber(): Promise<number> {
  // Сервер сам выдаёт следующий номер и держит его за этим клиентом
    // (orders.php?action=reserve), возвращая готовый «ORD-1042».
    const { orderId } = await v2.orders.reserve();
    const digits = parseInt(String(orderId).replace(/\D+/g, ''), 10);
    if (!Number.isFinite(digits)) {
      throw new Error('Сервер вернул неожиданный номер заказа');
    }
    return digits;
}

/**
 * Handle Order updates
 */
export async function saveOrderToFirebase(order: Order): Promise<void> {
  // Клиент оформляет заказ (create — сервер сам поставит дату, статус и
    // пересчитает сумму), админ правит уже существующий (save).
    const current = cachedUser ?? (await v2.me());
    if (current?.role === 'admin') {
      await v2.orders.save(order);
    } else {
      await v2.orders.create(order);
    }
    return;
}

export async function updateOrderInFirebase(orderId: string, updates: Partial<Order>): Promise<void> {
  // У нашего сервера нет «дописать пару полей»: он принимает заказ целиком
    // (так надёжнее — сумму и права он пересчитывает сам). Поэтому берём
    // текущий заказ и отдаём его обратно с изменениями.
    const { order } = await v2.orders.get(orderId);
    await v2.orders.save({ ...order, ...updates } as Order);
    return;
}

/**
 * Handle Chat updates
 */
export async function sendChatMessageToFirebase(msg: ChatMessage): Promise<void> {
  // Кто отправитель и когда — ставит сервер; от нас только текст и, если
    // пишет админ, чей это диалог.
    await v2.chat.send(msg.message, msg.senderRole === 'admin' ? msg.userId : undefined);
    return;
}

export async function updateChatMessageInFirebase(msgId: string, updates: Partial<ChatMessage>): Promise<void> {
  // Единственное, что сайт правит в чужом сообщении, — «прочитано». На
    // сервере это отдельное действие и сразу на весь диалог.
    if (updates.readByClient) {
      await v2.chat.markRead();
      // Опрос приносит только новые сообщения, а «прочитано» меняет старые —
      // поэтому правим и накопленную копию, иначе значок вернётся.
      v2.chatCache.markRead(undefined, false);
    }
    if (updates.readByAdmin) {
      const dialogUserId = (updates as ChatMessage).userId;
      if (dialogUserId) {
        await v2.chat.markRead(dialogUserId);
        v2.chatCache.markRead(dialogUserId, true);
      }
    }
    return;
}

/**
 * Удаление переписки админом. Раньше сайт просто выбрасывал сообщения из
 * своего состояния: на сервере (и в Firestore) они оставались, и после
 * обновления страницы возвращались обратно вместе со значком непрочитанных.
 */
export async function deleteChatMessageInFirebase(msgId: string): Promise<void> {
  await v2.chat.remove(msgId);
    v2.chatCache.forget([msgId]);
    return;
}

/** Вся переписка с одним клиентом (аккаунт и заказы остаются). */
export async function clearChatHistoryInFirebase(dialogUserId: string, msgIds: string[]): Promise<void> {
  await v2.chat.clear(dialogUserId);
    v2.chatCache.forgetUser(dialogUserId);
    return;
}

/**
 * Клиентская форма "Есть пожелание или замечание?" в личном кабинете —
 * одноразовое сообщение, читает и отвечает на него админ (ответ уходит
 * не сюда, а обычным сообщением в chatMessages).
 */
export async function sendFeedbackToFirebase(feedback: Feedback): Promise<void> {
  await v2.feedback.send(feedback.message, {
      isBugReport: feedback.isBugReport,
      screenshotUrl: feedback.screenshotUrl,
    });
    return;
}

export async function deleteFeedbackFromFirebase(feedbackId: string): Promise<void> {
  await v2.feedback.remove(feedbackId);
    return;
}

/**
 * Handle Notifications
 */
export async function sendNotificationToFirebase(alert: Notification): Promise<void> {
  await v2.notifications.create({
      title: alert.title,
      body: alert.body,
      type: alert.type,
      userId: alert.userId,
    });
    return;
}

export async function updateNotificationInFirebase(alertId: string, updates: Partial<Notification>): Promise<void> {
  if (updates.read) await v2.notifications.markRead(alertId);
    return;
}

export async function deleteNotificationFromFirebase(alertId: string): Promise<void> {
  await v2.notifications.remove(alertId);
    return;
}

/**
 * Subscribe and keep UI state synced with Firestore in real-time
 */
/**
 * Учёт посещений сайта. Работает для АБСОЛЮТНО ВСЕХ посетителей —
 * не требует входа в аккаунт (правила Firestore разрешают анонимную запись
 * только в этот конкретный документ stats/visits).
 * Считает один визит за один сеанс браузера (sessionStorage), чтобы
 * переходы между страницами внутри сайта не задваивали счётчик.
 */
export async function trackSiteVisit(): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    const alreadyTracked = sessionStorage.getItem('sever18_visit_tracked');
    if (alreadyTracked) return;
    sessionStorage.setItem('sever18_visit_tracked', '1');

    await v2.visits.track();
      return;
  } catch (err) {
    // Тихо игнорируем — счётчик посещений не должен ломать загрузку сайта
    console.info('Site visit tracking skipped:', err);
  }
}

export function subscribeToFirebaseCollections(
  currentUser: User,
  onSync: (state: Partial<DatabaseState>) => void
): () => void {
  // Опрос вместо живой подписки. Удалённые записи приходят отдельным
    // списком: опрос «что нового» их не увидит — их в базе уже нет.
    return v2.subscribeByPolling(currentUser, (updates, deleted) => {
      onSync(applyDeletions(updates, deleted));
    });
}

/**
 * Initial Seeding for blank relational databases
 */
/**
 * Убирает из свежего списка то, что удалили на другом устройстве. Сервер
 * присылает такие записи отдельным списком номеров, потому что в самих
 * данных их уже нет.
 */
function applyDeletions(
  updates: Partial<DatabaseState>,
  deleted?: { orders?: string[]; chatMessages?: string[]; notifications?: string[] }
): Partial<DatabaseState> {
  if (!deleted) return updates;
  const out: Partial<DatabaseState> & { deletedIds?: unknown } = { ...updates };
  if (deleted.orders?.length && out.orders) {
    out.orders = out.orders.filter(o => !deleted.orders!.includes(o.id));
  }
  if (deleted.chatMessages?.length && out.chatMessages) {
    out.chatMessages = out.chatMessages.filter(c => !deleted.chatMessages!.includes(c.id));
  }
  if (deleted.notifications?.length && out.notifications) {
    out.notifications = out.notifications.filter(n => !deleted.notifications!.includes(n.id));
  }
  return out;
}

/**
 * Automatically sync updates to Firebase based on dirty checking
 */
export async function syncLocalUpdatesToFirebase(updates: Partial<DatabaseState>, currentDatabase: DatabaseState) {
  await syncLocalUpdatesToServer(updates, currentDatabase);
    return;
}

/**
 * То же самое, но на наш сервер: отправляем только то, что действительно
 * изменилось, каждую запись своим запросом. Сравнение с прежним состоянием
 * оставлено как было — иначе при каждом обновлении экрана мы переписывали бы
 * на сервере всё подряд.
 */
async function syncLocalUpdatesToServer(updates: Partial<DatabaseState>, currentDatabase: DatabaseState) {
  const changed = <T extends { id: string }>(list: T[] | undefined, before: T[]): T[] =>
    (list || []).filter(item => {
      const existing = before.find(x => x.id === item.id);
      return !existing || JSON.stringify(existing) !== JSON.stringify(item);
    });

  try {
    for (const u of changed(updates.users, currentDatabase.users)) {
      await v2.users.save(u);
    }
    for (const o of changed(updates.orders, currentDatabase.orders)) {
      await saveOrderToFirebase(o);
    }
    for (const c of changed(updates.chatMessages, currentDatabase.chatMessages)) {
      const existing = currentDatabase.chatMessages.find(x => x.id === c.id);
      if (existing) {
        // Уже отправленное сообщение сайт правит только ради «прочитано».
        await updateChatMessageInFirebase(c.id, c);
      } else {
        await sendChatMessageToFirebase(c);
      }
    }
    for (const n of changed(updates.notifications, currentDatabase.notifications)) {
      const existing = currentDatabase.notifications.find(x => x.id === n.id);
      if (existing) {
        await updateNotificationInFirebase(n.id, n);
      } else {
        await sendNotificationToFirebase(n);
      }
    }
    for (const s of changed(updates.services, currentDatabase.services || [])) {
      await v2.services.save(s);
    }
    for (const p of changed(updates.promos, currentDatabase.promos || [])) {
      await v2.promos.save(p);
    }
  } catch (err) {
    console.error('Не удалось сохранить изменения на сервере', err);
  }
}

/**
 * Подписывает браузер на push-уведомления и сохраняет подписку в профиле
 * пользователя — дальше Cloud Function сама шлёт push при смене статуса
 * заказа или новом сообщении в чате.
 */
export async function subscribeToPushNotifications(userId: string): Promise<void> {
  // Ключ у нас свой и новый, поэтому подписку на старый ключ надо сначала
    // отменить — иначе браузер вернёт прежнюю, и уведомления не дойдут.
    await v2.subscribeBrowserPush();
    return;
}

