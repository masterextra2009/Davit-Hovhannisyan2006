import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ArrowLeft, CheckCircle2, X, FileText } from 'lucide-react';
import {
  IconDocument,
  IconUpload,
  IconSettings,
  IconZap,
} from './icons3d/OnboardingIcons';

interface Props {
  onDone: () => void;
}

const SLIDES = [
  {
    id: 'welcome',
    tag: 'Копи-центр онлайн',
    title: ['Печатаем всё.', 'Мгновенно.'],
    desc: 'Загрузи файл — мы напечатаем и сообщим о готовности. Без звонков и очередей.',
    Icon3D: IconDocument,
    cta: 'Начать',
  },
  {
    id: 'upload',
    tag: 'Шаг 1 из 3',
    title: ['Загрузи', 'файл'],
    desc: 'PDF, фото, документы, архивы — до 100 МБ. Поддерживаем все форматы.',
    Icon3D: IconUpload,
    cta: 'Далее',
  },
  {
    id: 'options',
    tag: 'Шаг 2 из 3',
    title: ['Настрой', 'параметры'],
    desc: 'Выбери формат, цвет, переплёт и количество копий — всё онлайн.',
    Icon3D: IconSettings,
    cta: 'Далее',
  },
  {
    id: 'done',
    tag: 'Шаг 3 из 3',
    title: ['Получи', 'заказ'],
    desc: 'Оплата онлайн, push-уведомление когда готово. Забери на Северном шоссе, 18.',
    Icon3D: IconZap,
    cta: 'Войти и начать',
  },
] as const;

// ── Aurora canvas ──────────────────────────────────────────────────────────────
function useAurora(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d')!;
    let raf = 0;

    const orbs = [
      { x: .2, y: .15, r: .55, h: 260, s: .00035 },
      { x: .8, y: .8,  r: .60, h: 320, s: .00028 },
      { x: .5, y: .45, r: .42, h: 200, s: .00045 },
      { x: .1, y: .72, r: .38, h: 180, s: .00055 },
    ];

    const pts = Array.from({ length: 55 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - .5) * .0006,
      vy: (Math.random() - .5) * .0006,
      a: Math.random() * .5,
      r: Math.random() * 1.3 + .3,
    }));

    let t = 0;

    const draw = () => {
      const { width: W, height: H } = cvs;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#07070f';
      ctx.fillRect(0, 0, W, H);

      orbs.forEach((o, i) => {
        const ox = (o.x + Math.sin(t * o.s * 7 + i) * .13) * W;
        const oy = (o.y + Math.cos(t * o.s * 5 + i) * .15) * H;
        const rad = o.r * Math.min(W, H);
        const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad);
        const a = .12 + .04 * Math.sin(t * o.s * 3 + i);
        g.addColorStop(0, `hsla(${o.h},80%,65%,${a})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });

      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,140,255,${p.a * .45})`;
        ctx.fill();
      });

      t++;
      raf = requestAnimationFrame(draw);
    };

    const resize = () => {
      const rect = cvs.parentElement!.getBoundingClientRect();
      cvs.width = rect.width;
      cvs.height = rect.height;
    };
    resize();
    window.addEventListener('resize', resize);
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef]);
}

