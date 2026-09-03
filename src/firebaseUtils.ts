/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLocalDateKey, trackAnalyticsEvent } from './utils';
import {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signInAnonymously,
  linkWithCredential,
  EmailAuthProvider,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  increment,
  runTransaction
} from './firebase';
import type { User as FirebaseAuthUser } from 'firebase/auth';
import { User, Order, ChatMessage, Notification, Service, Feedback, DatabaseState } from './types';

// Автоматический приветственный промокод для тех, кто регистрируется в
// период акции 22.07.2026–02.08.2026 (обе даты включительно). После конца
// периода — как обычно, никаких автоматических промокодов при регистрации
// (ручной подарок промокода из админки, см. handleGiftPromoSubmit в
// AdminPanel.tsx, продолжает работать всегда).
const WELCOME_PROMO_START = new Date('2026-07-22T00:00:00');
const WELCOME_PROMO_END = new Date('2026-08-03T00:00:00'); // граница — начало 03.08, т.е. весь день 02.08 ещё считается
function getWelcomePromoFields(): Partial<User> {
  const now = new Date();
  if (now < WELCOME_PROMO_START || now >= WELCOME_PROMO_END) return {};
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  return {
    promoCode: 'ПРИВЕТСТВЕННЫЙ',
    promoDiscount: 15,
    promoGiftedSeen: false,
    promoExpiresAt: expires.toISOString(),
  };
}

// Реферальная программа: у каждого клиента есть свой код (первые 6 символов
// его Firebase UID — уникальность уже гарантирована самим UID, отдельная
// проверка не нужна), которым он делится с друзьями. Награда пригласившему
// выдаётся не здесь, а автоматически в AdminPanel.tsx после первого
// оплаченного заказа приглашённого (см. useEffect там) — так работает и для
// заказов "оплата при получении", отмеченных вручную, и для оплаты через
// ЮKassa, не завязываясь на конкретный путь оплаты.
export function generateReferralCode(uid: string): string {
  return uid.slice(0, 6).toUpperCase();
}

// Обратный индекс код->userId в отдельной коллекции (см. firestore.rules) —
// query по users.referralCode невозможен: правила запрещают клиенту читать
// чужие профили, а Firestore не разрешает query, для которого нельзя
// гарантировать доступ к каждому результату по правилам /users/{userId}.
async function resolveReferralFields(referralCodeInput?: string): Promise<Partial<User>> {
  if (!referralCodeInput || !referralCodeInput.trim()) return {};
  const code = referralCodeInput.trim().toUpperCase();
  try {
    const snap = await getDoc(doc(db, 'referralCodes', code));
    if (!snap.exists()) return {};
    const referrerId = (snap.data() as { userId: string }).userId;
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    return {
      referredBy: referrerId,
      promoCode: 'ДРУГ10',
      promoDiscount: 10,
      promoGiftedSeen: false,
      promoExpiresAt: expires.toISOString(),
    };
  } catch {
    return {};
  }
}

// Регистрирует свой код в обратном индексе (см. выше) — вызывается при
// генерации кода на всех путях регистрации. Тихо глотает ошибку: это не
// критично для самой регистрации, а без индекса просто не сработает
// применение кода у тех, кто попробует его ввести (не аварийный случай).
export async function registerReferralCode(code: string, userId: string): Promise<void> {
  try {
    await setDoc(doc(db, 'referralCodes', code), { userId });
  } catch (e) {
    console.warn('Failed to register referral code:', e);
  }
}

// На нестабильной (особенно мобильной) сети запрос может зависнуть без ошибки
// и без ответа — обрываем его по таймауту, чтобы UI не застревал навсегда.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// Standardized operation type matching rules
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Global firestore error logger as requested
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Register a user via Firebase Auth and create their Firestore document profile
 */
