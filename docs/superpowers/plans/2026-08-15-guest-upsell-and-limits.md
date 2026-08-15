# Guest Upsell Prompt + Guest Feature Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a guest places an order, show one dismiss-once-per-session prompt to create a real account (VIP progress, referral bonuses, personal promo codes). Separately, gate 4 specific features (AI document-photo check, voice input, multi-file batch upload, referral link) behind the same "Доступно после регистрации" prompt for guests.

**Architecture:** One new reusable component, `GuestUpsellModal`, renders a title/body picked from a small copy dictionary keyed by a `reason` string, plus the same email+password form/logic `handleGuestRegister` already uses in Личный кабинет → Безопасность (`registerUserWithFirebase`, anonymous-session upgrade via `linkWithCredential`). `Dashboard.tsx` gets one new piece of state, `guestUpsellReason: GuestUpsellReason | null`, that drives which (if any) instance of the modal is mounted; all 5 trigger points (1 for the post-order prompt, 4 for the feature gates) just call `setGuestUpsellReason(...)` instead of opening whatever they used to open. "Guest" means `user.isGuest === true` throughout, matching the field's existing meaning everywhere else in this file (per the approved spec, this also means the gates lift after a guest's first order, same as the existing Безопасность panel — intentionally left as-is).

**Tech Stack:** Vite, React 19, TypeScript, `motion/react` (AnimatePresence), `lucide-react`, Firebase Auth via `registerUserWithFirebase` (already exists, unchanged). No new dependencies.

## Global Constraints

- Гость = `user.isGuest === true`, everywhere, matching existing usage in this file. Do not invent a different "real guest" check.
- This repo has no test runner (`npm run lint` = `tsc --noEmit` only). Verification = `npm run lint` after every code change, plus a manual `npm run build && npm run preview` browser walkthrough at the end of each task, same as `docs/superpowers/plans/2026-08-14-guest-checkout.md`.
- No new npm packages — `motion/react`, `lucide-react`, Firebase Auth helpers are already installed and imported elsewhere in `Dashboard.tsx`.
- All user-facing copy is exactly what's in `docs/superpowers/specs/2026-08-15-guest-upsell-and-limits-design.md` — draft wording, but use it verbatim, don't paraphrase.
- The existing guest-registration panel in Личный кабинет → Безопасность (`Dashboard.tsx` ~6243-6276, `handleGuestRegister`, `guestReg*` state) is untouched — `GuestUpsellModal` is a separate, independent component with its own local form state.
- Nothing is deployed (`git push` to `main`) without the user's explicit go-ahead — the GitHub Actions workflow on `main` deploys straight to the live site.

---

### Task 1: `GuestUpsellModal` component

**Files:**
- Create: `src/components/GuestUpsellModal.tsx`

**Interfaces:**
- Consumes: `User` type from `../types`; `registerUserWithFirebase` from `../firebaseUtils`; `AnimatedTitle` from `./AnimatedTitle`; `motion` from `motion/react`; `X`, `Sparkles` from `lucide-react`.
- Produces: `export type GuestUpsellReason = 'post_order' | 'doc_check' | 'voice' | 'multi_file' | 'referral';` and `export function GuestUpsellModal({ reason, user, onClose, onSuccess }: { reason: GuestUpsellReason; user: User; onClose: () => void; onSuccess: (linkedUser: User) => void }): JSX.Element` — used by every later task. Renders one `motion.div` (no internal `AnimatePresence` — the caller wraps the conditional render in `AnimatePresence`, exactly like the existing `payingOrder` modal in `Dashboard.tsx`).

- [ ] **Step 1: Create the file**

Create `src/components/GuestUpsellModal.tsx`:

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import { User } from '../types';
import { registerUserWithFirebase } from '../firebaseUtils';
import { AnimatedTitle } from './AnimatedTitle';

export type GuestUpsellReason = 'post_order' | 'doc_check' | 'voice' | 'multi_file' | 'referral';

