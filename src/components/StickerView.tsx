import { useEffect, useRef } from 'react';

// Один стикер — любого вида (25.09.2026, общий набор для сайта и приложения):
//  • .json — анимация Google Noto Emoji (Lottie, © Google, CC BY 4.0);
//  • .webm — живой стикер-видео (свои стикеры мастерской);
//  • остальное — картинка.
// Lottie-движок грузится только когда на экране есть такой стикер.

export function StickerView({ src, className, still = false }: { src: string; className?: string; still?: boolean }) {
  if (/\.json(\?|$)/i.test(src)) return <LottieSticker src={src} className={className} still={still} />;
  if (/\.webm(\?|$)/i.test(src)) {
    return still ? (
      <video src={src + '#t=0.1'} className={className} muted playsInline preload="metadata" />
    ) : (
      <video src={src} className={className} autoPlay loop muted playsInline />
    );
  }
  return <img src={src} loading="lazy" className={className} alt="Стикер" />;
}

function LottieSticker({ src, className, still }: { src: string; className?: string; still: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let anim: { destroy: () => void; goToAndStop: (f: number, isFrame: boolean) => void } | null = null;
    let cancelled = false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (cancelled || !box.current) return;
      anim = lottie.loadAnimation({
        container: box.current,
        renderer: 'svg',
        loop: true,
        autoplay: !still && !reduce,
        path: src,
      });
      if (still || reduce) anim.goToAndStop(20, true);
    });
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [src, still]);
  return <div ref={box} className={className} role="img" aria-label="Стикер" />;
}
