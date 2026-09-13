/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Как новость выглядит у клиента в телефоне.
 *
 * Зачем это в админке: новости показывает только мобильное приложение — на
 * сайте их нет ни на одной странице. Значит, выложив новость, Давид никак не
 * мог увидеть, что именно получилось: оставалось ставить наугад и потом
 * искать свой же баннер в приложении. Этот компонент повторяет карточку из
 * приложения (PromoStrip.tsx в проекте sever18-app) — те же скругления,
 * отступы, размеры и та же формула пропорций.
 *
 * ВАЖНО: формула ниже должна совпадать с resolveMedia в PromoStrip.tsx.
 * Проекты разные, общего кода у них нет, поэтому правку придётся вносить в
 * двух местах — иначе превью начнёт врать, а это хуже, чем его отсутствие.
 */

// Самая «узкая» пропорция, которую разрешаем карточке. Ширина к высоте 0.62:
// высота не более чем в полтора с небольшим раза больше ширины. Иначе
// вертикальный снимок с телефона (9:16) занял бы почти весь экран.
const MIN_RATIO = 0.62;

// Для новостей, заведённых до того, как админка начала замерять размеры файла.
const FALLBACK_RATIO = 16 / 9;

export type PreviewPromo = {
  title?: string;
  body?: string;
  imageUrl?: string;
  mediaType?: 'image' | 'video' | '';
  mediaWidth?: number;
  mediaHeight?: number;
};

export function resolvePromoMedia(promo: PreviewPromo): { ratio: number; fit: 'cover' | 'contain' } {
  const w = promo.mediaWidth;
  const h = promo.mediaHeight;
  if (!w || !h || w <= 0 || h <= 0) {
    return { ratio: FALLBACK_RATIO, fit: 'contain' };
  }
  const natural = w / h;
  if (natural < MIN_RATIO) {
    // Коробка уже не повторяет форму файла, поэтому только вписывание:
    // обрезка тут превратила бы ограничение высоты в ту же самую потерю краёв.
    return { ratio: MIN_RATIO, fit: 'contain' };
  }
  return { ratio: natural, fit: 'cover' };
}

/**
 * @param width ширина карточки в пикселях. Размеры шрифтов и отступы
 *   пересчитываются от неё, чтобы маленькая карточка в списке выглядела как
 *   уменьшенная копия большой, а не как та же карточка с гигантским текстом.
 */
export function PromoCardPreview({ promo, width = 260 }: { promo: PreviewPromo; width?: number }) {
  const plan = resolvePromoMedia(promo);
  // 260 — «натуральная величина», при которой размеры совпадают с телефонными.
  const k = width / 260;
  const px = (n: number) => `${Math.round(n * k * 10) / 10}px`;

  const hasText = Boolean(promo.title || promo.body);

  return (
    <div
      style={{ width, borderRadius: px(18) }}
      className="overflow-hidden bg-white border border-black/10 shrink-0"
    >
      {promo.imageUrl ? (
        promo.mediaType === 'video' ? (
          <video
            src={promo.imageUrl}
            muted
            playsInline
            preload="metadata"
            style={{ aspectRatio: `${plan.ratio}`, objectFit: plan.fit }}
            className="w-full block bg-[#e7e9ee]"
          />
        ) : (
          <img
            src={promo.imageUrl}
            alt=""
            style={{ aspectRatio: `${plan.ratio}`, objectFit: plan.fit }}
            className="w-full block bg-[#e7e9ee]"
          />
        )
      ) : null}

      {hasText && (
        <div style={{ padding: px(14), gap: px(4) }} className="flex flex-col">
          <span
            style={{ fontSize: px(11), letterSpacing: px(1.1) }}
            className="font-extrabold text-[#f0621f]"
          >
            АКЦИЯ
          </span>
          {promo.title ? (
            <p
              style={{ fontSize: px(16.5), lineHeight: px(22) }}
              className="font-bold text-[#16202e] m-0 line-clamp-2"
            >
              {promo.title}
            </p>
          ) : null}
          {promo.body ? (
            <p
              style={{ fontSize: px(14), lineHeight: px(20) }}
              className="text-[#55657c] m-0 line-clamp-3 whitespace-pre-wrap"
            >
              {promo.body}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
