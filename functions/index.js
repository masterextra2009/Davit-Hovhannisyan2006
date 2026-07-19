/**
 * Push-уведомления: статус заказа + новые сообщения в чате.
 * Присылаются, только когда получатель НЕ активен на сайте прямо сейчас
 * (иначе он и так увидит изменение живьём на экране).
 */
const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const webpush = require('web-push');

const FIRESTORE_DATABASE_ID = 'ai-studio-c87ec184-5aa1-432c-bb2a-801c9b1876b2';
const VAPID_PUBLIC_KEY = 'BAWT1sZ2a1ES2-anphGlydEvZNAA4xM6ty-g-_I9um9VWexVqAlbNZPYKMh8sMKIAgW6WA2iJP1T09wF4mtpo1M';
// Пользователь считается "онлайн" максимум это время после последнего heartbeat
// (сайт шлёт heartbeat каждые 45с) — запас на случай задержки сети.
const ONLINE_FRESHNESS_MS = 2 * 60 * 1000;

const vapidPrivateKey = defineSecret('VAPID_PRIVATE_KEY');

const app = initializeApp();
const db = getFirestore(app, FIRESTORE_DATABASE_ID);

const STATUS_LABELS = {
  pending: 'принят в обработку',
  approved: 'подтверждён',
  printing: 'печатается',
  ready: 'готов к выдаче',
  printed: 'напечатан',
};

function isRecentlyOnline(userData) {
  if (!userData || userData.isOnline !== true) return false;
  const lastActiveAt = userData.lastActiveAt ? new Date(userData.lastActiveAt).getTime() : 0;
  return Date.now() - lastActiveAt < ONLINE_FRESHNESS_MS;
}

// Отправляет push конкретному пользователю по userId — но только если он
// сейчас не находится активно на сайте. Протухшую подписку (410/404) чистит.
async function pushToUser(userId, title, body) {
  if (!userId) return;
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) return;
  const userData = userSnap.data();

  if (isRecentlyOnline(userData)) return;

  const subscription = userData.pushSubscription;
  if (!subscription) return;

  webpush.setVapidDetails('mailto:photo-sever@yandex.ru', VAPID_PUBLIC_KEY, vapidPrivateKey.value());

  try {
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, url: '/' }));
  } catch (err) {
    console.error('Push send failed for user', userId, err.statusCode, err.body);
    if (err.statusCode === 404 || err.statusCode === 410) {
      await db.collection('users').doc(userId).update({ pushSubscription: FieldValue.delete() });
    }
  }
}

exports.notifyOrderStatusChange = onDocumentUpdated(
  { document: 'orders/{orderId}', database: FIRESTORE_DATABASE_ID, secrets: [vapidPrivateKey] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    const statusChanged = before.status !== after.status;
    const paymentJustPaid = before.paymentStatus !== after.paymentStatus && after.paymentStatus === 'paid';
    if (!statusChanged && !paymentJustPaid) return;

    let title = 'Фото-Север';
    let body;
    if (paymentJustPaid) {
      title = 'Оплата получена!';
      body = `Заказ ${event.params.orderId} оплачен и передан в печать.`;
    } else {
      title = 'Статус заказа изменился';
      body = `Заказ ${event.params.orderId}: ${STATUS_LABELS[after.status] || after.status}`;
    }

    await pushToUser(after.userId, title, body);
  }
);

exports.notifyNewChatMessage = onDocumentCreated(
  { document: 'chatMessages/{messageId}', database: FIRESTORE_DATABASE_ID, secrets: [vapidPrivateKey] },
  async (event) => {
    const msg = event.data.data();
    if (!msg) return;

    const preview = (msg.message || '').replace(/^\[STICKER\]:.*/, '🖼 Стикер').slice(0, 120);

    if (msg.senderRole === 'client') {
      // Сообщение от клиента — уведомляем всех админов
      const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
      await Promise.all(
        adminsSnap.docs.map((d) => pushToUser(d.id, `Новое сообщение от ${msg.senderName || 'клиента'}`, preview))
      );
    } else {
      // Сообщение от админа — уведомляем клиента, которому принадлежит чат
      await pushToUser(msg.userId, 'Ответ от Фото-Север', preview);
    }
  }
);