const UPSELL_COPY: Record<GuestUpsellReason, { title: string; body: string }> = {
  post_order: {
    title: 'Заказ принят!',
    body: 'Заведите аккаунт за 10 секунд — копите скидки к VIP-статусу с приоритетной печатью, получайте бонусы за друзей и персональные промокоды.',
  },
  doc_check: {
    title: 'Доступно после регистрации',
    body: 'Проверка фото через ИИ доступна только с аккаунтом — это платная функция (Claude API). Заведите аккаунт за 10 секунд, чтобы её включить.',
  },
  voice: {
    title: 'Доступно после регистрации',
    body: 'Голосовой ввод доступен только с аккаунтом. Заведите аккаунт за 10 секунд, чтобы говорить с ассистентом голосом.',
  },
  multi_file: {
    title: 'Доступно после регистрации',
    body: 'Загрузка нескольких файлов одной пачкой доступна только с аккаунтом. Этот файл мы уже приняли — остальные добавьте по одному, или заведите аккаунт за 10 секунд, чтобы грузить сразу пачкой.',
  },
  referral: {
    title: 'Доступно после регистрации',
    body: 'Своя реферальная ссылка доступна только с аккаунтом — иначе награду за друга будет некуда начислить. Заведите аккаунт за 10 секунд, чтобы получить свою ссылку.',
  },
};

interface GuestUpsellModalProps {
  reason: GuestUpsellReason;
  user: User;
  onClose: () => void;
  onSuccess: (linkedUser: User) => void;
}

