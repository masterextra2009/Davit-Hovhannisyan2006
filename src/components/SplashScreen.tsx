/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CSSProperties, useEffect, useState } from 'react';
import { motion } from 'motion/react';

// Сплэш/приветственный экран:
// 1. Тёмный звёздный фон в 3 слоя глубины — мерцание (.splash-star) +
//    непрерывный медленный автономный дрейф каждого слоя со своей
//    скоростью (.splash-layer-far/mid/near, index.css) — параллакс без
//    скролла, обычный приём ощущения глубины на статичном фоне.
// 2. Название "Фото-Север" полупрозрачным, "растворённым" в звёздах.
// 3. Вход — без кнопки и без жеста: экран сам исчезает через AUTO_DISMISS_MS
//    (правка клиента — сначала была кнопка "Войти", убрали и её). Купол
//    снизу остался чисто декоративным — клиенту нравился именно вид.
const AUTO_DISMISS_MS = 1300;
const DOME_WIDTH = 640;
const DOME_HEIGHT = 260;
const DOME_HIDDEN = 175; // сколько купола спрятано под нижним краем экрана
const DOME_VISIBLE = DOME_HEIGHT - DOME_HIDDEN;

type Star = { xPct: number; yPct: number; size: number; opacity: number; dur: number; delay: number };

// Детерминированные позиции (не Math.random() на каждый рендер — иначе
// звёзды "прыгали" бы при любом ре-рендере компонента).
function makeStars(count: number, seed: number, sizeRange: [number, number], opacityRange: [number, number]): Star[] {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, () => ({
    xPct: rand() * 100,
    yPct: rand() * 100,
    size: sizeRange[0] + rand() * (sizeRange[1] - sizeRange[0]),
    opacity: opacityRange[0] + rand() * (opacityRange[1] - opacityRange[0]),
    dur: 2 + rand() * 3.5,
    delay: -rand() * 5,
  }));
}

const FAR_STARS = makeStars(70, 7, [1, 1.6], [0.25, 0.5]);
const MID_STARS = makeStars(40, 42, [1.6, 2.4], [0.4, 0.7]);
const NEAR_STARS = makeStars(20, 99, [2.2, 3.2], [0.6, 0.95]);

function StarLayer({ stars, driftClass }: { stars: Star[]; driftClass: string }) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${driftClass}`}>
      {stars.map((star, i) => (
        <span
          key={i}
          className="splash-star absolute rounded-full bg-white"
          style={{
            left: `${star.xPct}%`,
            top: `${star.yPct}%`,
            width: star.size,
            height: star.size,
            '--star-op': star.opacity,
            '--star-dur': `${star.dur}s`,
            '--star-delay': `${star.delay}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setExiting(true), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex flex-col items-center overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #0a1730 0%, #030712 65%, #000000 100%)' }}
      animate={exiting ? { opacity: 0, y: -60 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      onAnimationComplete={() => { if (exiting) onDone(); }}
    >
      <StarLayer stars={FAR_STARS} driftClass="splash-layer-far" />

      <h1
        className="relative select-none font-black uppercase tracking-tight text-white mt-auto mb-auto"
        style={{ fontSize: '2.6rem', opacity: 0.22, letterSpacing: '0.04em' }}
      >
        Фото-Север
      </h1>

      <StarLayer stars={MID_STARS} driftClass="splash-layer-mid" />
      <StarLayer stars={NEAR_STARS} driftClass="splash-layer-near" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end" style={{ height: '42vh', minHeight: 260 }}>
        {/* Большой стеклянный купол, торчащий из-под нижнего края экрана —
            чисто декоративный фон под кнопкой, без своей интерактивности.
            Край купола — размытый, а не чёткая линия: снаружи такой же
            формы лежит увеличенный слой с сильным blur (мягкий ореол), а у
            самого купола граница выцветает через маску вместо обводки. */}
        <div className="absolute inset-x-0 flex justify-center pointer-events-none" style={{ bottom: -DOME_HIDDEN }}>
          <div
            className="absolute rounded-full"
            style={{
              width: DOME_WIDTH + 90,
              maxWidth: 'calc(150vw + 90px)',
              height: DOME_HEIGHT + 90,
              left: '50%',
              top: -45,
              transform: 'translateX(-50%)',
              background: 'rgba(255,255,255,0.05)',
              filter: 'blur(30px)',
            }}
          />
          <div
            className="relative"
            style={{
              width: DOME_WIDTH,
              maxWidth: '150vw',
              height: DOME_HEIGHT,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(28px) saturate(160%)',
              WebkitBackdropFilter: 'blur(28px) saturate(160%)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.28), 0 -30px 70px rgba(0,0,0,0.4)',
              maskImage: 'radial-gradient(ellipse 50% 50% at 50% 50%, black 78%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 50% 50% at 50% 50%, black 78%, transparent 100%)',
              overflow: 'hidden',
            }}
          >
            {/* мягкое синее свечение вдоль дуги купола */}
            <div
              className="absolute rounded-full"
              style={{
                left: '50%', top: 0, width: '70%', height: 90,
                transform: 'translate(-50%, -35%)',
                background: 'radial-gradient(ellipse, rgba(59,130,246,0.4) 0%, rgba(59,130,246,0) 72%)',
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
