# Guest Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor click "Загрузить файл" and land straight on the upload screen (no registration form), only asking for name+phone at the final "Оформить заказ" step — while keeping the header's "Войти в кабинет"/"Зарегистрироваться" buttons unchanged.

**Architecture:** "Загрузить файл" triggers Firebase Anonymous Auth (`signInAnonymously`) instead of routing to `AuthScreen`, creating a lightweight guest profile (`isGuest: true`, same empty-email pattern already used for Telegram sign-in). The existing `Dashboard` upload tab, print-settings modals, and price calculation are reused unchanged. Only the "Шаг 2. Оформление" checkout form gains a name+phone block for guests. If a guest later registers for real through the header's normal signup form, `registerUserWithFirebase` detects the active anonymous session and upgrades it in place (`linkWithCredential`) instead of creating a separate account, so the guest's orders (tied to the same Firebase uid) automatically show up in their new account.

**Tech Stack:** Vite, React 19, TypeScript, Firebase Auth (`signInAnonymously`, `linkWithCredential`, `EmailAuthProvider`) + Firestore, no new dependencies.

## Global Constraints

- Header's "Войти в кабинет" and "Зарегистрироваться" buttons keep their exact current behavior and destination — do not touch their handlers.
- No new npm packages. Firebase SDK functions used here (`signInAnonymously`, `linkWithCredential`, `EmailAuthProvider`) are already part of the installed `firebase` package.
- Guest phone input matches the existing signup form's pattern exactly: plain `type="tel"`, `required`, placeholder `+7 (999) 999-99-99` — no new input-masking library or regex validation (the existing signup form has none either).
- This repo has no test runner (`npm run lint` = `tsc --noEmit` only). Verification steps use `npm run build` + manual browser walkthroughs, matching every other task done in this project today.
- Nothing is deployed (`git push` to `main`) without the user's explicit go-ahead — the GitHub Actions workflow on `main` deploys straight to the live site.

**One clarification vs. the written spec:** the spec's step 3 says the guest name+phone block appears *"вместо обычной формы оформления"* (instead of the usual checkout form). The actual "Шаг 2. Оформление" form only contains a promo-code field, a printer's-note field, and finishing options (степлер/пружина/etc.) — none of that is registration-related, all of it is still useful for a guest order. This plan **adds** the name+phone block at the top of that existing form instead of replacing it, so guests keep promo codes and printer notes. Flagging this now — say if you'd rather it fully replace the form instead.

---

### Task 1: Data model + Firebase re-exports

**Files:**
- Modify: `src/types.ts` (the `User` interface)
- Modify: `src/firebase.ts`

**Interfaces:**
- Produces: `User.isGuest?: boolean` field, usable by all later tasks. `signInAnonymously`, `linkWithCredential`, `EmailAuthProvider` re-exported from `src/firebase.ts` exactly like every other Firebase Auth function already is (e.g. `signInWithPopup`).

- [ ] **Step 1: Add the `isGuest` field to the `User` type**

In `src/types.ts`, inside `export interface User { ... }`, add (near the other optional flags like `isSocial?: boolean`):

```ts
  // Аккаунт создан анонимно при клике "Загрузить файл" (без пароля/почты) —
  // см. signInAsGuest в firebaseUtils.ts. true, пока клиент не ввёл
  // имя+телефон на оформлении заказа или не завёл полноценный аккаунт.
  isGuest?: boolean;
```

- [ ] **Step 2: Re-export the three new Firebase Auth functions**