// ── Slide component ────────────────────────────────────────────────────────────
const Slide: React.FC<{ slide: typeof SLIDES[number]; dir: number }> = ({ slide, dir }) => {
  const Icon3D = slide.Icon3D;
  return (
    <motion.div
      key={slide.id}
      initial={{ x: dir * 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: dir * -60, opacity: 0 }}
      transition={{ duration: .42, ease: [.16, 1, .3, 1] }}
      className="flex flex-col items-center text-center px-6 pt-2 pb-4 w-full"
    >
      {/* 3D Icon */}
      <motion.div
        initial={{ scale: .7, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: .1, duration: .55, ease: [.16, 1, .3, 1] }}
        className="mb-6"
        style={{ filter: 'drop-shadow(0 16px 32px rgba(0,0,0,0.2))' }}
      >
        <Icon3D size={96} />
      </motion.div>

      {/* Tag */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: .18, duration: .4 }}
        className="mb-3 px-3 py-1 rounded-full text-[11px] font-semibold tracking-widest uppercase"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        {slide.tag}
      </motion.div>

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: .24, duration: .45 }}
        className="text-[32px] font-black leading-[1.05] tracking-tight mb-4"
      >
        <span className="text-white">{slide.title[0]}</span>
        <br />
        <span
          style={{
            background: 'linear-gradient(135deg,#a5b4fc,#f472b6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {slide.title[1]}
        </span>
      </motion.h2>

      {/* Desc */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: .32, duration: .4 }}
        className="text-[14px] leading-relaxed"
        style={{ color: 'rgba(255,255,255,0.42)' }}
      >
        {slide.desc}
      </motion.p>
    </motion.div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
export const OnboardingScreen: React.FC<Props> = ({ onDone }) => {
  const [cur, setCur] = useState(0);
  const [dir, setDir] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useAurora(canvasRef);

  // Touch / mouse swipe
  const startX = useRef(0);
  const onPointerDown = (e: React.PointerEvent) => { startX.current = e.clientX; };
  const onPointerUp = (e: React.PointerEvent) => {
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 44) dx < 0 ? goNext() : goPrev();
  };

  const goNext = useCallback(() => {
    if (cur < SLIDES.length - 1) { setDir(1); setCur(c => c + 1); }
    else finish();
  }, [cur]);

  const goPrev = useCallback(() => {
    if (cur > 0) { setDir(-1); setCur(c => c - 1); }
  }, [cur]);

  const finish = () => {
    localStorage.setItem('sever18_onboarded', '1');
    onDone();
  };

  const slide = SLIDES[cur];

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: '#07070f' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {/* Aurora background */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Skip button */}
      <button
        onClick={finish}
        className="absolute top-5 right-5 z-10 flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-1.5 transition-all"
        style={{
          color: 'rgba(255,255,255,0.35)',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        Пропустить <X size={12} />
      </button>

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-2.5 mb-8">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.45)' }}
        >
          <FileText size={17} color="white" strokeWidth={2} />
        </div>
        <div>
          <div className="text-[14px] font-bold text-white tracking-wide">Фото-Север</div>
          <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.32)' }}>Северное шоссе, 18</div>
        </div>
      </div>

      {/* Slides */}
      <div className="relative z-10 w-full max-w-[320px] overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <Slide key={slide.id} slide={slide} dir={dir} />
        </AnimatePresence>
      </div>

      {/* Bottom: dots + buttons */}
      <div className="relative z-10 w-full max-w-[320px] px-6 mt-6 flex flex-col gap-4">

        {/* Dots */}
        <div className="flex items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === cur ? 22 : 6, opacity: i === cur ? 1 : .3 }}
              transition={{ duration: .35, ease: [.16, 1, .3, 1] }}
              className="h-[5px] rounded-full cursor-pointer"
              style={{ background: i === cur ? '#818cf8' : 'rgba(255,255,255,0.4)' }}
              onClick={() => { setDir(i > cur ? 1 : -1); setCur(i); }}
            />
          ))}
        </div>

        {/* CTA button */}
        <motion.button
          whileTap={{ scale: .97 }}
          onClick={goNext}
          className="w-full flex items-center justify-between rounded-2xl px-5 py-4 text-[15px] font-bold text-white border-none cursor-pointer"
          style={{
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)',
            boxShadow: '0 8px 28px rgba(99,102,241,0.4)',
          }}
        >
          <span>{slide.cta}</span>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            {cur === SLIDES.length - 1
              ? <CheckCircle2 size={16} color="white" />
              : <ArrowRight size={16} color="white" />
            }
          </div>
        </motion.button>

        {/* Back button */}
        {cur > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={goPrev}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[14px] font-semibold cursor-pointer transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            <ArrowLeft size={15} /> Назад
          </motion.button>
        )}
      </div>
    </div>
  );
};
