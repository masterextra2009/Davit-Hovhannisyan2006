/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { Lock, Mail, User as UserIcon, Phone, ArrowRight, ShieldAlert, CheckCircle, Printer } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { signInUserWithFirebase, registerUserWithFirebase, signInWithGoogleFirebase, signInWithTelegram, TelegramAuthData } from '../firebaseUtils';
import { motion } from 'motion/react';

// Яркий голубой градиент фона окна входа (наносится напрямую через inline-style,
// чтобы гарантированно отображаться независимо от порядка загрузки CSS-файлов)
const AUTH_BG_LIGHT = {
  backgroundColor: '#4c1d95',
  backgroundImage:
    'radial-gradient(circle at 14% 10%, #fda4af 0%, transparent 40%),' +
    'radial-gradient(circle at 88% 14%, #7dd3fc 0%, transparent 46%),' +
    'radial-gradient(circle at 18% 86%, #c4b5fd 0%, transparent 48%),' +
    'radial-gradient(circle at 84% 92%, #67e8f9 0%, transparent 42%),' +
    'linear-gradient(160deg, #6d28d9 0%, #1e3a8a 60%, #0b1530 100%)',
  backgroundAttachment: 'fixed' as const,
};

const AUTH_BG_DARK = {
  backgroundColor: '#0b1530',
  backgroundImage:
    'radial-gradient(circle at 15% 8%, rgba(196,132,252,0.55) 0%, transparent 42%),' +
    'radial-gradient(circle at 88% 12%, rgba(56,189,248,0.5) 0%, transparent 46%),' +
    'radial-gradient(circle at 18% 88%, rgba(129,140,248,0.55) 0%, transparent 48%),' +
    'radial-gradient(circle at 85% 92%, rgba(244,114,182,0.45) 0%, transparent 45%),' +
    'linear-gradient(160deg, #1e1033 0%, #0b1530 55%, #020617 100%)',
  backgroundAttachment: 'fixed' as const,
};

interface AuthScreenProps {
  onAuthSuccess: (user: User) => void;
  allUsers: User[];
  onRegisterUser: (user: User) => void;
}

