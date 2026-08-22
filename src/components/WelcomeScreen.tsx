/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { WelcomeIllustration } from './WelcomeIllustration';
import { detectGenderFromFullName } from '../utils';

// Персонализированный экран приветствия после первого входа — по мотивам
// раскладки Figma-референса "Splash and Onboarding" (иллюстрация персонажа
// крупным планом + заголовок + текст + кнопка), адаптирован под нашу синюю
// палитру и собственную иллюстрацию (см. WelcomeIllustration.tsx — там же
// объяснение, почему не взята иллюстрация из референса напрямую).
export function WelcomeScreen({ fullName, onDone }: { fullName: string; onDone: () => void }) {
  const gender = detectGenderFromFullName(fullName);
  const firstName = fullName.trim().split(/\s+/)[0] || '';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(10px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm glass-panel glass-panel-modal rounded-[32px] pt-8 pb-7 px-7 flex flex-col items-center text-center gap-1"
      >
        <div className="w-44 h-44 shrink-0">
          <WelcomeIllustration gender={gender} />
        </div>

        <h2 className="text-xl font-black text-white mt-2">
          Добро пожаловать{firstName ? `, ${firstName}` : ''}!
        </h2>
        <p className="text-sm text-white/55 mt-1.5 leading-relaxed">
          Загружайте файлы, следите за статусом заказа и пишите оператору —
          всё в одном личном кабинете.
        </p>

        <button
          onClick={onDone}
          className="w-full mt-6 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition-all cursor-pointer"
        >
          Начать
        </button>
      </motion.div>
    </div>
  );
}
