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
  { src: '/stickers/glyanu.webm', label: 'ЩЯ ГЛЯНУ', animClass: '' },
  { src: '/stickers/spasibo.webm', label: 'СПАСИБО', animClass: '' },
  { src: '/stickers/izvinyayus.webm', label: 'ИЗВИНЯЮСЬ', animClass: '' },
  { src: '/stickers/rad-pomoch.webm', label: 'РАД ПОМОЧЬ', animClass: '' },
  { src: '/stickers/otpishus.webm', label: 'Я ОТПИШУСЬ', animClass: '' },
  { src: '/stickers/podarok.webm', label: 'ВАМ ПОДАРОК', animClass: '' },
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
        <div className="grid grid-cols-3 gap-2">
          {STICKERS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => handlePick(e, s)}
              className="sticker-btn flex flex-col items-center gap-1"
            >
              <div className={`sticker__bubble ${s.animClass}`}>
                <video src={s.src} className="sticker__img" autoPlay loop muted playsInline />
              </div>
              <span className="sticker__label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
