/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';

/**
 * Персональный промокод билетом — тот же, что в мобильном приложении.
 *
 * Клиент тянет корешок вниз, бумага рвётся, и скидка встаёт в заказ. Поле для
 * ввода кода рядом остаётся: кроме личного промокода у мастерской есть общие
 * (STUDENT15 и прочие), их по-прежнему набирают руками. Но свой собственный
 * код переписывать больше не нужно — это была самая частая причина, по которой
 * скидкой не пользовались, и главный источник опечаток.
 *
 * ВАЖНО: вид и поведение должны совпадать с PromoTicket.tsx в проекте
 * sever18-app. Общего кода у сайта и приложения нет, поэтому правку придётся
 * вносить в двух местах — иначе клиент увидит в браузере одно, а в телефоне
 * другое, и решит, что где-то ошибка.
 */

// Насколько утянуть корешок, чтобы оторвался. Меньше — рвётся от случайного
// движения при прокрутке, больше — кажется, что не поддаётся.
const TEAR_AT = 54;

function play(src: string) {
  try {
    const a = new Audio(src);
    a.play().catch(() => {
      // Браузер не дал звук (нет разрешения, беззвучный режим) — отрыв всё
      // равно должен состояться. Звук тут украшение, а не условие.
    });
  } catch {
    /* то же самое */
  }
}

export function PromoTicket({
  code,
  discount,
  expiresAt,
  applied,
  onApply,
}: {
  code: string;
  discount: number;
  expiresAt?: string;
  /** Скидка уже применена — показываем оторванный билет. */
  applied: boolean;
  onApply: (code: string) => void;
}) {
  const [torn, setTorn] = useState(applied);
  const [dragY, setDragY] = useState(0);
  const dragging = useRef(false);
  const startY = useRef(0);

  const till = expiresAt
    ? new Date(expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : null;

  const tear = () => {
    if (torn) return;
    setTorn(true);
    setDragY(0);
    play('/sounds/paper-tear.mp3');
    // Скидку применяем в конце разрыва, а не в начале: причина и следствие
    // должны идти по порядку, иначе цена меняется раньше, чем бумага порвалась.
    window.setTimeout(() => {
      onApply(code);
      play('/sounds/promo-applied.mp3');
    }, 520);
  };

  const onDown = (e: React.PointerEvent) => {
    if (torn) return;
    dragging.current = true;
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setDragY(Math.max(0, e.clientY - startY.current));
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY > TEAR_AT) tear();
    else setDragY(0);
  };

  // Рваный край проступает уже при натяжении: видно, что бумага поддаётся,
  // ещё до того, как корешок оторвался.
  const edgeOpacity = torn ? 1 : Math.min(1, dragY / TEAR_AT);

  return (
    <div className="select-none">
      <div className="relative rounded-2xl" style={{ background: 'linear-gradient(135deg,#f0621f,#ff8f43)' }}>
        <div className="px-4 pt-3.5 pb-3 relative">
          <span className="block text-[10px] font-black tracking-[0.13em] text-white/90">ВАШ ПРОМОКОД</span>
          <span className="block text-[34px] leading-none font-black text-white mt-0.5">−{discount}%</span>
          <span className="block text-[12px] text-white/90 mt-0.5">на этот заказ</span>

          {/* Зубцы разрыва */}
          <div
            className="absolute left-0 right-0 flex justify-between px-0.5 pointer-events-none transition-opacity"
            style={{ bottom: -5, height: 10, opacity: edgeOpacity }}
          >
            {Array.from({ length: 26 }).map((_, i) => (
              <span key={i} className="block w-2 h-2 rotate-45" style={{ background: '#ff8f43' }} />
            ))}
          </div>

          {torn && (
            <p className="text-center text-[10px] font-black tracking-[0.16em] text-white/90 mt-2.5">
              ИСПОЛЬЗОВАН
            </p>
          )}
        </div>

        {!torn && (
          <>
            {/* Шов: вырезы по краям и пунктир */}
            <div className="relative h-0 z-10">
              <span className="absolute -left-2.5 -top-2.5 w-5 h-5 rounded-full bg-[#0f1420]" />
              <span className="absolute -right-2.5 -top-2.5 w-5 h-5 rounded-full bg-[#0f1420]" />
              <div className="mx-3 border-t-2 border-dashed border-white/50" />
            </div>

            <div
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="rounded-b-2xl px-4 pt-2.5 pb-3.5 text-center cursor-grab active:cursor-grabbing touch-none"
              style={{
                background: '#ff8f43',
                transform: `translateY(${dragY}px) rotate(${dragY * 0.06}deg)`,
                transition: dragging.current ? 'none' : 'transform .34s cubic-bezier(.2,1.3,.4,1)',
              }}
            >
              <span className="block font-mono font-black text-[17px] tracking-[0.2em] text-white">{code}</span>
              {till && <span className="block text-[10.5px] text-white/85 mt-1">действует до {till}</span>}
              <span className="block text-[10.5px] font-bold text-white/85 mt-1.5">
                ↓ потяните, чтобы применить
              </span>
            </div>
          </>
        )}
      </div>

      {/* Запасной путь: тянуть мышкой умеют не все, а с клавиатуры — никто.
          Кнопка делает ровно то же самое. */}
      {!torn && (
        <button
          type="button"
          onClick={tear}
          className="w-full mt-2 py-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/15 text-white/80 text-[11.5px] font-bold cursor-pointer transition-colors"
        >
          ✂ Оторвать и применить
        </button>
      )}
    </div>
  );
}