export async function registerUserWithFirebase(email: string, password: string,fullName: string, phone: string, role: 'client' | 'admin' = 'client', referralCodeInput?: string): Promise<User> {
  const trimmedEmail = email.trim();
  try {
    // Если в этой же вкладке уже есть анонимная гостевая сессия ("Загрузить
    // файл" без регистрации, см. signInAsGuest) — апгрейдим её на месте
    // (linkWithCredential), а не создаём отдельный новый аккаунт. Firebase
    // при этом СОХРАНЯЕТ uid, значит все заказы гостя (userId == uid)
    // остаются на месте и сразу видны в новом аккаунте — переносить их
    // отдельно не нужно.
    const wasAnonymous = auth.currentUser?.isAnonymous === true;
    let fbUser;
    if (wasAnonymous) {
      try {
        const credential = EmailAuthProvider.credential(trimmedEmail, password);
        const linkedCredential = await linkWithCredential(auth.currentUser!, credential);
        fbUser = linkedCredential.user;
      } catch (err: any) {
        if (err?.code === 'auth/credential-already-in-use' || err?.code === 'auth/email-already-in-use') {
          throw new Error('Этот email уже зарегистрирован — войдите в существующий аккаунт вместо регистрации нового.');
        }
        throw err;
      }
    } else {
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      fbUser = userCredential.user;
    }

    // Update the Auth display name
    await updateProfile(fbUser, { displayName: fullName });

    const normalizedEmail = trimmedEmail.toLowerCase();
    const isExplicitAdmin = fbUser.uid === 'pRIp0NUg6lSR2ujVhywFkQ5TIW22' ||
                            fbUser.uid === 'YbYV6lLNlnVeJ0SKSr3ufzNzNx23' ||
                            normalizedEmail === 'photo-sever@yandex.ru';

    const referralFields = isExplicitAdmin ? {} : await resolveReferralFields(referralCodeInput);

    const newUser: User = {
      id: fbUser.uid,
      email: trimmedEmail,
      fullName: fullName.trim(),
      phone: phone.trim(),
      role: isExplicitAdmin ? 'admin' : role,
      createdAt: new Date().toISOString(),
      referralCode: generateReferralCode(fbUser.uid),
      ...(isExplicitAdmin ? {} : (Object.keys(referralFields).length ? referralFields : getWelcomePromoFields())),
    };

    // Write profile document in Firestore
    const userDocRef = doc(db, 'users', fbUser.uid);
    try {
      await setDoc(userDocRef, newUser);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${fbUser.uid}`);
    }
    await registerReferralCode(newUser.referralCode!, fbUser.uid);

    trackAnalyticsEvent('registration');
    return newUser;
  } catch (error) {
    console.error('Firebase Auth registration error:', error);
    throw error;
  }
}

/**
 * Sign in a user via Firebase Auth and load their Firestore document profile
 */
export async function signInUserWithFirebase(email: string, password: string): Promise<User> {
  const trimmedEmail = email.trim();
  try {
    const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
    const fbUser = userCredential.user;

    // Load their profile from users collection
    const userDocRef = doc(db, 'users', fbUser.uid);
    let userDoc;
    try {
      userDoc = await getDoc(userDocRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `users/${fbUser.uid}`);
    }

    if (userDoc && userDoc.exists()) {
      const userData = userDoc.data() as User;
      const isExplicitAdmin = fbUser.uid === 'pRIp0NUg6lSR2ujVhywFkQ5TIW22' ||
                              fbUser.uid === 'YbYV6lLNlnVeJ0SKSr3ufzNzNx23' ||
                              trimmedEmail.toLowerCase() === 'photo-sever@yandex.ru';
      if (isExplicitAdmin && userData.role !== 'admin') {
        userData.role = 'admin';
        try {
          await setDoc(userDocRef, userData, { merge: true });
        } catch (e) {
          console.warn('Failed to auto-upgrade to admin role in firestore:', e);
        }
      }
      return userData;
    } else {
      // Automatic profile repair if auth exists but firestore is empty
      // We seed them as client by default (except special pattern)
      const isInitialAdmin = trimmedEmail.toLowerCase() === 'photo-sever@yandex.ru' ||
                             fbUser.uid === 'pRIp0NUg6lSR2ujVhywFkQ5TIW22' ||
                             fbUser.uid === 'YbYV6lLNlnVeJ0SKSr3ufzNzNx23';
      const recoveredUser: User = {
        id: fbUser.uid,
        email: fbUser.email || trimmedEmail,
        fullName: fbUser.displayName || trimmedEmail.split('@')[0],
        role: isInitialAdmin ? 'admin' : 'client',
        createdAt: new Date().toISOString(),
        phone: '',
          referralCode: generateReferralCode(fbUser.uid),
      };

      try {
        await setDoc(userDocRef, recoveredUser);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `users/${fbUser.uid}`);
      }
      await registerReferralCode(recoveredUser.referralCode!, fbUser.uid);
      return recoveredUser;
    }
  } catch (error: any) {
    // Log standard user login rejections (mismatched password or not signed up) as warning/info
    console.warn('Firebase Auth sign in attempt info:', error?.message || error);
    throw error;
  }
}

/**
 * Создаёт/обновляет профиль в Firestore на основе Google-аккаунта Firebase.
 */
async function upsertGoogleUserProfile(fbUser: FirebaseAuthUser): Promise<User> {
  const userDocRef = doc(db, 'users', fbUser.uid);
  let userDoc;
  try {
    userDoc = await getDoc(userDocRef);
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `users/${fbUser.uid}`);
  }

  const isExplicitAdmin = fbUser.uid === 'pRIp0NUg6lSR2ujVhywFkQ5TIW22' ||
                          fbUser.uid === 'YbYV6lLNlnVeJ0SKSr3ufzNzNx23' ||
                          (fbUser.email || '').toLowerCase() === 'photo-sever@yandex.ru';

  if (userDoc && userDoc.exists()) {
    const userData = userDoc.data() as User;
    if (isExplicitAdmin && userData.role !== 'admin') {
      userData.role = 'admin';
    }
    if (fbUser.photoURL && userData.avatarUrl !== fbUser.photoURL) {
      userData.avatarUrl = fbUser.photoURL;
    }
    try {
      await setDoc(userDocRef, userData, { merge: true });
    } catch (e) {
      console.warn('Failed to sync Google profile to firestore:', e);
    }
    return userData;
  }

  // First time this Google account signs in — create their profile
  const newUser: User = {
    id: fbUser.uid,
    email: fbUser.email || '',
    fullName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Пользователь Google'),
    phone: '',
    role: isExplicitAdmin ? 'admin' : 'client',
    createdAt: new Date().toISOString(),
    avatarUrl: fbUser.photoURL || undefined,
    isSocial: true,
    referralCode: generateReferralCode(fbUser.uid),
    ...(isExplicitAdmin ? {} : getWelcomePromoFields()),
  };

  try {
    await setDoc(userDocRef, newUser);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${fbUser.uid}`);
  }
  await registerReferralCode(newUser.referralCode!, fbUser.uid);
  trackAnalyticsEvent('registration');
  return newUser;
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
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return upsertGoogleUserProfile(result.user);
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
  const userCredential = await signInAnonymously(auth);
  const fbUser = userCredential.user;

  const newUser: User = {
    id: fbUser.uid,
    email: '',
    fullName: '',
    phone: '',
    role: 'client',
    createdAt: new Date().toISOString(),
    isGuest: true,
    referralCode: generateReferralCode(fbUser.uid),
  };

  const userDocRef = doc(db, 'users', fbUser.uid);
  try {
    await setDoc(userDocRef, newUser);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${fbUser.uid}`);
  }

  return newUser;
}

/**
 * Данные, которые присылает виджет "Log in with Telegram" в колбэк onauth.
 */
export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Sign in via the Telegram Login Widget: verifies the signed payload on our
 * server (telegram-verify.php), mints a Firebase custom token there, then
 * completes the real Firebase sign-in with it.
 */
export async function signInWithTelegram(telegramData: TelegramAuthData): Promise<User> {
  const res = await withTimeout(
    fetch('https://sever-18.ru/api/telegram-verify.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramData),
    }),
    15000
  );
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(data.error || 'Не удалось подтвердить вход через Telegram');
  }

  const userCredential = await signInWithCustomToken(auth, data.token);
  const fbUser = userCredential.user;

  const userDocRef = doc(db, 'users', fbUser.uid);
  let userDoc;
  try {
    userDoc = await getDoc(userDocRef);
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `users/${fbUser.uid}`);
  }

  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ').trim() || data.username || 'Пользователь Telegram';

  if (userDoc && userDoc.exists()) {
    const userData = userDoc.data() as User;
    userData.telegramChatId = String(telegramData.id);
    userData.telegramUsername = data.username || userData.telegramUsername;
    if (data.photoUrl && userData.avatarUrl !== data.photoUrl) {
      userData.avatarUrl = data.photoUrl;
    }
    try {
      await setDoc(userDocRef, userData, { merge: true });
    } catch (e) {
      console.warn('Failed to sync Telegram profile to firestore:', e);
    }
    return userData;
  }

  const newUser: User = {
    id: fbUser.uid,
    email: '',
    fullName,
    phone: '',
    role: 'client',
    createdAt: new Date().toISOString(),
    avatarUrl: data.photoUrl || undefined,
    isSocial: true,
    telegramChatId: String(telegramData.id),
    telegramUsername: data.username,
    referralCode: generateReferralCode(fbUser.uid),
  };

  try {
    await setDoc(userDocRef, newUser);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${fbUser.uid}`);
  }
  await registerReferralCode(newUser.referralCode!, fbUser.uid);
  return newUser;
}

