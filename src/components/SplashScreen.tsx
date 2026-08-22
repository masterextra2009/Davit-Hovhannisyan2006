/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';

// Загрузочный экран при открытии приложения — по образцу анимации логотипа
// Netflix (одна крупная буква в центре, затем остальные буквы достраиваются),
// чёрный фон + белые буквы (по правке клиента), без копирования шрифта
// Netflix. Шрифт — системный жирный serif-стек (Georgia/Cambria), а не
// веб-шрифт с Google Fonts: текущий CSP (index.html, font-src 'self' data:)
// его бы заблокировал, а расширять политику ради заставки — отдельное
// решение, не в рамках этой правки.
const WORD = 'Фото-Север';
const FIRST_LETTER_DURATION = 1.1;
const LETTER_STAGGER = 0.085;
const LETTERS_START = 0.55;
const LETTER_DURATION = 0.32;
const TOTAL_DURATION = 2.0;

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const rest = WORD.slice(1).split('');

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: TOTAL_DURATION, times: [0, 0.85, 1], ease: 'easeInOut' }}
      onAnimationComplete={onDone}
    >
      <div
        className="relative flex items-baseline"
        style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", serif', fontWeight: 900, letterSpacing: '-0.02em' }}
      >
        <motion.span
          className="inline-block text-white"
          style={{ transformOrigin: 'center', fontSize: '2.75rem' }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 1, 1], scale: [0.4, 2.7, 2.7, 1] }}
          transition={{ duration: FIRST_LETTER_DURATION, times: [0, 0.18, 0.4, 1], ease: 'easeInOut' }}
        >
          {WORD[0]}
        </motion.span>
        {rest.map((char, i) => (
          <motion.span
            key={i}
            className="inline-block text-white"
            style={{ fontSize: '2.75rem' }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: LETTER_DURATION, delay: LETTERS_START + i * LETTER_STAGGER, ease: 'easeOut' }}
          >
            {char}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}
