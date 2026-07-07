/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export type Sticker = {
  src: string;
  label: string;
  animClass: string;
};

export const STICKERS: Sticker[] = [
  { src: '/stickers/fuu.png', label: 'ФУУУ', animClass: 'anim-shake' },
  { src: '/stickers/vau.png', label: 'ВАУ!', animClass: 'anim-glow anim-sparkle' },
  { src: '/stickers/oy.png', label: 'ОЙ!', animClass: 'anim-wobble' },
  { src: '/stickers/hrys.png', label: 'ХРЫСЬ', animClass: 'anim-shake' },
  { src: '/stickers/zhar.png', label: 'ЖАР!', animClass: 'anim-pulse' },
  { src: '/stickers/plach.png', label: 'ПЛАЧ', animClass: 'anim-rain anim-bounce' },
  { src: '/stickers/boleyu.png', label: 'БОЛЕЮ', animClass: 'anim-float' },
  { src: '/stickers/shok.png', label: 'ШОК!', animClass: 'anim-shake' },
  { src: '/stickers/obozhayu.png', label: 'ОБОЖАЮ', animClass: 'anim-heartbeat' },
  { src: '/stickers/vrun.png', label: 'ВРУН', animClass: 'anim-spin' },
  { src: '/stickers/vor.png', label: 'ВОР!', animClass: 'anim-wobble' },
  { src: '/stickers/ay.png', label: 'АЙ!', animClass: 'anim-shake' },
  { src: '/stickers/kloun.png', label: 'КЛОУН', animClass: 'anim-spin' },
  { src: '/stickers/korol.png', label: 'КОРОЛЬ', animClass: 'anim-glow anim-spin' },
  { src: '/stickers/zlodey.png', label: 'ЗЛОДЕЙ', animClass: 'anim-wobble anim-glow' },
  { src: '/stickers/chert.png', label: 'ЧЁРТ!', animClass: 'anim-shake' },
  { src: '/stickers/angel.png', label: 'АНГЕЛ', animClass: 'anim-float anim-sparkle' },
  { src: '/stickers/chto.png', label: 'ЧТО?', animClass: 'anim-shake' },
  { src: '/stickers/stoy.png', label: 'СТОЙ!', animClass: 'anim-pulse' },
  { src: '/stickers/kofe.png', label: 'КОФЕ', animClass: 'anim-float' },
  { src: '/stickers/vkusno.png', label: 'ВКУСНО', animClass: 'anim-bounce' },
  { src: '/stickers/geniy.png', label: 'ГЕНИЙ', animClass: 'anim-pulse anim-sparkle' },
  { src: '/stickers/robot.png', label: 'РОБОТ', animClass: 'anim-shake' },
  { src: '/stickers/pirat.png', label: 'ПИРАТ', animClass: 'anim-wobble' },
  { src: '/stickers/kosmos.png', label: 'КОСМОС', animClass: 'anim-float anim-glow' },
  { src: '/stickers/povar.png', label: 'ПОВАР', animClass: 'anim-bounce' },
  { src: '/stickers/kot.png', label: 'КОТ', animClass: 'anim-float' },
  { src: '/stickers/pes.png', label: 'ПЁС', animClass: 'anim-bounce' },
  { src: '/stickers/ulybka.png', label: 'УЛЫБКА', animClass: 'anim-pulse' },
  { src: '/stickers/podmigivayu.png', label: 'ПОДМИГИВАЮ', animClass: 'anim-wobble anim-glow' },
  { src: '/stickers/molchu.png', label: 'МОЛЧУ', animClass: 'anim-float' },
  { src: '/stickers/okey.png', label: 'ОКЕЙ', animClass: 'anim-glow' },
  { src: '/stickers/klass.png', label: 'КЛАСС!', animClass: 'anim-bounce' },
  { src: '/stickers/net.png', label: 'НЕТ!', animClass: 'anim-shake' },
  { src: '/stickers/da.png', label: 'ДА!', animClass: 'anim-pulse' },
  { src: '/stickers/stroitel.png', label: 'СТРОИТЕЛЬ', animClass: 'anim-spin' },
  { src: '/stickers/doktor.png', label: 'ДОКТОР', animClass: 'anim-float' },
  { src: '/stickers/sudya.png', label: 'СУДЬЯ', animClass: 'anim-wobble' },
  { src: '/stickers/nindzya.png', label: 'НИНДЗЯ', animClass: 'anim-shake' },
  { src: '/stickers/geroy.png', label: 'ГЕРОЙ', animClass: 'anim-glow anim-pulse' },
  { src: '/stickers/moryak.png', label: 'МОРЯК', animClass: 'anim-float' },
  { src: '/stickers/kovboy.png', label: 'КОВБОЙ', animClass: 'anim-bounce' },
  { src: '/stickers/volshebnik.png', label: 'ВОЛШЕБНИК', animClass: 'anim-glow anim-sparkle' },
  { src: '/stickers/fokusnik.png', label: 'ФОКУСНИК', animClass: 'anim-sparkle' },
  { src: '/stickers/dozhd.png', label: 'ДОЖДЬ', animClass: 'anim-rain anim-float' },
  { src: '/stickers/moroz.png', label: 'МОРОЗ', animClass: 'anim-float anim-sparkle' },
  { src: '/stickers/dr.png', label: 'ДР!', animClass: 'anim-bounce anim-glow' },
  { src: '/stickers/inoplanetyanin.png', label: 'ИНОПЛАНЕТЯНИН', animClass: 'anim-float anim-glow' },
  { src: '/stickers/vypusknik.png', label: 'ВЫПУСКНИК!', animClass: 'anim-spin anim-sparkle' },
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
        <div className="grid grid-cols-4 gap-2">
          {STICKERS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => handlePick(e, s)}
              className="sticker-btn flex flex-col items-center gap-1"
            >
              <div className={`sticker__bubble ${s.animClass}`}>
                <img src={s.src} alt={s.label} className="sticker__img" />
              </div>
              <span className="sticker__label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