In `src/firebase.ts`, add `signInAnonymously`, `linkWithCredential`, and `EmailAuthProvider` to the existing `import { ... } from 'firebase/auth';` block (alongside `signInWithPopup`, `signInWithCustomToken`, etc.), and add the same three names to the `export { ... }` block right below it. Match the existing formatting exactly (one name per line, same style).

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no errors (this only adds an optional field and re-exports unused-so-far functions — nothing consumes them yet, so TypeScript has nothing to complain about).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/firebase.ts
git commit -m "Add isGuest field and re-export anonymous/linking auth functions"
```

---

### Task 2: `signInAsGuest()` — create the anonymous profile

**Files:**
- Modify: `src/firebaseUtils.ts`

**Interfaces:**
- Consumes: `auth`, `doc`, `setDoc`, `signInAnonymously` from `./firebase` (already imported at the top of `firebaseUtils.ts`; add `signInAnonymously` to that existing import line). `User` type from `./types` (already imported). `generateReferralCode` (already defined/used in this file for the Telegram and email registration paths — reuse it here too for consistency, guests get a referral code like everyone else).
- Produces: `export async function signInAsGuest(): Promise<User>` — new function, no other task depends on its internals, only that it resolves to a `User` with `isGuest: true` or rejects on failure (caller in Task 3 handles the rejection).

- [ ] **Step 1: Add `signInAnonymously` to the existing Firebase import**

In `src/firebaseUtils.ts`, find the import from `./firebase` near the top of the file (it already includes `auth, onAuthStateChanged, db, enableNetwork` — confirmed present) and add `signInAnonymously` to that same import list.

- [ ] **Step 2: Write `signInAsGuest`**

Add this function to `src/firebaseUtils.ts`, near `signInWithTelegram` (same section, same style — it follows the exact same shape: sign in, then create/return a Firestore user doc):

```ts
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/firebaseUtils.ts
git commit -m "Add signInAsGuest() for anonymous guest checkout"
```

---

### Task 3: Wire "Загрузить файл" to the guest flow, with retry-on-failure

**Files:**
- Modify: `src/components/LandingPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `signInAsGuest` from `../firebaseUtils` (new import in `App.tsx`; produced by Task 2).
- Produces: `LandingPage` gets a new required prop `onUploadClick: () => void`, used only by the hero "Загрузить файл" button — every other button on the page keeps using `onEnter` unchanged.

- [ ] **Step 1: Add the `onUploadClick` prop to `LandingPage`**

In `src/components/LandingPage.tsx`, update the props interface:

```tsx
interface LandingPageProps {
  onEnter: () => void;
  onUploadClick: () => void;
}
```

And the function signature:

```tsx
export function LandingPage({ onEnter, onUploadClick }: LandingPageProps) {
```

- [ ] **Step 2: Point the hero "Загрузить файл" button at the new prop**

Still in `LandingPage.tsx`, find the hero section's upload button (`<Upload className="w-4 h-4" /> Загрузить файл`, currently `onClick={onEnter}`) and change just that one button's handler:

```tsx
<button
  onClick={onUploadClick}
  className="landing-cta-btn btn-holo-glass flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold cursor-pointer"
>
  <Upload className="w-4 h-4" />
  Загрузить файл
</button>
```

Leave the header "Войти в кабинет" button and the prices-section "Полный прайс в кабинете" button exactly as they are (`onClick={onEnter}`, unchanged) — per the global constraint, only this one button changes.

- [ ] **Step 3: Add guest sign-in state and handler in `App.tsx`**

In `src/App.tsx`, add `signInAsGuest` to the existing import from `./firebaseUtils` (it already imports several functions from there — add this name to that list).

Add new state near the other `useState` calls in the `App` component body:

```tsx
const [guestSignInStatus, setGuestSignInStatus] = useState<'idle' | 'pending' | 'error'>('idle');
```

Add the handler near `handleAuthSuccess`:

```tsx
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
```

- [ ] **Step 4: Render the pending/error states, and pass the new prop to `LandingPage`**

In `src/App.tsx`, find the render ternary chain (`{paymentReturnOrderId ? (...) : !user && showLanding ? (<LandingPage ... />) : ...}`). Add two new branches right after the `paymentReturnOrderId` branch and before the `showLanding` branch, and pass `onUploadClick` to `LandingPage`:

```tsx
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
```

(The rest of the chain — `!user ? (<AuthScreen .../>) : ...` — stays exactly as it is; only inserting the two new branches and the one new prop above it.)

- [ ] **Step 5: Verify it compiles**

Run: `npm run lint`
Expected: no errors (in particular, no "missing prop `onUploadClick`" error — confirms both the interface and the call site were updated together).

