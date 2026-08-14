/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { User, DatabaseState } from './types';
import {
  getInitialDatabase, saveDatabase,
  getCurrentUser, saveCurrentUser,
  playNotificationSound, showBrowserNotification
} from './utils';
import { LandingPage } from './components/LandingPage';

// Кабинет клиента и админ-панель — самый тяжёлый код приложения, но нужен
// только после входа. Ленивая загрузка держит их вне общего бандла, чтобы
// анонимные посетители лендинга не качали их зря. AuthScreen и
// PaymentReceiptScreen тоже не нужны на самом первом экране (лендинге),
// поэтому вынесены туда же.
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const AuthScreen = lazy(() => import('./components/AuthScreen').then(m => ({ default: m.AuthScreen })));
const PaymentReceiptScreen = lazy(() => import('./components/PaymentReceiptScreen').then(m => ({ default: m.PaymentReceiptScreen })));

function AppSectionLoader() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#02050f]">
      <span className="w-8 h-8 rounded-full border-2 border-indigo-300/40 border-t-indigo-500 animate-spin" />
    </div>
  );
}
import { FileText } from 'lucide-react';
import { auth, onAuthStateChanged, db, enableNetwork } from './firebase';
import {
  subscribeToFirebaseCollections,
  seedInitialDataIfRequired,
  syncLocalUpdatesToFirebase,
  deleteUserAccountWithFirebase,
  signOutUserWithFirebase,
  trackSiteVisit,
  signInAsGuest
} from './firebaseUtils';

// Заглушка "технические работы" на весь сайт. true = показывать её всем посетителям
// вместо обычного сайта. Поставь false и задеплой, когда работы закончены.
const MAINTENANCE_MODE = false;