export function GuestUpsellModal({ reason, user, onClose, onSuccess }: GuestUpsellModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const copy = UPSELL_COPY[reason];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const linkedUser = await registerUserWithFirebase(
        email,
        password,
        user.fullName || 'Клиент',
        user.phone || '',
        'client'
      );
      onSuccess(linkedUser);
    } catch (err: any) {
      setError(err?.message || 'Не удалось завести аккаунт. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[210] overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
      exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
      onClick={onClose}
    >
      <motion.div
        className="glass-window w-full max-w-md overflow-hidden text-left transform transition-all relative"
        data-css-anim-off
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.82, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 18, mass: 1 } }}
        exit={{ opacity: 0, scale: 0.9, y: 6, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
      >
        <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/30">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">Личный кабинет</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold text-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <h3 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wide">
              <AnimatedTitle key={reason}>{copy.title}</AnimatedTitle>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              {copy.body}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Электронная почта"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Пароль (минимум 6 символов)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            {error && <p className="text-[11px] text-rose-500 font-bold">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-black cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Создаём аккаунт…' : 'Завести аккаунт'}
            </button>
          </form>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-[11px] font-bold uppercase tracking-wider cursor-pointer"
          >
            Не сейчас
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors (new, self-contained file; nothing imports it yet so nothing else can break).

- [ ] **Step 3: Commit**

```bash
git add src/components/GuestUpsellModal.tsx
git commit -m "Add reusable GuestUpsellModal component"
```

---

### Task 2: Wire the modal into Dashboard + Задача А (post-order prompt)

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `GuestUpsellModal`, `GuestUpsellReason` from `./GuestUpsellModal` (Task 1). `useRef`, `AnimatePresence` (both already imported in this file).
- Produces: `guestUpsellReason` state, `setGuestUpsellReason` setter, `handleCloseGuestUpsell`, `handleGuestUpsellSuccess`, `handleClosePayingOrder` — all consumed by Tasks 3-6 (the 4 feature gates just call `setGuestUpsellReason('doc_check' | 'voice' | 'multi_file' | 'referral')`, nothing else from this task).

- [ ] **Step 1: Import the new component**

In `src/components/Dashboard.tsx`, add this import near the other component imports (right after `import { AiPriceCard } from './AiPriceCard';`):

```tsx
import { GuestUpsellModal, GuestUpsellReason } from './GuestUpsellModal';
```

- [ ] **Step 2: Add state + ref**

Find (around line 1679):

```tsx
  // Payment popup state
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
```

Change to:

```tsx
  // Payment popup state
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  // Гостевое предложение регистрации (после заказа) + 4 точки-ограничения
  // для гостей (см. GuestUpsellModal) — одно состояние на все 5 мест показа.
  const [guestUpsellReason, setGuestUpsellReason] = useState<GuestUpsellReason | null>(null);
  // user.isGuest переключается на false в том же вызове handlePlaceOrder,
  // где создаётся заказ (см. Task 3 ниже) — к моменту, когда гость закроет
  // модалку payingOrder (отдельный, более поздний клик), user.isGuest уже
  // не отражает, кем он был на момент заказа. Ref держит этот факт между
  // вызовами.
  const wasGuestAtLastOrderRef = useRef(false);
```

- [ ] **Step 3: Capture "was guest at order time" + add the two new handlers**

Find (`handlePlaceOrder`'s opening lines):

```tsx
  const handlePlaceOrder = async (e: React.FormEvent, onReceipt: boolean = false) => {
    e.preventDefault();
    if (!isWorkingHours()) {
```

Change to:

```tsx
  const handlePlaceOrder = async (e: React.FormEvent, onReceipt: boolean = false) => {
    e.preventDefault();
    // Захватываем ДО того, как этот же вызов ниже (см. updatedUsers) поставит
    // isGuest: false — иначе к моменту показа предложения регистрации уже
    // поздно проверять user.isGuest.
    const wasGuestAtOrder = !!user.isGuest;
    wasGuestAtLastOrderRef.current = wasGuestAtOrder;
    if (!isWorkingHours()) {
```

Then find (the end of `handleGuestRegister`, right before `handlePlaceOrder` begins):

```tsx
      setGuestRegError(err?.message || 'Не удалось завести аккаунт. Попробуйте ещё раз.');
    } finally {
      setGuestRegLoading(false);
    }
  };

  // Build the order from uploaded files
  const handlePlaceOrder = async (e: React.FormEvent, onReceipt: boolean = false) => {
```

Change to (inserting three new handlers between the two functions):

```tsx
      setGuestRegError(err?.message || 'Не удалось завести аккаунт. Попробуйте ещё раз.');
    } finally {
      setGuestRegLoading(false);
    }
  };

  // Общая модалка предложения регистрации (после заказа + 4 ограниченные
  // функции, см. GuestUpsellModal) — три общих обработчика, переиспользуются
  // всеми 5 точками показа.
  const handleCloseGuestUpsell = () => {
    if (guestUpsellReason === 'post_order') {
      // Только "после заказа" — разовое предложение, не повторяем в этой
      // вкладке/сессии. Остальные 4 — сообщение о конкретном ограничении,
      // уместно показать заново при следующей попытке.
      sessionStorage.setItem('sever18_guest_upsell_dismissed', '1');
    }
    setGuestUpsellReason(null);
  };

  const handleGuestUpsellSuccess = (linkedUser: User) => {
    onUpdateDatabase({ users: database.users.map(u => (u.id === user.id ? linkedUser : u)) });
    setGuestUpsellReason(null);
  };

  const handleClosePayingOrder = () => {
    setPayingOrder(null);
    if (wasGuestAtLastOrderRef.current && !sessionStorage.getItem('sever18_guest_upsell_dismissed')) {
      setGuestUpsellReason('post_order');
    }
  };

  // Build the order from uploaded files
  const handlePlaceOrder = async (e: React.FormEvent, onReceipt: boolean = false) => {
```

(The last two lines reproduce `handlePlaceOrder`'s declaration unchanged — this edit only inserts the three new handlers above it. Its body was already changed by the previous edit in this step, which touched only the lines after `e.preventDefault();` and is unaffected by this one.)

- [ ] **Step 4: Trigger the prompt after the on-receipt "Заказ принят!" overlay closes**

Find:

```tsx
        setActiveTab('orders');
        setMobileHome(false);
        setOrderAcceptPhase('success');
        setTimeout(() => setOrderAcceptPhase('idle'), 1400);
        playPlaceOrderSound();
      } catch (err) {
        console.error('On-receipt order error:', err);
```

Change to:

```tsx
        setActiveTab('orders');
        setMobileHome(false);
        setOrderAcceptPhase('success');
        setTimeout(() => {
          setOrderAcceptPhase('idle');
          if (wasGuestAtOrder && !sessionStorage.getItem('sever18_guest_upsell_dismissed')) {
            setGuestUpsellReason('post_order');
          }
        }, 1400);
        playPlaceOrderSound();
      } catch (err) {
        console.error('On-receipt order error:', err);
```

- [ ] **Step 5: Trigger the prompt when the ЮKassa-unavailable confirmation modal closes**

There are exactly two buttons that close the `payingOrder` modal. First one (header X, around line 8270-8275):

```tsx
              <button
                onClick={() => setPayingOrder(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold text-lg"
              >
                &times;
              </button>
```

Change to:

```tsx
              <button
                onClick={handleClosePayingOrder}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold text-lg"
              >
                &times;
              </button>
```

Second one ("Вернуться назад", around line 8316-8322):

```tsx
              <button
                type="button"
                onClick={() => setPayingOrder(null)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Вернуться назад</span>
              </button>
```

Change to:

```tsx
              <button
                type="button"
                onClick={handleClosePayingOrder}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Вернуться назад</span>
              </button>
```

- [ ] **Step 6: Render the modal**

Find (the end of the `payingOrder` modal's `AnimatePresence` block):

```tsx
        </motion.div>
      )}</AnimatePresence>

      {/* CUSTOM SELF DELETE CONFIRMATION MODAL */}
```

Change to:

```tsx
        </motion.div>
      )}</AnimatePresence>

      {/* Гостевое предложение регистрации — после заказа, или по клику на
          одну из 4 ограниченных функций (см. GuestUpsellModal). */}
      <AnimatePresence>{guestUpsellReason && (
        <GuestUpsellModal
          key="guestUpsellModal"
          reason={guestUpsellReason}
          user={user}
          onClose={handleCloseGuestUpsell}
          onSuccess={handleGuestUpsellSuccess}
        />
      )}</AnimatePresence>

      {/* CUSTOM SELF DELETE CONFIRMATION MODAL */}
```

- [ ] **Step 7: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Manual browser check**

Run: `npm run build` then `npm run preview`.

1. On the landing page, click "Загрузить файл" (guest flow), upload any file, go to "Шаг 2. Оформление", fill in name+phone, click **«💵 Оплата при получении»**.
   Expected: "Заказ принят!" briefly shows, then the new modal appears with the title "Заказ принят!" and the VIP/referral/promo-code text. Click the email/password fields — confirm they work, submit with a throwaway email/password.
   Expected: modal closes, no errors in the console.
2. Repeat the guest flow (new incognito window), this time click **«Оформить и оплатить онлайн»**, and while the request runs, block the request to `payment-create.php` (DevTools → Network → right-click the request → Block request URL, then retry) so it falls into the "ЮKassa недоступна" branch.
   Expected: the order-confirmation modal (with order number/amount) appears; close it (either X or "Вернуться назад") — the upsell modal appears right after, not layered on top of the confirmation.
3. In that same tab, trigger the upsell modal again (place another guest order), click "Не сейчас"/X, then place a third guest order in the same tab.
   Expected: the modal does **not** reappear for the third order (sessionStorage flag holds for the tab).
4. Log in as a real (non-guest) account and place an order.
   Expected: the upsell modal never appears.

- [ ] **Step 9: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "Show post-order account signup prompt to guests"
```

---

### Task 3: Задача Б #1 — gate AI document-photo check

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `guestUpsellReason`/`setGuestUpsellReason` (Task 2).

- [ ] **Step 1: Gate the trigger button**

Find (bottom mobile nav, around line 4008-4014):

```tsx
          <button
            onClick={() => setShowDocCheckModal(true)}
            className="flex flex-col items-center cursor-pointer justify-self-center active:scale-90 transition-transform"
          >
            <GlassIcon icon={GlassDocCheckRefIcon} glow="capsule-glow-green" size={44} colored />
          </button>
```

Change to:

```tsx
          <button
            onClick={() => (user.isGuest ? setGuestUpsellReason('doc_check') : setShowDocCheckModal(true))}
            className="flex flex-col items-center cursor-pointer justify-self-center active:scale-90 transition-transform"
          >
            <GlassIcon icon={GlassDocCheckRefIcon} glow="capsule-glow-green" size={44} colored />
          </button>
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual browser check**

Run: `npm run build` then `npm run preview`. Open DevTools' device toolbar (or narrow the window below 768px — this nav is `md:hidden`, mobile-only) so the bottom dock is visible, go to "Главная".

1. As a guest (fresh "Загрузить файл" session, before placing any order), tap the doc-check icon (green capsule glow, left of the dock).
   Expected: the upsell modal opens with the "Проверка фото через ИИ доступна только с аккаунтом..." text — not the real doc-check modal.
2. Log in as a real account, tap the same icon.
   Expected: the real "Проверка фото на документы" modal opens as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "Gate AI document-photo check behind guest signup prompt"
```

---

### Task 4: Задача Б #2 — gate voice input (both buttons)

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `guestUpsellReason`/`setGuestUpsellReason` (Task 2).

- [ ] **Step 1: Gate the AI-chat mic button (desktop-reachable)**

Find (around line 9142-9152):

```tsx
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
```

Change to:

```tsx
            <form onSubmit={handleSendAiChatMessage} className="p-4 border-t border-white/10 flex gap-2 shrink-0">
              {speechRecognitionSupported && (
                <button
                  type="button"
                  onClick={() => (user.isGuest ? setGuestUpsellReason('voice') : handleOpenVoiceOverlay())}
                  title="Голосовой вопрос"
                  aria-label="Голосовой вопрос"
                  className="shrink-0 p-3 rounded-xl transition flex items-center justify-center border bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-850"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
```

- [ ] **Step 2: Gate the mobile central dock button**

Find (around line 4048-4058):

```tsx
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
```

Change to:

```tsx
        <button
          onClick={() => {
            // Центральная кнопка дока — только голосовой оверлей, без текстового
            // чата за ним (по явной просьбе клиента 2026-07-18: "чат нам не
            // нужен, только в центре экрана наш ИИ"). Закрыл оверлей — вернулся
            // туда, где был (Главная/вкладка), а не в текстовый чат.
            if (user.isGuest) { setGuestUpsellReason('voice'); return; }
            handleOpenVoiceOverlay();
          }}
          className="disc cursor-pointer"
          style={{ left: '50%', top: 24 }}
        >
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual browser check**

Run: `npm run build` then `npm run preview`.

1. As a guest, open the AI-chat screen (desktop viewport is fine), click the mic button next to the chat input.
   Expected: upsell modal opens with the voice-input text, no fullscreen voice overlay.
2. Narrow the viewport below 768px, go to "Главная", tap the central dock button.
   Expected: same upsell modal, not the voice overlay.
3. Log in as a real account, repeat both clicks.
   Expected: the real fullscreen voice overlay opens both times, as before.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "Gate voice input behind guest signup prompt"
```

---

### Task 5: Задача Б #3 — cap guest file uploads to one per action

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `guestUpsellReason`/`setGuestUpsellReason` (Task 2).

- [ ] **Step 1: Cap `filesList` at the top of `handleFiles`**

Find:

```tsx
  const handleFiles = (filesList: FileList | File[]) => {
    if (!isWorkingHours()) {
      setUploadError("К сожалению, приём файлов приостановлен во внерабочее время. Мы работаем: Пн-Пт 09:00-19:00, Сб-Вс 10:00-19:00.");
      return;
    }
    setUploadError(null);
```

Change to:

```tsx
  const handleFiles = (filesList: FileList | File[]) => {
    if (!isWorkingHours()) {
      setUploadError("К сожалению, приём файлов приостановлен во внерабочее время. Мы работаем: Пн-Пт 09:00-19:00, Сб-Вс 10:00-19:00.");
      return;
    }
    // Гость может добавлять файлы только по одному действию за раз (клик
    // или drag-and-drop = максимум 1 файл) — сам заказ этим не ограничен,
    // просто по одному действию сразу. Берём первый файл как обычно, на
    // остальные из этой же пачки показываем предложение регистрации.
    if (user.isGuest && filesList.length > 1) {
      setGuestUpsellReason('multi_file');
      filesList = [filesList[0]];
    }
    setUploadError(null);
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual browser check**

Run: `npm run build` then `npm run preview`.

1. As a guest, on the upload screen, select 3 files at once via the file picker (or drag-drop 3 files together).
   Expected: exactly 1 file card appears (the first of the 3), and the upsell modal opens with the multi-file text.
2. Close the modal, then add 2 more files as **separate** actions (one file picker click each).
   Expected: both get added normally (now 3 file cards total), no modal on either.
3. Log in as a real account, select 3 files at once.
   Expected: existing behavior unchanged — files auto-bundle into one zip card (as documented in the `handleFiles` comment about the >2-files auto-zip).

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "Limit guest file uploads to one file per action"
```

---

### Task 6: Задача Б #4 — gate the referral link

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `guestUpsellReason`/`setGuestUpsellReason` (Task 2).

- [ ] **Step 1: Stop auto-generating a referral code for guests**

Find (around line 1068-1077):

```tsx
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
```

Change to:

```tsx
  // Клиенты, зарегистрированные до реферальной программы, не получили свой
  // код при регистрации — досоздаём один раз при первом заходе в кабинет.
  // Гостю код не создаём — ему всё равно некуда получать бонус без
  // постоянного профиля (см. карточку "Пригласите друга" ниже).
  useEffect(() => {
    if (!user.isGuest && !user.referralCode) {
      const code = generateReferralCode(user.id);
      const updatedUsers = database.users.map(u => (u.id === user.id ? { ...u, referralCode: code } : u));
      onUpdateDatabase({ users: updatedUsers });
      registerReferralCode(code, user.id);
    }
  }, [user.id, user.isGuest, user.referralCode]);
```

- [ ] **Step 2: Show a gated card instead, for guests**

Find (around line 4440-4468):

```tsx
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
```

Change to:

```tsx
          {user.isGuest ? (
            <button
              type="button"
              onClick={() => setGuestUpsellReason('referral')}
              className="w-full text-left bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-white rounded-3xl p-5 border border-indigo-400/30 shadow-lg shadow-indigo-500/20 relative overflow-hidden cursor-pointer"
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/5 rounded-full pointer-events-none"></div>
              <div className="flex items-start gap-3 relative z-10">
                <div className="p-3 bg-white/10 rounded-2xl border border-white/20 shrink-0">
                  <Gift className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black uppercase tracking-wider">Пригласите друга — оба получите скидку 🎁</h4>
                  <p className="text-xs text-white/85 mt-1 font-medium">
                    Своя реферальная ссылка доступна после регистрации — заведите аккаунт за 10 секунд.
                  </p>
                </div>
              </div>
            </button>
          ) : user.referralCode && (
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual browser check**

Run: `npm run build` then `npm run preview`.

1. As a fresh guest (before placing any order), go to "Главная".
   Expected: the "Пригласите друга" card is present but shows the gated text (no real referral link, no "Поделиться" button); clicking it opens the upsell modal with the referral text.
2. Register from that modal (or place an order, which also lifts `isGuest`), go back to "Главная".
   Expected: the card now shows a real referral link and "Поделиться" button (existing behavior).
3. Log in as an older real account that already has a `referralCode`.
   Expected: unchanged — real card shows immediately, no gating.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "Gate referral link behind guest signup prompt"
```

---

## Deploying to production

None of the above touches `main` until explicitly pushed. Once all 6 tasks are committed and verified locally, get the user's explicit go-ahead, then:

```bash
git push origin master:main
```

(Check `git log origin/main..master --oneline` first for a clean fast-forward — someone else may have pushed to `main` in the meantime.) This triggers the existing GitHub Actions workflow, which builds and SFTPs `dist/*` to `sever-18.ru` on Beget automatically.
