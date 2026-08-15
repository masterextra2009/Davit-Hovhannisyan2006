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