/**
 * Log out user from Firebase Auth
 */
export async function signOutUserWithFirebase(): Promise<void> {
  await signOut(auth);
}

/**
 * Deletes a single order document from Firestore
 */
export async function deleteOrderFromFirebase(orderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `orders/${orderId}`);
  }
}

/**
 * Deletes user profile and related resources from Firestore
 */
export async function deleteUserAccountWithFirebase(userId: string): Promise<void> {
  const user = auth.currentUser;

  // handleFirestoreError() ниже перебрасывает исключение дальше — раньше
  // это было нормально для обычных сохранений, но здесь, при самоудалении
  // профиля, одна заблокированная запись (например, уже оплаченный заказ —
  // правила Firestore намеренно не дают клиенту его удалить) обрывала весь
  // процесс до шага 5, и сам аккаунт (Firebase Auth) вообще не удалялся —
  // клиент получал ошибку и оставался "подвисшим" с частично стёртым
  // профилем. Такие документы просто пропускаем и продолжаем дальше.
  const safeDelete = async (path: string, id: string) => {
    try {
      await deleteDoc(doc(db, path, id));
    } catch (e) {
      console.warn(`deleteUserAccountWithFirebase: не удалось удалить ${path}/${id}`, e);
    }
  };

  // 1. Delete Firestore user document
  await safeDelete('users', userId);

  // 2. Query and delete user orders
  try {
    const ordersSnap = await getDocs(query(collection(db, 'orders'), where('userId', '==', userId)));
    for (const d of ordersSnap.docs) {
      await safeDelete('orders', d.id);
    }
  } catch (e) {
    console.warn('deleteUserAccountWithFirebase: не удалось получить список orders', e);
  }

  // 3. Query and delete user chats
  try {
    const chatsSnap = await getDocs(query(collection(db, 'chatMessages'), where('userId', '==', userId)));
    for (const d of chatsSnap.docs) {
      await safeDelete('chatMessages', d.id);
    }
  } catch (e) {
    console.warn('deleteUserAccountWithFirebase: не удалось получить список chatMessages', e);
  }

  // 4. Query and delete user notifications
  try {
    const alertsSnap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', userId)));
    for (const d of alertsSnap.docs) {
      await safeDelete('notifications', d.id);
    }
  } catch (e) {
    console.warn('deleteUserAccountWithFirebase: не удалось получить список notifications', e);
  }

  // 5. Finally delete Auth session if matching
  if (user && user.uid === userId) {
    try {
      await user.delete();
    } catch (e) {
      console.warn('Could not delete auth user directly (reauthentication required), signing out instead.', e);
      await signOut(auth);
    }
  }
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
  const counterRef = doc(db, 'counters', 'orders');
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const current = snap.exists() && typeof snap.data().next === 'number' ? snap.data().next : 1000;
    transaction.set(counterRef, { next: current + 1 }, { merge: true });
    return current;
  });
}

