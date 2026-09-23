import React, { useEffect, useRef, useState } from 'react';
import { formatVoiceLength } from '../utils/chatVoice';

// Проигрыватель голосовых в чате админки — вариант «Жидкое стекло»
// (Давид выбрал 23.09.2026 из шести): матовая капля, за ней цветные пятна
// дышат в такт голосу, плавная волна строится из самой записи.
//
// Звук играет обычный <audio> (для data:audio/mp4 в CSP открыт media-src
// data:), а громкость для пятен снимает анализатор Web Audio. Волну
// рисуем, раскодировав запись: base64 разбираем сами, без fetch — fetch
// data:-ссылки CSP (connect-src) не пустит.

const BARS = 56;
const RATES = [1, 1.5, 2];

let sharedCtx: AudioContext | null = null;
const getCtx = () => {
  if (!sharedCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new Ctx();
  }
  return sharedCtx;
};

// Одновременно играет только одно голосовое.
let stopCurrent: (() => void) | null = null;

async function loadPeaks(src: string): Promise<number[]> {
  let bytes: ArrayBuffer;
  if (src.startsWith('data:')) {
    const bin = atob(src.substring(src.indexOf(',') + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    bytes = arr.buffer;
  } else {
    bytes = await (await fetch(src)).arrayBuffer();
  }
  const buf = await getCtx().decodeAudioData(bytes);
  const d = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(d.length / BARS));
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    let s = 0;
    for (let j = i * step; j < (i + 1) * step && j < d.length; j++) s += d[j] * d[j];
    out.push(Math.sqrt(s / step));
  }
  const max = Math.max(...out) || 1;
  return out.map(v => Math.pow(v / max, 0.7));
}

// Пока запись не раскодирована (или не раскодировалась) — спокойная
// заглушка-волна, чтобы капля не была пустой.
const FALLBACK = Array.from({ length: BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.55)));

export default function VoiceGlass({ src, seconds }: { src: string; seconds: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blob1 = useRef<HTMLDivElement>(null);
  const blob2 = useRef<HTMLDivElement>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const peaks = useRef<number[]>(FALLBACK);
  const level = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [rate, setRate] = useState(1);

  const duration = () => {
    const d = audioRef.current?.duration;
    return d && isFinite(d) ? d : seconds || 1;
  };

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d');
    if (!g) return;
    const pk = peaks.current, mid = h / 2;
    const a = audioRef.current;
    const pr = a ? Math.min(1, a.currentTime / duration()) : 0;
    g.clearRect(0, 0, w, h);
    const path = () => {
      g.beginPath();
      g.moveTo(0, mid);
      pk.forEach((v, i) => {
        const x = (i / (pk.length - 1)) * w, y = mid - v * mid * 0.9 - dpr;
        const px = ((i - 0.5) / (pk.length - 1)) * w;
        if (i) g.quadraticCurveTo(px, y, x, y); else g.lineTo(x, y);
      });
      for (let i = pk.length - 1; i >= 0; i--) g.lineTo((i / (pk.length - 1)) * w, mid + pk[i] * mid * 0.9 + dpr);
      g.closePath();
    };
    path();
    g.fillStyle = 'rgba(128,140,160,.35)';
    g.fill();
    g.save();
    g.beginPath(); g.rect(0, 0, w * pr, h); g.clip();
    path();
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#39d0c0'); gr.addColorStop(1, '#7c8dff');
    g.fillStyle = gr; g.shadowColor = '#39d0c0'; g.shadowBlur = 10 * dpr;
    g.fill();
    g.restore();
    if (pr > 0) {
      g.beginPath(); g.arc(w * pr, mid, 4.5 * dpr, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 12 * dpr; g.fill(); g.shadowBlur = 0;
    }
  };

  // Раскодировать запись для волны.
  useEffect(() => {
    let alive = true;
    loadPeaks(src).then(p => { if (alive) { peaks.current = p; draw(); } }).catch(() => { /* останется заглушка */ });
    return () => { alive = false; };
  }, [src]);

  // Кадры анимации — только пока играет; на паузе одна перерисовка.
  useEffect(() => {
    draw();
    if (!playing) {
      level.current = 0;
      if (blob1.current) blob1.current.style.transform = '';
      if (blob2.current) blob2.current.style.transform = '';
      return;
    }
    let raf = 0;
    const td = new Float32Array(512);
    const tick = () => {
      const an = analyser.current;
      let l = 0;
      if (an) {
        an.getFloatTimeDomainData(td);
        let s = 0;
        for (let i = 0; i < td.length; i++) s += td[i] * td[i];
        l = Math.min(1, Math.sqrt(s / td.length) * 3.2);
      }
      level.current += (l - level.current) * 0.25;
      const lv = level.current;
      if (blob1.current) blob1.current.style.transform = `scale(${1 + lv * 0.9}) translate(${lv * 14}px,0)`;
      if (blob2.current) blob2.current.style.transform = `scale(${1 + lv * 0.7}) translate(${-lv * 18}px,${-lv * 6}px)`;
      setTime(audioRef.current?.currentTime || 0);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio(src);
    a.preload = 'auto';
    a.onended = () => { setPlaying(false); a.currentTime = 0; setTime(0); setStarted(false); draw(); };
    a.onpause = () => setPlaying(false);
    a.onplay = () => setPlaying(true);
    audioRef.current = a;
    try {
      const ctx = getCtx();
      const an = ctx.createAnalyser();
      an.fftSize = 512; an.smoothingTimeConstant = 0.72;
      ctx.createMediaElementSource(a).connect(an);
      an.connect(ctx.destination);
      analyser.current = an;
    } catch { /* без анализатора звук всё равно идёт, просто пятна не дышат */ }
    return a;
  };

  const toggle = () => {
    const a = ensureAudio();
    if (!a.paused) { a.pause(); return; }
    stopCurrent?.();
    stopCurrent = () => a.pause();
    getCtx().resume().catch(() => {});
    a.playbackRate = rate;
    setStarted(true);
    a.play().catch(() => setPlaying(false));
  };

  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const a = ensureAudio();
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration();
    setStarted(true);
    setTime(a.currentTime);
    draw();
  };

  const nextRate = () => {
    const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  };

  return (
    <div className="vglass">
      <div ref={blob1} className="vglass-blob vglass-blob--1" />
      <div ref={blob2} className="vglass-blob vglass-blob--2" />
      <div className={`vglass-pill${playing ? ' is-playing' : ''}`}>
        <button type="button" className="vglass-btn" onClick={toggle} aria-label={playing ? 'Пауза' : 'Прослушать голосовое'}>
          <span className="vglass-ico">
            <svg className="pl" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
            <svg className="pa" viewBox="0 0 24 24"><rect fill="currentColor" x="6" y="5" width="4.2" height="14" rx="1.4" /><rect fill="currentColor" x="13.8" y="5" width="4.2" height="14" rx="1.4" /></svg>
          </span>
        </button>
        <canvas ref={canvasRef} className="vglass-wave" onClick={seek} />
        <div className="vglass-side">
          <span className="vglass-time">{formatVoiceLength(Math.round(started ? time : duration()))}</span>
          <button type="button" className="vglass-rate" onClick={nextRate}>{rate === 1.5 ? '1,5' : rate}×</button>
        </div>
      </div>
    </div>
  );
}
