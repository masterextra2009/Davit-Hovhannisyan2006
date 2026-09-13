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
 * ВАЖНО: BAND_RATIO ниже обязан совпадать с BAND_RATIO в PromoStrip.tsx, а
 * вписывание (contain) — с resizeMode там же. Проекты разные, общего кода у
 * них нет, поэтому правку придётся вносить в двух местах — иначе превью
 * начнёт врать, а это хуже, чем его отсутствие.
 */

// Пропорции полосы под фото — те же 16:7, что и в приложении. Отсюда же берётся
// рекомендация «1600×700» рядом с выбором файла: снимок такого размера ложится
// в полосу край в край, без полей.
//
// Сначала карточка подстраивалась под пропорции самого снимка — и вертикальное
// фото занимало пол-экрана телефона, отодвигая плитки заказа под нижний край.
// Полоса фиксированной формы это решает, а от обрезки спасает вписывание.
const BAND_RATIO = 16 / 7;

export type PreviewPromo = {
  title?: string;
  body?: string;
  imageUrl?: string;
  mediaType?: 'image' | 'video' | '';
  mediaWidth?: number;
  mediaHeight?: number;
  linkUrl?: string;
};

/**
 * Полоса всегда одной формы, файл всегда вписывается целиком.
 *
 * 'contain', а не 'cover' — принципиально: обрезать нельзя, с этого всё и
 * началось. Снимок не 16:7 покажется с полями по бокам, но верх и низ
 * останутся на месте. Файл ровно 1600×700 заполняет полосу без полей.
 */
export const PROMO_BAND_RATIO = BAND_RATIO;

/**
 * @param width ширина карточки в пикселях. Размеры шрифтов и отступы
 *   пересчитываются от неё, чтобы маленькая карточка в списке выглядела как
 *   уменьшенная копия большой, а не как та же карточка с гигантским текстом.
 */
export function PromoCardPreview({ promo, width = 260 }: { promo: PreviewPromo; width?: number }) {
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
            style={{ aspectRatio: `${BAND_RATIO}`, objectFit: 'contain' }}
            className="w-full block bg-[#e7e9ee]"
          />
        ) : (
          <img
            src={promo.imageUrl}
            alt=""
            style={{ aspectRatio: `${BAND_RATIO}`, objectFit: 'contain' }}
            className="w-full block bg-[#e7e9ee]"
          />
        )
      ) : null}

      {hasText && (
        <div style={{ padding: px(12), gap: px(2) }} className="flex flex-col">
          <span
            style={{ fontSize: px(10.5), letterSpacing: px(1) }}
            className="font-extrabold text-[#f0621f]"
          >
            АКЦИЯ
          </span>
          {promo.title ? (
            <p
              style={{ fontSize: px(15), lineHeight: px(19) }}
              className="font-bold text-[#16202e] m-0 line-clamp-2"
            >
              {promo.title}
            </p>
          ) : null}
          {promo.body ? (
            <p
              style={{ fontSize: px(12.5), lineHeight: px(17) }}
              className="text-[#55657c] m-0 line-clamp-2 whitespace-pre-wrap"
            >
              {promo.body}
            </p>
          ) : null}
          {promo.linkUrl ? (
            /* Та же подпись, что и в приложении: без неё клиент не догадается,
               что карточку можно нажать. */
            <span style={{ fontSize: px(12), marginTop: px(2) }} className="font-bold text-[#f0621f]">
              Подробнее →
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