/**
 * Handle Order updates
 */
export async function saveOrderToFirebase(order: Order): Promise<void> {
  const ref = doc(db, 'orders', order.id);
  try {
    await setDoc(ref, order);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `orders/${order.id}`);
  }
}

export async function updateOrderInFirebase(orderId: string, updates: Partial<Order>): Promise<void> {
  const ref = doc(db, 'orders', orderId);
  try {
    await updateDoc(ref, updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `orders/${orderId}`);
  }
}

/**
 * Handle Chat updates
 */
export async function sendChatMessageToFirebase(msg: ChatMessage): Promise<void> {
  const ref = doc(db, 'chatMessages', msg.id);
  try {
    await setDoc(ref, msg);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `chatMessages/${msg.id}`);
  }
}

export async function updateChatMessageInFirebase(msgId: string, updates: Partial<ChatMessage>): Promise<void> {
  const ref = doc(db, 'chatMessages', msgId);
  try {
    await updateDoc(ref, updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `chatMessages/${msgId}`);
  }
}

/**
 * Клиентская форма "Есть пожелание или замечание?" в личном кабинете —
 * одноразовое сообщение, читает и отвечает на него админ (ответ уходит
 * не сюда, а обычным сообщением в chatMessages).
 */
export async function sendFeedbackToFirebase(feedback: Feedback): Promise<void> {
  const ref = doc(db, 'feedback', feedback.id);
  try {
    await setDoc(ref, feedback);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `feedback/${feedback.id}`);
  }
}

