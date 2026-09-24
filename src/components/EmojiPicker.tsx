/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StickerView } from './StickerView';

export type Sticker = {
  src: string;
  label: string;
  animClass: string;
  /** Раздел в панели: свои стикеры мастерской или эмодзи Google Noto. */
  group?: 'own' | 'noto';
};

export const STICKERS: Sticker[] = [
  { src: '/stickers/glyanu.webm', label: 'ЩЯ ГЛЯНУ', animClass: '' },
  { src: '/stickers/spasibo.webm', label: 'СПАСИБО', animClass: '' },
  { src: '/stickers/izvinyayus.webm', label: 'ИЗВИНЯЮСЬ', animClass: '' },
  { src: '/stickers/rad-pomoch.webm', label: 'РАД ПОМОЧЬ', animClass: '' },
  { src: '/stickers/otpishus.webm', label: 'Я ОТПИШУСЬ', animClass: '' },
  { src: '/stickers/podarok.webm', label: 'ВАМ ПОДАРОК', animClass: '' },
  // Свои стикеры Давида (25.09.2026, «сам делал»). Для телефона рядом лежит
  // .webp той же анимации — приложение берёт её (видео с прозрачностью
  // Android не показывает).
  { src: '/stickers/my/m1.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m2.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m3.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m4.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m5.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m6.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m7.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m8.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m9.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m10.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m11.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m12.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m13.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m14.webm', label: '', animClass: '', group: 'own' },
  { src: '/stickers/my/m15.webm', label: '', animClass: '', group: 'own' },
  // Живые эмодзи Google Noto (Lottie). © Google, лицензия CC BY 4.0 —
  // упоминание автора есть в приложении и на сайте.
  { src: '/stickers/noto/1f64f.json', label: 'Спасибо', animClass: '', group: 'noto' },
  { src: '/stickers/noto/2764_fe0f.json', label: 'Сердце', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f970.json', label: 'С любовью', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f60d.json', label: 'Восторг', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f389.json', label: 'Ура!', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f973.json', label: 'Праздник', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f44d.json', label: 'Отлично', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f44c.json', label: 'Окей', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f44f.json', label: 'Браво', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f44b.json', label: 'Привет', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f917.json', label: 'Обнимаю', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f60a.json', label: 'Улыбка', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f601.json', label: 'Рад помочь', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f60e.json', label: 'Круто', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f929.json', label: 'Вау', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f607.json', label: 'Ангел', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f605.json', label: 'Извините', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f914.json', label: 'Подумаю', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f440.json', label: 'Гляну', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f525.json', label: 'Огонь', animClass: '', group: 'noto' },
  { src: '/stickers/noto/2728.json', label: 'Блеск', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f31f.json', label: 'Звезда', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f4af.json', label: '100%', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f381.json', label: 'Подарок', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f680.json', label: 'Быстро', animClass: '', group: 'noto' },
  { src: '/stickers/noto/23f0.json', label: 'Будильник', animClass: '', group: 'noto' },
  { src: '/stickers/noto/231b.json', label: 'Ждём', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f4f8.json', label: 'Фото', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f338.json', label: 'Цветок', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f308.json', label: 'Радуга', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f496.json', label: 'Сияющее сердце', animClass: '', group: 'noto' },
  { src: '/stickers/noto/1f618.json', label: 'Воздушный поцелуй', animClass: '', group: 'noto' },
];

function burstParticles(x: number, y: number, emoji: string) {
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('span');
    p.className = 'emoji-particle';
    p.textContent = emoji;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    const a = (Math.PI * 2 * i) / 8;
    const d = 50 + Math.random() * 35;
    p.style.setProperty('--tx', Math.cos(a) * d + 'px');
    p.style.setProperty('--ty', Math.sin(a) * d + 'px');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }
}

interface EmojiPickerProps {
  onSelect: (sticker: Sticker) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const handlePick = (e: React.MouseEvent, sticker: Sticker) => {
    burstParticles(e.clientX, e.clientY, '✨');
    onSelect(sticker);
    setTimeout(onClose, 120);
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40" />
      <div className="emoji-picker-panel absolute bottom-full mb-2 left-0 z-50 rounded-2xl shadow-2xl p-3 w-[320px] max-h-[360px] overflow-y-auto">
        {([
          ['own', 'Стикеры мастерской'],
          ['noto', 'Эмодзи'],
        ] as const).map(([group, title]) => (
          <div key={group} className="mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-60 px-1 pb-1.5">{title}</div>
            <div className="grid grid-cols-3 gap-2">
              {STICKERS.filter(s => (s.group ?? 'own') === group).map((s) => (
                <button
                  key={s.src}
                  type="button"
                  onClick={(e) => handlePick(e, s)}
                  className="sticker-btn flex flex-col items-center gap-1"
                >
                  <div className={`sticker__bubble ${s.animClass}`}>
                    <StickerView src={s.src} className="sticker__img" />
                  </div>
                  {s.label ? <span className="sticker__label">{s.label}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="text-[10px] opacity-50 px-1 pt-1">Эмодзи: Noto Emoji © Google, CC BY 4.0</div>
      </div>
    </>
  );
}
