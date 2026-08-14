/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

interface ChromaKeyVideoProps {
  src: string;
  className?: string;
  /** Цвет зелёного фона исходного видео (по умолчанию — тот, что реально в файлах). */
  keyColor?: [number, number, number];
  /** Насколько близко к keyColor должен быть пиксель, чтобы стать полностью прозрачным. */
  similarity?: number;
  /** Ширина зоны плавного перехода (в тех же единицах, что similarity) — убирает жёсткий зубчатый край. */
  smoothing?: number;
}

const DEFAULT_KEY: [number, number, number] = [47, 113, 52];
// Видео исходно 960×960, но на экране это маленькая превью-кнопка — рендерим
// канвас в меньшем разрешении, чтобы не гонять покадровый разбор ~1М
// пикселей на JS каждый кадр (это же изображение потом растягивается CSS'ом
// до нужного размера, разница в чёткости на такой кнопке не видна).
const RENDER_SIZE = 320;

/**
 * <video> с исходным зелёным хромакей-фоном, вырезанным в реальном времени
 * через canvas (mp4/webm-контейнеры без честного альфа-канала на видео —
 * см. docs/superpowers/plans/2026-08-14-… — попытка перекодировать в VP9 c
 * альфой не сохранила прозрачность в этой сборке ffmpeg, поэтому кодируем
 * "на лету" в браузере вместо перекодирования файла).
 */
export function ChromaKeyVideo({
  src,
  className,
  keyColor = DEFAULT_KEY,
  similarity = 60,
  smoothing = 24,
}: ChromaKeyVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = RENDER_SIZE;
    canvas.height = RENDER_SIZE;

    const [kr, kg, kb] = keyColor;
    let rafId = 0;
    let lastTime = -1;

    function draw() {
      rafId = requestAnimationFrame(draw);
      if (video!.readyState < 2 || video!.videoWidth === 0) return;
      // Видео идёт с частотой ~24 fps, а requestAnimationFrame — с частотой
      // экрана (обычно 60+): пропускаем повтор одного и того же кадра.
      if (video!.currentTime === lastTime) return;
      lastTime = video!.currentTime;

      ctx!.drawImage(video!, 0, 0, RENDER_SIZE, RENDER_SIZE);
      const frame = ctx!.getImageData(0, 0, RENDER_SIZE, RENDER_SIZE);
      const d = frame.data;
      for (let i = 0; i < d.length; i += 4) {
        const dr = d[i] - kr;
        const dg = d[i + 1] - kg;
        const db = d[i + 2] - kb;
        const diff = Math.sqrt(dr * dr + dg * dg + db * db);
        if (diff < similarity) {
          d[i + 3] = 0;
        } else if (diff < similarity + smoothing) {
          d[i + 3] = Math.round(((diff - similarity) / smoothing) * 255);
        }
      }
      ctx!.putImageData(frame, 0, 0);
    }
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [src, keyColor, similarity, smoothing]);

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{ display: 'none' }}
      />
      <canvas ref={canvasRef} className={className} />
    </>
  );
}