export async function deleteFeedbackFromFirebase(feedbackId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'feedback', feedbackId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `feedback/${feedbackId}`);
  }
}

/**
 * Handle Notifications
 */
export async function sendNotificationToFirebase(alert: Notification): Promise<void> {
  const ref = doc(db, 'notifications', alert.id);
  try {
    await setDoc(ref, alert);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `notifications/${alert.id}`);
  }
}

export async function updateNotificationInFirebase(alertId: string, updates: Partial<Notification>): Promise<void> {
  const ref = doc(db, 'notifications', alertId);
  try {
    await updateDoc(ref, updates);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `notifications/${alertId}`);
  }
}

export async function deleteNotificationFromFirebase(alertId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', alertId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `notifications/${alertId}`);
  }
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

    const today = getLocalDateKey();
    const statsRef = doc(db, 'stats', 'visits');
    // ВАЖНО: setDoc(..., {merge:true}) НЕ разворачивает ключ-строку с точкой
    // ('history.2026-07-19') в путь до вложенного поля — в отличие от
    // updateDoc(), он пишет её как один буквальный ключ верхнего уровня.
    // Из-за этого запись годами тихо падала с permission-denied (в правилах
    // разрешены только поля total/history, а получалось total + "history.…").
    // Настоящий вложенный merge — через вложенный объект, а не через
    // строку-путь с точкой.
    await setDoc(statsRef, {
      total: increment(1),
      history: { [today]: increment(1) },
    }, { merge: true });
  } catch (err) {
    // Тихо игнорируем — счётчик посещений не должен ломать загрузку сайта
    console.info('Site visit tracking skipped:', err);
  }
}

/**
 * onSnapshot умирает НАВСЕГДА при первой же ошибке (сетевой сбой, временный
 * permission-denied и т.п.) — Firestore SDK сам не переподписывается для
 * большинства типов ошибок. До этой обёртки любой единичный сбой означал,
 * что вкладка переставала получать live-обновления (новые заказы, статусы,
 * сообщения чата) до ручной перезагрузки страницы — именно это и было
 * первопричиной жалобы "надо постоянно обновлять, чтобы что-то увидеть".
 * Оборачиваем каждую подписку: при ошибке логируем и через паузу тихо
 * пересоздаём слушатель заново, вместо того чтобы просто "умирать".
 */
function resilientOnSnapshot<T>(
  target: any,
  onNext: (snap: T) => void,
  path: string
): () => void {
  let stopped = false;
  let unsub: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const start = () => {
    if (stopped) return;
    unsub = onSnapshot(target as any, onNext as any, (err) => {
      console.error(`Firestore live-listener error on "${path}", reconnecting in 4s:`, err);
      unsub = null;
      if (!stopped) {
        retryTimer = setTimeout(start, 4000);
      }
    });
  };
  start();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (unsub) unsub();
  };
}

