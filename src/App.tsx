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
import { AuthScreen } from './components/AuthScreen';
import { LandingPage } from './components/LandingPage';
import { PaymentReceiptScreen } from './components/PaymentReceiptScreen';
import { motion, AnimatePresence } from 'motion/react';

// Кабинет клиента и админ-панель — самый тяжёлый код приложения, но нужен
// только после входа. Ленивая загрузка держит их вне общего бандла, чтобы
// анонимные посетители лендинга не качали их зря.
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));

function AppSectionLoader() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#02050f]">
      <span className="w-8 h-8 rounded-full border-2 border-indigo-300/40 border-t-indigo-500 animate-spin" />
    </div>
  );
}
import { Sparkles, FileText } from 'lucide-react';
import { auth, onAuthStateChanged, db, enableNetwork } from './firebase';
import {
  subscribeToFirebaseCollections,
  seedInitialDataIfRequired,
  syncLocalUpdatesToFirebase,
  deleteUserAccountWithFirebase,
  signOutUserWithFirebase,
  trackSiteVisit
} from './firebaseUtils';

// Заглушка "технические работы" на весь сайт. true = показывать её всем посетителям
// вместо обычного сайта. Поставь false и задеплой, когда работы закончены.
const MAINTENANCE_MODE = false;

export default function App() {
  // Premium splash state for high-end feel
  const [showSplash, setShowSplash] = useState(true);

  // Маркетинговая главная страница — показывается гостям до формы входа
  const [showLanding, setShowLanding] = useState(true);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

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
      <AnimatePresence mode="wait">
        {showSplash ? (
          <motion.div
            key="splash-screen"
            initial={{ opacity: 1 }}
            exit={{ 
              opacity: 0, 
              y: -25, 
              transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } 
            }}
            className="fixed inset-0 z-50 flex flex-col justify-between p-8 bg-[#02050f] text-white overflow-hidden select-none"
          >
            {/* Ambient luxury rotating glow clouds in corners */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px] animate-glow-slow-1 pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[150px] animate-glow-slow-2 pointer-events-none" />
            
            {/* Accent gold sparkles for a premium feeling */}
            <div className="absolute top-[15%] right-[15%] opacity-30 animate-pulse">
              <Sparkles className="w-6 h-6 text-indigo-400 rotate-12" />
            </div>

            {/* Subtle top branding */}
            <div className="flex justify-between items-center max-w-5xl mx-auto w-full opacity-50">
              <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 font-bold">СЕВЕРНАЯ КРУПНОФОРМАТНАЯ ПЕЧАТЬ</span>
              <span className="text-[9px] font-mono tracking-wider text-slate-500">PRINT CENTRAL</span>
            </div>

            {/* Glowing active shutter mechanism */}
            <div className="flex flex-col items-center justify-center max-w-md mx-auto w-full text-center relative z-10">
              <div className="relative mb-7 p-1">
                {/* Outermost rotating dashboard orbit ring */}
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                  className="absolute inset-0 rounded-full border border-dashed border-indigo-400/25"
                />
                
                {/* Second background aura glow */}
                <motion.div 
                  animate={{ scale: [1, 1.06, 1], opacity: [0.4, 0.6, 0.4] }}
                  transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
                  className="absolute -inset-1 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-300 opacity-20 blur-xl"
                />

                {/* Main luxurious plate with copy document symbol */}
                <motion.div 
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                  className="relative w-24 h-24 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center shadow-2xl shadow-indigo-500/10"
                >
                  <div className="absolute inset-1.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-850 flex items-center justify-center">
                    <motion.div
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <FileText className="w-9 h-9 text-indigo-400" />
                    </motion.div>
                  </div>
                  
                  {/* Decorative rotating laser segment */}
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3.8, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border border-transparent border-t-indigo-400 w-full h-full"
                    style={{ borderWidth: "2px" }}
                  />
                </motion.div>
              </div>

              {/* Title & subtitle block */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
                <h1 className="splash-title-white text-4xl font-black font-display tracking-tight text-white flex items-center justify-center gap-1.5 selection:bg-indigo-500">
                  Фото<span className="shimmer-text-luxury">-Север</span>
                </h1>
                
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-indigo-300 font-bold">
                  студия премиальной печати &middot; hq
                </p>
              </motion.div>

              {/* Laser beam printer style bar */}
              <div className="w-56 h-[2px] bg-slate-900 rounded-full mt-11 overflow-hidden relative border-t border-slate-950">
                <motion.div 
                  initial={{ left: "-100%" }}
                  animate={{ left: "100%" }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                  className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
                />
              </div>
            </div>

            {/* Technical luxurious metadata in footer */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.65 }}
              transition={{ delay: 0.75, duration: 0.9 }}
              className="flex justify-between items-center max-w-5xl mx-auto w-full text-[9px] text-slate-500 font-mono tracking-wider uppercase font-bold"
            >
              <div className="text-left leading-relaxed">
                <span className="block text-indigo-400">PRINT ENGINE ACTIVE // LATENCY 1.2ms</span>
                <span className="block mt-0.5 text-slate-550">CLOUD FIREBASE CLUSTER CONNECTED</span>
              </div>
              <div className="text-right leading-relaxed">
                <span className="block text-indigo-400">ИНТЕЛЛЕКТУАЛЬНАЯ КАЛИБРОВКА...</span>
                <span className="block mt-0.5 text-slate-550">&copy; СЕВЕРНОЕ ШОССЕ, 18</span>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="main-app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-dvh"
          >
            {paymentReturnOrderId ? (
              <PaymentReceiptScreen
                orderId={paymentReturnOrderId}
                onClose={() => setPaymentReturnOrderId(null)}
              />
            ) : !user && showLanding ? (
              <LandingPage onEnter={() => setShowLanding(false)} />
            ) : !user ? (
              <AuthScreen
                onAuthSuccess={handleAuthSuccess}
                allUsers={database.users}
                onRegisterUser={handleRegisterUser}
              />
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
                />
              </Suspense>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