- [ ] **Step 6: Manual browser check**

Run: `npm run build` then `npm run preview`, open the printed local URL.
On the landing page, click "Загрузить файл" (the hero button, not "Войти в кабинет" in the header).
Expected: a brief spinner, then you land directly on the upload screen (Dashboard's "upload" tab) — no login/registration form appears. Click the header's "Войти в кабинет" from a fresh incognito/private window separately — confirm it still shows the normal login form unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/LandingPage.tsx
git commit -m "Route \"Загрузить файл\" to guest checkout instead of the login form"
```

---

### Task 4: Guest name+phone step on "Шаг 2. Оформление"

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `user.isGuest` (from Task 1's type field), `onUpdateDatabase` prop (already exists on `Dashboard`, already used elsewhere in this same file to patch `database.users`), `handlePlaceOrder` (existing function in this file, being extended here, same signature `(e: React.FormEvent, onReceipt?: boolean) => Promise<void>`).
- Produces: nothing new consumed by other tasks — this is the last functional piece.

- [ ] **Step 1: Add local state for the guest name/phone fields**

In `src/components/Dashboard.tsx`, near the other checkout-related `useState` calls (close to where `promoCode`/`notes` state is declared — search for `const [notes, setNotes] = useState`), add:

```tsx
const [guestFullName, setGuestFullName] = useState('');
const [guestPhone, setGuestPhone] = useState('');
```

- [ ] **Step 2: Validate guest fields at the top of `handlePlaceOrder`**

In `handlePlaceOrder` (starts `const handlePlaceOrder = async (e: React.FormEvent, onReceipt: boolean = false) => {`), right after the existing `if (uploadedFiles.length === 0 && !selectedService) return;` check, add:

```tsx
if (user.isGuest && (!guestFullName.trim() || !guestPhone.trim())) {
  setUploadError("Пожалуйста, укажите имя и телефон, чтобы мы могли передать вам заказ.");
  return;
}
```

- [ ] **Step 3: Use the guest name in the order, and persist it to the profile**

Still in `handlePlaceOrder`, find `const newOrder: Order = { ... userName: user.fullName, userEmail: user.email, ... }` and change the `userName` line to:

```tsx
userName: user.isGuest ? guestFullName.trim() : user.fullName,
```

A few lines below, `updatedUsers` is declared once and read by three different `onUpdateDatabase({ ..., users: updatedUsers })` calls further down this same function (the cash-on-receipt path and the two online-payment paths) — enrich it once, right where it's declared, so all three pick up the change automatically. Find:

```tsx
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
```

Add a guest-profile patch right after it (still before `pendingOrder` is built):

```tsx
    if (user.isGuest) {
      updatedUsers = updatedUsers.map(u =>
        u.id === user.id
          ? { ...u, fullName: guestFullName.trim(), phone: guestPhone.trim(), isGuest: false }
          : u
      );
    }
```

Setting `isGuest: false` here means once they've placed one order with a real name+phone, they're just a normal (if password-less) client from then on — matches the field's documented purpose from Task 1 ("true, пока клиент не ввёл имя+телефон на оформлении заказа").

- [ ] **Step 4: Render the name+phone block at the top of the Step 2 form**

Find the "Шаг 2. Оформление" form: `<form onSubmit={handlePlaceOrder} className="space-y-5">` followed immediately by the `{/* Промокод */}` block. Insert this new block as the very first child inside the `<form>`, before `{/* Промокод */}`:

```tsx
{/* Гость (пришёл через "Загрузить файл" без регистрации) — имя и телефон
    нужны один раз, здесь, вместо полной формы регистрации на входе. */}
{user.isGuest && (
  <div className="space-y-3 pb-2 border-b border-white/10">
    <div>
      <label htmlFor="guest-name" className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
        Ваше имя
      </label>
      <input
        id="guest-name"
        type="text"
        required
        value={guestFullName}
        onChange={e => setGuestFullName(e.target.value)}
        placeholder="Иван Иванов"
        className="w-full px-3.5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
      />
    </div>
    <div>
      <label htmlFor="guest-phone" className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-2">
        Телефон
      </label>
      <input
        id="guest-phone"
        type="tel"
        required
        value={guestPhone}
        onChange={e => setGuestPhone(e.target.value)}
        placeholder="+7 (999) 999-99-99"
        className="w-full px-3.5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
      />
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual browser check**

Run: `npm run build` then `npm run preview`. Click "Загрузить файл" on the landing page, upload any file, configure it, proceed to "Шаг 2. Оформление".
Expected: "Ваше имя" and "Телефон" fields appear above "Промокод". Try clicking "Оформить заказ" with them empty — expect the existing red error-message UI to show "Пожалуйста, укажите имя и телефон...". Fill both in and submit — expect the order to go through normally (same success behavior as a logged-in client placing an order).

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "Collect guest name/phone on checkout instead of upfront registration"
```

---

### Task 5: Link a guest's anonymous session when they register for real

**Files:**
- Modify: `src/firebaseUtils.ts`

**Interfaces:**
- Consumes: `auth`, `linkWithCredential`, `EmailAuthProvider` (re-exported in Task 1). Modifies the existing `registerUserWithFirebase` function — same exported signature as before (`registerUserWithFirebase(email, password, fullName, phone, role?, referralCodeInput?): Promise<User>`), no caller changes needed (`AuthScreen.tsx` keeps calling it exactly as today).

- [ ] **Step 1: Branch on `auth.currentUser?.isAnonymous` inside `registerUserWithFirebase`**

In `src/firebaseUtils.ts`, find `registerUserWithFirebase` (starts `export async function registerUserWithFirebase(email: string, password: string, fullName: string, phone: string, role...`). It currently does:

```ts
const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
const fbUser = userCredential.user;
```

Change those two lines to:

```ts
// Если в этой же вкладке уже есть анонимная гостевая сессия ("Загрузить
// файл" без регистрации, см. signInAsGuest) — апгрейдим её на месте
// (linkWithCredential), а не создаём отдельный новый аккаунт. Firebase при
// этом СОХРАНЯЕТ uid, значит все заказы гостя (userId == uid) остаются на
// месте и сразу видны в новом аккаунте — переносить их отдельно не нужно.
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
```

Everything below this in the function (the `updateProfile`, `isExplicitAdmin` check, `newUser` object, `setDoc`, `registerReferralCode`, `trackAnalyticsEvent`) stays exactly as it already is — it already reads `fbUser.uid`/`fbUser` generically, so it works unchanged for both the linked and the fresh-account path.

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual browser check — the full guest-to-real-account journey**

Run: `npm run build` then `npm run preview`.
1. Click "Загрузить файл", upload a file, place a guest order with name+phone (as in Task 4's check) — note the order ID shown.
2. Without logging out or closing the tab, find the "Зарегистрироваться" link (bottom of `AuthScreen` — reachable via the header's "Войти в кабинет" from the still-guest session, then switching to signup mode) and register with a real email+password.
3. After registration completes, check the client's order history (the "orders" tab in `Dashboard`).
Expected: the guest order from step 1 appears in the order history of the newly-registered account — same order ID, not duplicated, not missing.
4. Separately, in a fresh incognito window (no prior guest session at all), go through "Зарегистрироваться" directly from the header.
Expected: registration works exactly as before this change (a plain new account, no linking-related errors or behavior change) — confirms the `wasAnonymous` branch correctly does nothing when there's no guest session.

- [ ] **Step 4: Commit**

```bash
git add src/firebaseUtils.ts
git commit -m "Link a guest's anonymous session when they complete real registration"
```

---

## Deploying to production

None of the above touches `main` until explicitly pushed. Once all 5 tasks are committed and verified locally, get the user's explicit go-ahead, then:

```bash
git push origin master:main
```

(Check `git log origin/main..master --oneline` first for a clean fast-forward, same as every other deploy today — someone else may have pushed to `main` in the meantime.) This triggers the existing GitHub Actions workflow, which builds and SFTPs `dist/*` to `sever-18.ru` on Beget automatically.