export function subscribeToFirebaseCollections(
  currentUser: User,
  onSync: (state: Partial<DatabaseState>) => void
): () => void {
  const unsubscribes: (() => void)[] = [];

  const isAdminUser = currentUser.role === 'admin';

  // 1. Listen to users
  if (isAdminUser) {
    const qUsers = collection(db, 'users');
    const unsub = resilientOnSnapshot(qUsers, (snap: any) => {
      const users: User[] = [];
      snap.forEach((doc: any) => users.push(doc.data() as User));
      onSync({ users });
    }, 'users');
    unsubscribes.push(unsub);
  } else {
    // Client only listens to their own profile changes
    const unsub = resilientOnSnapshot(doc(db, 'users', currentUser.id), (docSnap: any) => {
      if (docSnap.exists()) {
        onSync({ users: [docSnap.data() as User] });
      }
    }, `users/${currentUser.id}`);
    unsubscribes.push(unsub);
  }

  // 2. Listen to Orders
  const colOrders = collection(db, 'orders');
  const qOrders = isAdminUser
    ? colOrders
    : query(colOrders, where('userId', '==', currentUser.id));

  const unsubOrders = resilientOnSnapshot(qOrders, (snap: any) => {
    const orders: Order[] = [];
    snap.forEach((doc: any) => orders.push(doc.data() as Order));
    onSync({ orders: orders.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()) });
  }, 'orders');
  unsubscribes.push(unsubOrders);

  // 3. Listen to Chat Messages
  const colChats = collection(db, 'chatMessages');
  const qChats = isAdminUser
    ? colChats
    : query(colChats, where('userId', '==', currentUser.id));

  const unsubChats = resilientOnSnapshot(qChats, (snap: any) => {
    const chatMessages: ChatMessage[] = [];
    snap.forEach((doc: any) => chatMessages.push(doc.data() as ChatMessage));
    onSync({ chatMessages: chatMessages.sort((b, a) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
  }, 'chatMessages');
  unsubscribes.push(unsubChats);

  // 4. Listen to Notifications
  const colAlerts = collection(db, 'notifications');
  const qAlerts = isAdminUser
    ? colAlerts
    : query(colAlerts, where('userId', '==', currentUser.id));

  const unsubAlerts = resilientOnSnapshot(qAlerts, (snap: any) => {
    const notifications: Notification[] = [];
    snap.forEach((doc: any) => notifications.push(doc.data() as Notification));
    onSync({ notifications: notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
  }, 'notifications');
  unsubscribes.push(unsubAlerts);

  // 5. Listen to Services Showcase (visible to any signed-in user, editable by admin only)
  const unsubServices = resilientOnSnapshot(collection(db, 'services'), (snap: any) => {
    const services: Service[] = [];
    snap.forEach((doc: any) => services.push(doc.data() as Service));
    onSync({ services: services.sort((a, b) => a.order - b.order) });
  }, 'services');
  unsubscribes.push(unsubServices);

  // 6. Listen to client Feedback (admin only — clients can create but not read)
  if (isAdminUser) {
    const unsubFeedback = resilientOnSnapshot(collection(db, 'feedback'), (snap: any) => {
      const feedback: Feedback[] = [];
      snap.forEach((doc: any) => feedback.push(doc.data() as Feedback));
      onSync({ feedback: feedback.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
    }, 'feedback');
    unsubscribes.push(unsubFeedback);
  }

  // 7. Listen to Site Visit Stats (admin only — public writes, admin-only reads)
  if (isAdminUser) {
    const unsubStats = resilientOnSnapshot(doc(db, 'stats', 'visits'), (docSnap: any) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        const historyMap: Record<string, number> = data.history || {};
        const siteVisitsHistory = Object.keys(historyMap)
          .sort()
          .map(date => ({ date, count: historyMap[date] }));
        onSync({ siteVisits: data.total || 0, siteVisitsHistory });
      }
    }, 'stats/visits');
    unsubscribes.push(unsubStats);
  }

  // Return a master cleanup unsubscriber
  return () => {
    unsubscribes.forEach(un => un());
  };
}

/**
 * Initial Seeding for blank relational databases
 */
export async function seedInitialDataIfRequired(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.log('Skipping Firestore seeding: no authenticated session.');
    return;
  }

  const email = currentUser.email?.toLowerCase();
  const isAdmin = email === 'photo-sever@yandex.ru' || currentUser.uid === 'u-admin-seed' || currentUser.uid === 'u1_admin_seed' || currentUser.uid === 'pRIp0NUg6lSR2ujVhywFkQ5TIW22' || currentUser.uid === 'YbYV6lLNlnVeJ0SKSr3ufzNzNx23';
  if (!isAdmin) {
    console.log('Skipping Firestore seeding: user is not an administrator.');
    return;
  }

  // Check if users collection is empty
  try {
    const snap = await getDocs(collection(db, 'users'));
    if (snap.empty) {
      console.log('Firestore is empty. Seeding initial records...');

      // 1. Initial users
      const SEED_USERS: User[] = [
        {
          id: 'u1_admin_seed',
          email: 'admin@print.ru',
          fullName: 'Дмитрий (Администратор)',
          role: 'admin',
          createdAt: '2026-05-01T10:00:00Z',
          phone: '+7 (900) 123-45-67',
        },
        {
          id: 'u2_ivan_seed',
          email: 'ivan@mail.ru',
          fullName: 'Иван Ivanov',
          role: 'client',
          createdAt: '2026-06-01T12:00:00Z',
          phone: '+7 (911) 222-33-44',
        }
      ];

      for (const u of SEED_USERS) {
        await setDoc(doc(db, 'users', u.id), u);
      }

      // 2. Initial orders
      const SEED_ORDERS: Order[] = [
        {
          id: 'ORD-1001',
          userId: 'u2_ivan_seed',
          userName: 'Иван Ivanov',
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
              size: 15420100,
              type: 'application/zip',
              uploadedAt: '2026-06-05T14:15:00Z',
              formatGroup: 'archive',
            }
          ],
          completedAt: '2026-06-05T16:00:00Z',
        }
      ];

      for (const o of SEED_ORDERS) {
        await setDoc(doc(db, 'orders', o.id), o);
      }

      // 3. Initial Chat
      const SEED_CHATS: ChatMessage[] = [
        {
          id: 'c1',
          userId: 'u2_ivan_seed',
          senderId: 'u2_ivan_seed',
          senderRole: 'client',
          senderName: 'Иван Ivanov',
          message: 'Привет! Загрузил архив с отчетом. Подскажите, успеете распечатать к 16:00?',
          timestamp: '2026-06-05T14:22:00Z',
          readByAdmin: true,
          readByClient: true,
        }
      ];

      for (const c of SEED_CHATS) {
        await setDoc(doc(db, 'chatMessages', c.id), c);
      }
      
      console.log('Seeding completed successfully!');
    }
  } catch (err) {
    console.error('Failed to seed default data', err);
  }
}

/**
 * Automatically sync updates to Firebase based on dirty checking
 */
export async function syncLocalUpdatesToFirebase(updates: Partial<DatabaseState>, currentDatabase: DatabaseState) {
  try {
    if (updates.users) {
      for (const u of updates.users) {
        const existing = currentDatabase.users.find(x => x.id === u.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(u)) {
          await setDoc(doc(db, 'users', u.id), u);
        }
      }
    }
    if (updates.orders) {
      for (const o of updates.orders) {
        const existing = currentDatabase.orders.find(x => x.id === o.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(o)) {
          await saveOrderToFirebase(o);
        }
      }
    }
    if (updates.chatMessages) {
      for (const c of updates.chatMessages) {
        const existing = currentDatabase.chatMessages.find(x => x.id === c.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(c)) {
          await sendChatMessageToFirebase(c);
        }
      }
    }
    if (updates.notifications) {
      for (const n of updates.notifications) {
        const existing = currentDatabase.notifications.find(x => x.id === n.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(n)) {
          await sendNotificationToFirebase(n);
        }
      }
    }
  } catch (err) {
    console.error('Failed syncing state changes to Firestore', err);
  }
}

// Публичный VAPID-ключ (не секрет, безопасно хранить в клиентском коде) —
// в паре с приватным ключом на сервере (Cloud Functions) для отправки push.
const VAPID_PUBLIC_KEY = 'BAWT1sZ2a1ES2-anphGlydEvZNAA4xM6ty-g-_I9um9VWexVqAlbNZPYKMh8sMKIAgW6WA2iJP1T09wF4mtpo1M';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Подписывает браузер на push-уведомления и сохраняет подписку в профиле
 * пользователя — дальше Cloud Function сама шлёт push при смене статуса
 * заказа или новом сообщении в чате.
 */
export async function subscribeToPushNotifications(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push-уведомления не поддерживаются этим браузером');
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await setDoc(doc(db, 'users', userId), { pushSubscription: subscription.toJSON() }, { merge: true });
}