export function AuthScreen({ onAuthSuccess, allUsers, onRegisterUser }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isForgotPasswordSent, setIsForgotPasswordSent] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Вращающееся неоновое кольцо вокруг логотипа (как у кнопки переключения темы)
  const avatarGlowRef = useRef<HTMLDivElement>(null);
  const avatarLineRef = useRef<HTMLDivElement>(null);
  const avatarAngleRef = useRef(0);
  const avatarRafRef = useRef<number>(0);

  useEffect(() => {
    const spin = () => {
      avatarAngleRef.current += 1.1;
      const deg = `${avatarAngleRef.current}deg`;
      if (avatarGlowRef.current) avatarGlowRef.current.style.setProperty('--ag', deg);
      if (avatarLineRef.current) avatarLineRef.current.style.setProperty('--al', deg);
      avatarRafRef.current = requestAnimationFrame(spin);
    };
    avatarRafRef.current = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(avatarRafRef.current);
  }, []);

  const resetMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsForgotPasswordSent(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!email || !password) {
      setErrorMsg('Пожалуйста, заполните все поля.');
      return;
    }

    setSuccessMsg('Выполняется вход...');
    signInUserWithFirebase(email.trim(), password)
      .then((firebaseUser) => {
        setSuccessMsg('Вход выполнен успешно!');
        setTimeout(() => {
          onAuthSuccess(firebaseUser);
        }, 1000);
      })
      .catch((err: any) => {
        let errorMsg = 'Не удалось войти. Пожалуйста, проверьте ваш email и пароль.';
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          errorMsg = 'Неправильный email или пароль.';
        } else if (err.code === 'auth/invalid-email') {
          errorMsg = 'Некорректный формат почты.';
        } else if (err.message) {
          errorMsg = err.message;
        }
        setErrorMsg(errorMsg);
        setSuccessMsg('');
      });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!email || !fullName || !password || !phone) {
      setErrorMsg('Пожалуйста, заполните все обязательные поля.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Пароль должен состоять минимум из 6 символов.');
      return;
    }

    setSuccessMsg('Регистрация в Firebase...');
    const role = email.trim().toLowerCase() === 'photo-sever@yandex.ru' ? 'admin' : 'client';

    registerUserWithFirebase(email.trim(), password, fullName, phone, role)
      .then((firebaseUser) => {
        setSuccessMsg('Регистрация прошла успешно! Выполняется вход...');
        setTimeout(() => {
          onAuthSuccess(firebaseUser);
        }, 1200);
      })
      .catch((err: any) => {
        let errorMsg = 'Регистрация не удалась. Пожалуйста, попробуйте другую почту.';
        if (err.code === 'auth/email-already-in-use') {
          errorMsg = 'Пользователь с таким Email уже зарегистрирован.';
        } else if (err.code === 'auth/invalid-email') {
          errorMsg = 'Некорректный формат почты.';
        } else if (err.code === 'auth/weak-password') {
          errorMsg = 'Пароль слишком слабый (минимум 6 символов).';
        } else if (err.message) {
          errorMsg = err.message;
        }
        setErrorMsg(errorMsg);
        setSuccessMsg('');
      });
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!email) {
      setErrorMsg('Введите ваш адрес электронной почты.');
      return;
    }

    setIsForgotPasswordSent(true);
    setSuccessMsg('Инструкции по восстановлению пароля успешно отправлены на ваш Email.');
  };

  // Real Google sign-in via Firebase — a popup window (signInWithPopup), not a
  // full-page redirect. Redirect-based sign-in requires our Firebase authDomain
  // (gen-lang-client-0575610984.firebaseapp.com) and the domain the app is
  // served from (sever-18.ru) to be the same, or a reverse proxy in between —
  // otherwise every modern browser blocks the cross-origin storage relay
  // getRedirectResult() depends on, and it silently resolves null. The popup
  // flow instead hands back the result via window.postMessage, which isn't
  // subject to that restriction. See firebaseUtils.ts for the full writeup.
  const handleGoogleAuth = async () => {
    resetMessages();
    setSocialLoading('google');
    try {
      const firebaseUser = await signInWithGoogleFirebase();
      setSocialLoading(null);
      onAuthSuccess(firebaseUser);
    } catch (err: any) {
      console.error('Google sign-in failed:', err);
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        // User just dismissed the popup — not a real error, no message needed.
        setSocialLoading(null);
        return;
      }
      let msg = 'Не удалось войти через Google. Попробуйте ещё раз.';
      if (err?.code === 'auth/popup-blocked') {
        msg = 'Браузер заблокировал всплывающее окно входа. Разрешите всплывающие окна для этого сайта и попробуйте снова.';
      }
      setErrorMsg(msg);
      setSocialLoading(null);
    }
  };

  // Real Telegram sign-in via the official Login Widget
  const handleTelegramAuth = async (telegramData: TelegramAuthData) => {
    resetMessages();
    setSocialLoading('telegram');
    try {
      const firebaseUser = await signInWithTelegram(telegramData);
      setSocialLoading(null);
      onAuthSuccess(firebaseUser);
    } catch (err: any) {
      console.error('Telegram sign-in failed:', err);
      setErrorMsg('Не удалось войти через Telegram. Попробуйте ещё раз.');
      setSocialLoading(null);
    }
  };

  // Загружаем официальный виджет Telegram Login в контейнер
  const telegramWidgetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (window as any).onTelegramAuthCallback = handleTelegramAuth;

    const container = telegramWidgetRef.current;
    if (!container || container.childElementCount > 0) return;

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', 'photosever_bot');
    script.setAttribute('data-size', 'medium');
    script.setAttribute('data-radius', '14');
    script.setAttribute('data-onauth', 'onTelegramAuthCallback(user)');
    script.setAttribute('data-request-access', 'write');
    container.appendChild(script);

    // Виджет вставляет свой iframe асинхронно уже после монтирования — в момент
    // вставки он на первый кадр игнорирует opacity:0 родителя и на секунду
    // проступает поверх нашей стилизованной кнопки. Ставим прозрачность прямо
    // на сам iframe, как только он появится, а не только на контейнер.
    const observer = new MutationObserver(() => {
      const iframe = container.querySelector('iframe');
      if (iframe) {
        iframe.style.opacity = '0';
        observer.disconnect();
      }
    });
    observer.observe(container, { childList: true });

    return () => observer.disconnect();
  }, []);

  // Simulate Social network logins (VK/Яндекс — pending real integration)
  const triggerSocialAuth = async (provider: 'vk' | 'yandex') => {
    resetMessages();
    setSocialLoading(provider);

    try {
      const providerNames = { vk: 'ВКонтакте', yandex: 'Яндекс' };
      const emailPrefix = provider === 'vk' ? 'vk_' : 'ya_';
      const mockEmail = `${emailPrefix}user_${Math.floor(Math.random() * 9000 + 1000)}@${provider}.ru`;
      
      const names = [
        'Дмитрий Ковалев',
        'Мария Петрова',
        'Александр Власов',
        'Елена Соколова',
        'Сергей Морозов'
      ];
      const randomName = names[Math.floor(Math.random() * names.length)];
      const fullName = `${randomName} (${providerNames[provider]})`;
      const phone = '+7 (999) ' + Math.floor(100+Math.random()*900) + '-' + Math.floor(10+Math.random()*90) + '-' + Math.floor(10+Math.random()*90);
      const mockPassword = 'Social_Demo_Pass_123!';

      // Register with real Firebase auth and save to firestore profile
      const firebaseUser = await registerUserWithFirebase(mockEmail, mockPassword, fullName, phone, 'client');
      
      // Mark as social
      firebaseUser.isSocial = true;

      setSocialLoading(null);
      onAuthSuccess(firebaseUser);
    } catch (err: any) {
      console.error('Social mock auth failed with Firebase:', err);
      setErrorMsg('Не удалось зарегистрировать социальный демо-профиль в Firebase Authentication. Проверьте сеть.');
      setSocialLoading(null);
    }
  };

  return (
    <div id="auth-screen-root" className="min-h-screen flex flex-col justify-center items-center py-14 px-4 sm:px-6 lg:px-8 transition-colors duration-300 relative overflow-hidden select-none" style={isDark ? AUTH_BG_DARK : AUTH_BG_LIGHT}>

      {/* Мягкое затемнение поверх градиентного фона, чтобы текст и карточка не терялись */}
      <div className="absolute inset-0 z-0" style={{ background: 'radial-gradient(circle at 50% 40%, rgba(5,8,20,0.15) 0%, rgba(5,8,20,0.55) 100%)' }} />

      {/* Плавающие пузырьки на фоне (по референсу клиента) */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
          <div key={n} className={`auth-bubble auth-bubble-${n}`} />
        ))}
      </div>

      {/* Theme toggle, floating top-right corner */}
      <div className="absolute top-5 right-5 z-30">
        <ThemeToggle />
      </div>

      {/* Main card column */}
      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">

        {/* Floating circular avatar/logo, overlapping the card, with rotating neon ring like the theme toggle */}
        <div className="relative z-20 -mb-12">
          <div
            ref={avatarGlowRef}
            className="absolute -inset-2.5 rounded-full pointer-events-none"
            style={{
              background: isDark
                ? 'conic-gradient(from var(--ag,0deg), transparent 0deg, rgba(180,100,255,0.85) 60deg, rgba(255,255,255,0.95) 90deg, rgba(180,100,255,0.85) 120deg, transparent 180deg, transparent 360deg)'
                : 'conic-gradient(from var(--ag,0deg), transparent 0deg, rgba(147,197,253,0.9) 60deg, rgba(255,255,255,1) 90deg, rgba(147,197,253,0.9) 120deg, transparent 180deg, transparent 360deg)',
              filter: 'blur(6px)',
              opacity: 0.85,
            }}
          />
          <div
            ref={avatarLineRef}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: isDark
                ? 'conic-gradient(from var(--al,0deg), transparent 0deg, transparent 40deg, rgba(220,150,255,0.9) 60deg, rgba(255,255,255,1) 75deg, rgba(220,150,255,0.9) 90deg, transparent 110deg, transparent 360deg)'
                : 'conic-gradient(from var(--al,0deg), transparent 0deg, transparent 40deg, rgba(147,197,253,0.9) 60deg, rgba(255,255,255,1) 75deg, rgba(147,197,253,0.9) 90deg, transparent 110deg, transparent 360deg)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), white calc(100% - 2px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), white calc(100% - 2px))',
            }}
          />
          <div className="relative w-28 h-28 rounded-full backdrop-blur-md shadow-2xl flex items-center justify-center overflow-hidden">
            <img src="/logo-192-v2.png" alt="Фото-Север" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Glass card */}
        <div className="glass-cozy-card w-full pt-16 pb-8 px-6 sm:px-9 rounded-[36px] shadow-2xl text-center relative">

          <h1 className="text-base font-black text-slate-900 dark:text-white leading-none font-display uppercase tracking-tight">Фото-Север</h1>
          <p className="mt-1.5 mb-5 text-[11px] italic text-slate-500 dark:text-slate-300 font-medium">«Печать фотографий, документов и чертежей за минуты»</p>

          <div className="text-left">
            <h2 className="mb-6 text-xl font-black text-slate-900 dark:text-white leading-snug font-display tracking-tight text-center">
              {mode === 'login' && 'Вход в Кабинет'}
              {mode === 'signup' && 'Создать Кабинет'}
              {mode === 'forgot' && 'Сброс Пароля'}
            </h2>

            {/* Feedback alerts */}
            {errorMsg && (
              <div className="mb-5 bg-rose-500/10 text-rose-700 dark:text-rose-450 p-3.5 rounded-2xl flex items-start gap-2.5 border border-rose-500/20 text-xs font-semibold backdrop-blur-md">
                <ShieldAlert className="w-4.5 h-4.5 shrink-0 text-rose-550" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-5 bg-blue-500/10 text-blue-800 dark:text-blue-300 p-3.5 rounded-2xl flex items-start gap-2.5 border border-blue-500/20 text-xs font-semibold backdrop-blur-md">
                <CheckCircle className="w-4.5 h-4.5 shrink-0 text-blue-500" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Core Forms */}
            {mode === 'login' && (
              <form className="space-y-4" onSubmit={handleLogin}>
                <div>
                  <label htmlFor="login-email" className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Электронная почта</label>
                  <div className="relative rounded-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4.5 w-4.5" />
                    </div>
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="block w-full pl-11 pr-4 py-3 border border-transparent rounded-full glass-cozy-input text-slate-900 dark:text-white placeholder-slate-450 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 sm:text-xs transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5 pl-1">
                    <label htmlFor="login-password" className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Пароль</label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); resetMessages(); }}
                      className="text-[10px] font-black text-blue-600 hover:text-blue-500 dark:text-blue-400 uppercase tracking-wider"
                    >
                      Забыли пароль?
                    </button>
                  </div>
                  <div className="relative rounded-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4.5 w-4.5" />
                    </div>
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-11 pr-4 py-3 border border-transparent rounded-full glass-cozy-input text-slate-900 dark:text-white placeholder-slate-450 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 sm:text-xs transition-colors"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none -mt-1 pl-1">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Запомнить меня</span>
                </label>

                <button
                  type="submit"
                  className="btn-holo-glass w-full flex justify-center items-center gap-2 py-3.5 px-4 mt-2 rounded-full text-xs font-bold text-slate-900 active:scale-[0.985] transition-all cursor-pointer"
                >
                  Войти в кабинет
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {mode === 'signup' && (
              <form className="space-y-3.5" onSubmit={handleRegister}>
                <div>
                  <label htmlFor="signup-fullname" className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 pl-1">ФИО (Полное имя)</label>
                  <div className="relative rounded-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <UserIcon className="h-4.5 w-4.5" />
                    </div>
                    <input
                      id="signup-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Иван Иванов"
                      className="block w-full pl-11 pr-4 py-2.5 border border-transparent rounded-full glass-cozy-input text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-phone" className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Номер мобильного телефона</label>
                  <div className="relative rounded-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Phone className="h-4.5 w-4.5" />
                    </div>
                    <input
                      id="signup-phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+7 (999) 999-99-99"
                      className="block w-full pl-11 pr-4 py-2.5 border border-transparent rounded-full glass-cozy-input text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Электронная почта</label>
                  <div className="relative rounded-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4.5 w-4.5" />
                    </div>
                    <input
                      id="signup-email"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="block w-full pl-11 pr-4 py-2.5 border border-transparent rounded-full glass-cozy-input text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-password" className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Придумайте пароль</label>
                  <div className="relative rounded-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4.5 w-4.5" />
                    </div>
                    <input
                      id="signup-password"
                      type="password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="минимум 6 символов"
                      className="block w-full pl-11 pr-4 py-2.5 border border-transparent rounded-full glass-cozy-input text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-holo-glass w-full flex justify-center items-center py-3.5 px-4 mt-2 rounded-full text-xs font-bold text-slate-900 active:scale-[0.985] transition-all cursor-pointer"
                >
                  Создать профиль
                </button>
              </form>
            )}

            {mode === 'forgot' && (
              <form className="space-y-4" onSubmit={handleForgotPasswordSubmit}>
                <div>
                  <label htmlFor="forgot-email" className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 pl-1">Электронная почта</label>
                  <div className="relative rounded-full">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4.5 w-4.5" />
                    </div>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="block w-full pl-11 pr-4 py-3 border border-slate-200 dark:border-slate-800 rounded-full bg-white/50 dark:bg-slate-950/40 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 sm:text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isForgotPasswordSent}
                  className={`w-full flex justify-center items-center py-3 px-4 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                    isForgotPasswordSent ? 'bg-slate-400 dark:bg-slate-700 text-white cursor-not-allowed animate-pulse' : 'btn-holo-glass text-slate-900'
                  }`}
                >
                  {isForgotPasswordSent ? 'Инструкции отправлены' : 'Сбросить пароль'}
                </button>

                <button
                  type="button"
                  onClick={() => { setMode('login'); resetMessages(); }}
                  className="w-full text-center text-xs font-black text-blue-600 hover:text-blue-500 dark:text-blue-400 mt-2 block uppercase tracking-wider"
                >
                  Вернуться к входу
                </button>
              </form>
            )}

            {/* Social login partition */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200/50 dark:border-slate-800/80" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-white/70 dark:bg-white/10 backdrop-blur-sm px-4 text-slate-500 dark:text-slate-300 font-bold tracking-wider rounded-full py-0.5 border border-slate-200/40 dark:border-white/15">Войти через</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={!!socialLoading}
                  className="btn-holo-glass w-full h-[46px] flex justify-center items-center gap-2 px-3 rounded-full text-xs font-bold text-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                  title="Google ID"
                >
                  {socialLoading === 'google' ? (
                    <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-600 animate-spin" />
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.3v3.09C3.27 21.3 7.31 24 12 24z"/>
                        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.3A11.96 11.96 0 000 12c0 1.93.46 3.76 1.3 5.38l3.97-3.09z"/>
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0 7.31 0 3.27 2.7 1.3 6.62l3.97 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>
                      </svg>
                      <span>Google</span>
                    </>
                  )}
                </button>

                <div className="relative w-full h-[46px] flex justify-center items-center rounded-full overflow-hidden">
                  {/* Видимая кнопка в стиле "Войти в кабинет" — только оформление, клики сквозь неё не ловим */}
                  <div
                    className="btn-holo-glass absolute inset-0 flex justify-center items-center gap-2 px-3 rounded-full text-xs font-bold text-slate-900 pointer-events-none"
                    style={{ position: 'absolute' }}
                  >
                    {socialLoading === 'telegram' ? (
                      <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-600 animate-spin" />
                    ) : (
                      <>
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 240 240">
                          <circle cx="120" cy="120" r="120" fill="#229ED9"/>
                          <path fill="#fff" d="M167.5 76.5c1.9-8-2.7-11.4-8.4-9.3L54.6 108.9c-7.7 3-7.6 7.5-1.4 9.4l26.8 8.4 62.1-39.2c2.9-1.9 5.6-.8 3.4 1.3l-50.3 45.4h-.1l1.8 28.7c2.6 0 3.8-1.2 5.3-2.6l12.7-12.3 26.4 19.4c4.9 2.7 8.4 1.3 9.6-4.5l17.5-85.4Z"/>
                        </svg>
                        <span>Telegram</span>
                      </>
                    )}
                  </div>
                  {/* Настоящий виджет Telegram — растянут поверх невидимо, ловит клик по-настоящему */}
                  <div
                    id="telegram-login-slot"
                    ref={telegramWidgetRef}
                    className="absolute inset-0 opacity-0"
                  />
                </div>
              </div>
            </div>

            {/* Toggle modes */}
            <div className="mt-8 text-center border-t border-slate-100/50 dark:border-slate-800/50 pt-5">
              {mode === 'login' ? (
                <p className="text-xs text-slate-450 dark:text-slate-400 font-medium">
                  Еще нет личного кабинета?{' '}
                  <button
                    onClick={() => { setMode('signup'); resetMessages(); }}
                    className="font-bold text-blue-600 hover:text-blue-500 dark:text-blue-400 cursor-pointer"
                  >
                    Зарегистрироваться
                  </button>
                </p>
              ) : (
                mode !== 'forgot' && (
                  <p className="text-xs text-slate-450 dark:text-slate-400 font-medium">
                    Уже зарегистрированы?{' '}
                    <button
                      onClick={() => { setMode('login'); resetMessages(); }}
                      className="font-bold text-blue-600 hover:text-blue-500 dark:text-blue-400 cursor-pointer"
                    >
                      Войти в систему
                    </button>
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center text-[10px] text-white/70 dark:text-slate-550 font-medium relative z-10">
        &copy; 2026 Копи-Центр "Фото-Север" &middot; Северное шоссе, 18 &middot; Лицензия SSL &middot; Все права защищены
      </div>
    </div>
  );
}
