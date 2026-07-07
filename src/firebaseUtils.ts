/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  auth, 
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
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
  increment
} from './firebase';
import { User, Order, ChatMessage, Notification, DatabaseState } from './types';

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
export async function registerUserWithFirebase(email: string, password: string,fullName: string, phone: string, role: 'client' | 'admin' = 'client'): Promise<User> {
  const trimmedEmail = email.trim();
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    const fbUser = userCredential.user;

    // Update the Auth display name
    await updateProfile(fbUser, { displayName: fullName });

    const normalizedEmail = trimmedEmail.toLowerCase();
    const isExplicitAdmin = fbUser.uid === 'pRIp0NUg6lSR2ujVhywFkQ5TIW22' || 
                            fbUser.uid === 'YbYV6lLNlnVeJ0SKSr3ufzNzNx23' ||
                            normalizedEmail === 'admin@print.ru' || 
                            normalizedEmail === 'photo-sever@yandex.ru';

    const newUser: User = {
      id: fbUser.uid,
      email: trimmedEmail,
      fullName: fullName.trim(),
      phone: phone.trim(),
      role: isExplicitAdmin ? 'admin' : role,
      createdAt: new Date().toISOString(),
      avatarUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 999999)}?w=100&auto=format&fit=crop&q=80`,
    };

    // Write profile document in Firestore
    const userDocRef = doc(db, 'users', fbUser.uid);
    try {
      await setDoc(userDocRef, newUser);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${fbUser.uid}`);
    }

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
                              trimmedEmail.toLowerCase() === 'admin@print.ru' || 
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
      const isInitialAdmin = trimmedEmail.toLowerCase().includes('admin') || 
                             trimmedEmail.toLowerCase() === 'photo-sever@yandex.ru' ||
                             fbUser.uid === 'pRIp0NUg6lSR2ujVhywFkQ5TIW22' ||
                             fbUser.uid === 'YbYV6lLNlnVeJ0SKSr3ufzNzNx23';
      const recoveredUser: User = {
        id: fbUser.uid,
        email: fbUser.email || trimmedEmail,
        fullName: fbUser.displayName || trimmedEmail.split('@')[0],
        role: isInitialAdmin ? 'admin' : 'client',
        createdAt: new Date().toISOString(),
        phone: '',
        avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80`
      };
      
      try {
        await setDoc(userDocRef, recoveredUser);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `users/${fbUser.uid}`);
      }
      return recoveredUser;
    }
  } catch (error: any) {
    // Log standard user login rejections (mismatched password or not signed up) as warning/info
    console.warn('Firebase Auth sign in attempt info:', error?.message || error);
    throw error;
  }
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
  
  // 1. Delete Firestore user document
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `users/${userId}`);
  }

  // 2. Query and delete user orders
  try {
    const ordersSnap = await getDocs(query(collection(db, 'orders'), where('userId', '==', userId)));
    for (const d of ordersSnap.docs) {
      await deleteDoc(doc(db, 'orders', d.id));
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, 'orders');
  }

  // 3. Query and delete user chats
  try {
    const chatsSnap = await getDocs(query(collection(db, 'chatMessages'), where('userId', '==', userId)));
    for (const d of chatsSnap.docs) {
      await deleteDoc(doc(db, 'chatMessages', d.id));
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, 'chatMessages');
  }

  // 4. Query and delete user notifications
  try {
    const alertsSnap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', userId)));
    for (const d of alertsSnap.docs) {
      await deleteDoc(doc(db, 'notifications', d.id));
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, 'notifications');
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

    const today = new Date().toISOString().split('T')[0];
    const statsRef = doc(db, 'stats', 'visits');
    await setDoc(statsRef, {
      total: increment(1),
      [`history.${today}`]: increment(1),
    }, { merge: true });
  } catch (err) {
    // Тихо игнорируем — счётчик посещений не должен ломать загрузку сайта
    console.info('Site visit tracking skipped:', err);
  }
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
    const unsub = onSnapshot(qUsers, (snap) => {
      const users: User[] = [];
      snap.forEach(doc => users.push(doc.data() as User));
      onSync({ users });
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });
    unsubscribes.push(unsub);
  } else {
    // Client only listens to their own profile changes
    const unsub = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
      if (docSnap.exists()) {
        onSync({ users: [docSnap.data() as User] });
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${currentUser.id}`);
    });
    unsubscribes.push(unsub);
  }

  // 2. Listen to Orders
  const colOrders = collection(db, 'orders');
  const qOrders = isAdminUser 
    ? colOrders 
    : query(colOrders, where('userId', '==', currentUser.id));

  const unsubOrders = onSnapshot(qOrders, (snap) => {
    const orders: Order[] = [];
    snap.forEach(doc => orders.push(doc.data() as Order));
    onSync({ orders: orders.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()) });
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, 'orders');
  });
  unsubscribes.push(unsubOrders);

  // 3. Listen to Chat Messages
  const colChats = collection(db, 'chatMessages');
  const qChats = isAdminUser
    ? colChats
    : query(colChats, where('userId', '==', currentUser.id));

  const unsubChats = onSnapshot(qChats, (snap) => {
    const chatMessages: ChatMessage[] = [];
    snap.forEach(doc => chatMessages.push(doc.data() as ChatMessage));
    onSync({ chatMessages: chatMessages.sort((b, a) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, 'chatMessages');
  });
  unsubscribes.push(unsubChats);

  // 4. Listen to Notifications
  const colAlerts = collection(db, 'notifications');
  const qAlerts = isAdminUser
    ? colAlerts
    : query(colAlerts, where('userId', '==', currentUser.id));

  const unsubAlerts = onSnapshot(qAlerts, (snap) => {
    const notifications: Notification[] = [];
    snap.forEach(doc => notifications.push(doc.data() as Notification));
    onSync({ notifications: notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) });
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, 'notifications');
  });
  unsubscribes.push(unsubAlerts);

  // 5. Listen to Site Visit Stats (admin only — public writes, admin-only reads)
  if (isAdminUser) {
    const unsubStats = onSnapshot(doc(db, 'stats', 'visits'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        const historyMap: Record<string, number> = data.history || {};
        const siteVisitsHistory = Object.keys(historyMap)
          .sort()
          .map(date => ({ date, count: historyMap[date] }));
        onSync({ siteVisits: data.total || 0, siteVisitsHistory });
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'stats/visits');
    });
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
  const isAdmin = email === 'admin@print.ru' || currentUser.uid === 'u-admin-seed' || currentUser.uid === 'u1_admin_seed' || currentUser.uid === 'pRIp0NUg6lSR2ujVhywFkQ5TIW22' || currentUser.uid === 'YbYV6lLNlnVeJ0SKSr3ufzNzNx23';
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
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
        },
        {
          id: 'u2_ivan_seed',
          email: 'ivan@mail.ru',
          fullName: 'Иван Ivanov',
          role: 'client',
          createdAt: '2026-06-01T12:00:00Z',
          phone: '+7 (911) 222-33-44',
          avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
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

