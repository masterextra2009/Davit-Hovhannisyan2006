/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('print_shop_theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const glowRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('print_shop_theme', theme);
  }, [theme]);

  // Бесконечное вращение неонового кольца через requestAnimationFrame
  useEffect(() => {
    const spin = () => {
      angleRef.current += 1.5;
      const deg = `${angleRef.current}deg`;
      if (glowRef.current) glowRef.current.style.setProperty('--ng', deg);
      if (lineRef.current) lineRef.current.style.setProperty('--nl', deg);
      rafRef.current = requestAnimationFrame(spin);
    };
    rafRef.current = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const isDark = theme === 'dark';

  return (
    <button
      id="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label="Переключение темы"
      title={isDark ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
      style={{
        position: 'relative',
        width: 76,
        height: 34,
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        background: 'transparent',
      }}
    >
      {/* Вращающееся неоновое свечение по контуру */}
      <div
        ref={glowRef}
        style={{
          position: 'absolute',
          inset: -6,
          borderRadius: 999,
          background: isDark
            ? `conic-gradient(from var(--ng,0deg), transparent 0deg, rgba(180,100,255,0.8) 60deg, rgba(255,255,255,0.9) 90deg, rgba(180,100,255,0.8) 120deg, transparent 180deg, transparent 360deg)`
            : `conic-gradient(from var(--ng,0deg), transparent 0deg, rgba(255,200,50,0.7) 60deg, rgba(255,255,200,0.9) 90deg, rgba(255,200,50,0.7) 120deg, transparent 180deg, transparent 360deg)`,
          filter: 'blur(7px)',
          opacity: 0.75,
          pointerEvents: 'none',
        }}
      />

      {/* Основное тело переключателя */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          background: isDark
            ? 'linear-gradient(145deg,#1a0a22,#0d0512)'
            : 'linear-gradient(145deg,#e8eef5,#d0dce8)',
          border: isDark ? '1px solid rgba(200,150,255,0.3)' : '1px solid rgba(255,255,255,0.8)',
          boxShadow: isDark
            ? 'inset 0 2px 8px rgba(0,0,0,0.8), inset 0 -1px 2px rgba(200,150,255,0.1)'
            : 'inset 0 2px 8px rgba(100,120,150,0.2), inset 0 -1px 2px rgba(255,255,255,0.8)',
          overflow: 'hidden',
          transition: 'all 0.5s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '50%',
            right: 9,
            transform: 'translateY(-50%)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'rgba(200,150,255,0.7)',
            opacity: isDark ? 1 : 0,
            transition: 'opacity 0.4s',
            pointerEvents: 'none',
          }}
        >OFF</span>
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: 9,
            transform: 'translateY(-50%)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#475569',
            opacity: isDark ? 0 : 1,
            transition: 'opacity 0.4s',
            pointerEvents: 'none',
          }}
        >ON</span>
      </div>

      {/* Тонкая вращающаяся линия свечения по контуру */}
      <div
        ref={lineRef}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          background: isDark
            ? `conic-gradient(from var(--nl,0deg), transparent 0deg, transparent 40deg, rgba(220,150,255,0.9) 60deg, rgba(255,255,255,1) 75deg, rgba(220,150,255,0.9) 90deg, transparent 110deg, transparent 360deg)`
            : `conic-gradient(from var(--nl,0deg), transparent 0deg, transparent 40deg, rgba(255,200,50,0.9) 60deg, rgba(255,255,200,1) 75deg, rgba(255,200,50,0.9) 90deg, transparent 110deg, transparent 360deg)`,
          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), white calc(100% - 2px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), white calc(100% - 2px))',
          pointerEvents: 'none',
        }}
      />

      {/* Шарик-переключатель */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: isDark ? 4 : 44,
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: isDark
            ? 'radial-gradient(circle at 35% 30%, rgba(220,180,255,0.4), rgba(100,50,150,0.8))'
            : 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9), rgba(200,220,240,0.8))',
          border: isDark ? '1px solid rgba(200,150,255,0.5)' : '1px solid rgba(255,255,255,0.9)',
          boxShadow: isDark
            ? 'inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.4), 0 0 14px rgba(180,100,255,0.6), 0 4px 10px rgba(0,0,0,0.5)'
            : 'inset 0 2px 4px rgba(255,255,255,0.8), 0 0 10px rgba(255,220,100,0.4), 0 4px 10px rgba(100,120,150,0.3)',
          transition: 'all 0.4s cubic-bezier(0.34,1.4,0.64,1)',
          zIndex: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3, left: 5, right: 5, height: 7,
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.4) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
      </div>
    </button>
  );
}