export default function App() {
  // Маркетинговая главная страница — показывается гостям до формы входа
  const [showLanding, setShowLanding] = useState(true);

  // "Загрузить файл" на лендинге — вместо формы входа тихо выдаём гостевой
  // Firebase-пропуск (см. signInAsGuest) и сразу ведём на экран загрузки.
  const [guestSignInStatus, setGuestSignInStatus] = useState<'idle' | 'pending' | 'error'>('idle');

  // Возврат со страницы оплаты ЮKassa (?payment=success&order=ORD-...) —
  // показываем красивый чек вместо обычного кабинета.
  const [paymentReturnOrderId, setPaymentReturnOrderId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('payment') === 'success' ? params.get('order') : null;
  });
  useEffect(() => {
    if (paymentReturnOrderId) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [paymentReturnOrderId]);

  // Открытие сразу на нужной вкладке кабинета по ссылке вида /?open=orders —
  // используется PWA-ярлыками на иконке приложения (см. manifest.json
  // "shortcuts"). Валидируем значение против допустимых вкладок Dashboard,
  // чтобы мусорный/чужой query-параметр молча игнорировался, а не ломал вид.
  const ALLOWED_SHORTCUT_TABS = ['upload', 'orders', 'chat', 'profile', 'contacts', 'services'] as const;
  const [requestedTab] = useState<typeof ALLOWED_SHORTCUT_TABS[number] | undefined>(() => {
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    return (ALLOWED_SHORTCUT_TABS as readonly string[]).includes(open || '')
      ? (open as typeof ALLOWED_SHORTCUT_TABS[number])
      : undefined;
  });
  useEffect(() => {
    if (requestedTab) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [requestedTab]);

  // Учёт визита на сайт — срабатывает для КАЖДОГО посетителя,
  // независимо от того, вошёл ли он в аккаунт или зарегистрирован ли вообще
  useEffect(() => {
    trackSiteVisit();
  }, []);

  // Core user session state
  const [user, setUser] = useState<User | null>(null);
  
  // Storage database state (defaults to offline structure before Firebase sync)
  const [database, setDatabase] = useState<DatabaseState>(() => getInitialDatabase());

  // Стал ли database хоть раз реальным снимком с сервера — до этого момента
  // это просто локальный кэш из localStorage (может быть устаревшим), и
  // счётчики вроде бейджа непрочитанных уведомлений не должны на нём мигать.
  const [hasSyncedFromServer, setHasSyncedFromServer] = useState(false);

  // Restore and keep authentication session synced in real-time
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        saveCurrentUser(null);
      } else {
        // Run seed check when an authenticated user session is active
        seedInitialDataIfRequired();

        // Gracefully request notification permissions
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
      }
    });

    // Session recovery from storage
    const sessionUser = getCurrentUser();
    if (sessionUser) {
      setUser(sessionUser);
    }

    return () => unsubscribeAuth();
  }, []);

  // Sync collections in real-time if a session is alive
  useEffect(() => {
    if (!user) return;
    setHasSyncedFromServer(false);

    // Первый snapshot после подписки сравнивается с устаревшим localStorage-
    // кэшем в `prev`, а не с реальным предыдущим состоянием — если в кэше не
    // было какого-то сообщения/статуса (другое устройство, очищенный кэш),
    // диффинг ошибочно считал его «новым» и уведомление всплывало заново при
    // каждом входе. Пропускаем диффинг на первом snapshot этой подписки.
    let isFirstSyncCallback = true;

    const unsubscribeCollection = subscribeToFirebaseCollections(user, (syncedUpdates) => {
      setDatabase((prev) => {
        // 1. Check for incoming new chat messages
        if (!isFirstSyncCallback && syncedUpdates.chatMessages && prev.chatMessages && prev.chatMessages.length > 0) {
          const newMsgs = syncedUpdates.chatMessages.filter(
            m => !prev.chatMessages.some(pm => pm.id === m.id)
          );
          if (newMsgs.length > 0) {
            const foreignMsgs = newMsgs.filter(m => m.senderId !== user.id);
            if (foreignMsgs.length > 0) {
              playNotificationSound('message');
              const finalM = foreignMsgs[foreignMsgs.length - 1];
              showBrowserNotification(
                `Новое сообщение от ${finalM.senderName}`,
                finalM.message.startsWith('[IMAGE]:') ? '📷 Отправлено изображение' : finalM.message
              );
            }
          }
        }

        // 2. Check for order status readiness updates
        if (!isFirstSyncCallback && syncedUpdates.orders && prev.orders && prev.orders.length > 0) {
          syncedUpdates.orders.forEach(updatedOrder => {
            const prevOrder = prev.orders.find(po => po.id === updatedOrder.id);
            if (prevOrder && prevOrder.status !== updatedOrder.status) {
              if (updatedOrder.status === 'ready') {
                playNotificationSound('ready');
                showBrowserNotification(
                  `Заказ #${updatedOrder.id.substring(0, 7)} готов!`,
                  `Ваш заказ готов к выдаче на Северном шоссе, 18!`
                );
              } else if (updatedOrder.status === 'approved') {
                playNotificationSound('ready');
                showBrowserNotification(
                  `Заказ #${updatedOrder.id.substring(0, 7)} проверен!`,
                  `Ваш заказ проверен оператором и отправлен в производство.`
                );
              }
            }
          });
        }

        const nextState = {
          ...prev,
          ...syncedUpdates
        };
        saveDatabase(nextState);
        return nextState;
      });

      isFirstSyncCallback = false;

      // The `user` state (passed as a prop to Dashboard/AdminPanel) is separate
      // from `database.users` — without this, live Firestore changes to the
      // current user's own doc (e.g. admin gifting a promo code) never reach
      // the components that actually read `user.promoCode` etc., since they'd
      // stay frozen at whatever `user` was at login until a manual refresh.
      // auth.currentUser check guards against a snapshot callback that was
      // already in flight resolving AFTER sign-out — without it, a stale
      // update here could re-set the logged-out user right back, making
      // "Выйти" appear to require a second click to actually stick.
      if (syncedUpdates.users && auth.currentUser) {
        const refreshedSelf = syncedUpdates.users.find(u => u.id === user.id);
        if (refreshedSelf) {
          setUser(refreshedSelf);
          saveCurrentUser(refreshedSelf);
        }
      }

      setHasSyncedFromServer(true);
    });

    // Явно подталкиваем Firestore переподключиться, когда вкладка снова
    // становится видимой (была свёрнута/в фоне долгое время — браузер мог
    // придушить сетевую активность) или когда у устройства вернулся интернет
    // после разрыва — не полагаемся только на то, что SDK сам вовремя это
    // заметит. Дополняет reconnect-логику внутри onSnapshot-обёртки в
    // firebaseUtils.ts (та чинит уже случившийся обрыв, эта — упреждает его).
    const nudgeReconnect = () => {
      enableNetwork(db).catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') nudgeReconnect();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', nudgeReconnect);

    return () => {
      unsubscribeCollection();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', nudgeReconnect);
    };
    // Зависим только от id/role, а не от всего объекта user — user
    // пересоздаётся при каждом обновлении профиля (например, пинг
    // "онлайн"-статуса каждые несколько секунд), а раньше эффект зависел
    // от [user] целиком, из-за чего подписка на Firestore постоянно рвалась
    // и пересоздавалась, и live-обновления (например, смена статуса заказа
    // админом) могли не долетать до открытой вкладки клиента.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  // Update central state and replicate updates to Firebase Firestore
  const handleUpdateDatabase = (updates: Partial<DatabaseState>) => {
    // 1. Instantly write to Local state for immediate responsiveness (optimistic UI render)
    const updatedDb: DatabaseState = {
      ...database,
      ...updates
    } as DatabaseState;

    setDatabase(updatedDb);
    saveDatabase(updatedDb);

    if (user && updates.users) {
      const refreshedUser = updates.users.find(u => u.id === user.id);
      if (refreshedUser) {
        setUser(refreshedUser);
        saveCurrentUser(refreshedUser);
      }
    }

    // 2. Cascade changes in background directly to Firestore
    syncLocalUpdatesToFirebase(updates, database);
  };

  // Helper to register new accounts
  const handleRegisterUser = (newUser: User) => {
    const updatedUsers = [...database.users, newUser];
    handleUpdateDatabase({ users: updatedUsers });
  };

  // Complete self data deletion from true Firebase Firestore and signout
  const handleDeleteAccount = async (userId: string) => {
    try {
      await deleteUserAccountWithFirebase(userId);
      setUser(null);
      saveCurrentUser(null);
    } catch (err) {
      console.error('Failed to self delete account:', err);
      throw err;
    }
  };

  const handleAuthSuccess = (authenticatedUser: User) => {
    setUser(authenticatedUser);
    saveCurrentUser(authenticatedUser);
  };

  const handleUploadClick = async () => {
    setGuestSignInStatus('pending');
    try {
      const guestUser = await signInAsGuest();
      handleAuthSuccess(guestUser);
      setShowLanding(false);
      setGuestSignInStatus('idle');
    } catch (err) {
      console.error('Guest sign-in failed:', err);
      setGuestSignInStatus('error');
    }
  };

  const handleLogout = async () => {
    try {
      await signOutUserWithFirebase();
    } catch (e) {
      console.error(e);
    }
    setUser(null);
    saveCurrentUser(null);
  };

  // Временная заглушка "технические работы" — чтобы вернуть сайт как есть,
  // просто поставь MAINTENANCE_MODE обратно в false.
  if (MAINTENANCE_MODE) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#02050f] text-white text-center p-6">
        <div>
          <FileText className="w-10 h-10 text-indigo-400 mx-auto mb-4" />
          <h1 className="text-2xl font-black mb-3">Ведутся технические работы</h1>
          <p className="text-white/70">Спасибо за понимание — скоро вернёмся.</p>
        </div>
      </div>
    );
  }

  return (
    <div id="print-shop-root-container" className="font-sans antialiased text-slate-800 dark:text-slate-100">
      <div className="min-h-dvh">
        {paymentReturnOrderId ? (
          <Suspense fallback={<AppSectionLoader />}>
            <PaymentReceiptScreen
              orderId={paymentReturnOrderId}
              onClose={() => setPaymentReturnOrderId(null)}
            />
          </Suspense>
        ) : guestSignInStatus === 'pending' ? (
          <div className="min-h-dvh flex items-center justify-center bg-[#02050f]">
            <span className="w-8 h-8 rounded-full border-2 border-indigo-300/40 border-t-indigo-500 animate-spin" />
          </div>
        ) : guestSignInStatus === 'error' ? (
          <div className="min-h-dvh flex items-center justify-center bg-[#02050f] text-white text-center p-6">
            <div>
              <p className="text-lg font-bold mb-4">Не получилось загрузить, попробуйте ещё раз</p>
              <button
                onClick={handleUploadClick}
                className="px-6 py-3 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold cursor-pointer"
              >
                Попробовать ещё раз
              </button>
            </div>
          </div>
        ) : !user && showLanding ? (
          <LandingPage onEnter={() => setShowLanding(false)} onUploadClick={handleUploadClick} />
        ) : !user ? (
          <Suspense fallback={<AppSectionLoader />}>
            <AuthScreen
              onAuthSuccess={handleAuthSuccess}
              allUsers={database.users}
              onRegisterUser={handleRegisterUser}
            />
          </Suspense>
        ) : user.role === 'admin' ? (
          <Suspense fallback={<AppSectionLoader />}>
            <AdminPanel
              adminUser={user}
              onLogout={handleLogout}
              database={database}
              onUpdateDatabase={handleUpdateDatabase}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<AppSectionLoader />}>
            <Dashboard
              user={user}
              onLogout={handleLogout}
              database={database}
              onUpdateDatabase={handleUpdateDatabase}
              onDeleteAccount={handleDeleteAccount}
              hasSyncedFromServer={hasSyncedFromServer}
              initialTab={requestedTab}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
