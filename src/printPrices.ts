/**
 * Цены печати на сайте (17.10.2026): их меняет Давид в админке («Цены
 * печати»), хранит сервер (misc.php?action=prices). Сайт при открытии
 * берёт их с сервера; пока не взял — показывает последние известные
 * (из памяти браузера) или цены по умолчанию. Сумму к оплате всё равно
 * считает сервер (_pricing.php) — здесь цены только для показа.
 *
 * Ключи и цены по умолчанию — те же, что PRINT_PRICES_DEFAULT в
 * server/api/v2/_pricing.php.
 */
import { useSyncExternalStore } from 'react';
import { prices as pricesApi, PrintPrices } from './api/v2';

export const PRINT_PRICES_DEFAULT = {
  photo_10x15: 20,
  photo_polaroid: 30,
  photo_13x18: 50,
  photo_15x21: 70,
  photo_20x30: 100,
  photo_30x40: 250,
  collage_plain: 65,
  collage_photo: 100,
  a4_bw: 20,
  a4_color_light: 25,
  a4_color_full: 65,
  a3_photo: 250,
  a3_bw_80: 70,
  a3_bw_200: 100,
  a3_color_80: 100,
  a3_color_200: 150,
  staple: 15,
  file_a4: 5,
  file_a3: 10,
  spring_metal_50: 350,
  spring_metal_more: 450,
  spring_plastic_50: 250,
  spring_plastic_90: 350,
  spring_plastic_more: 450,
  hard_cover: 450,
};
export type PrintPriceKey = keyof typeof PRINT_PRICES_DEFAULT;

const STORAGE_KEY = 'sever18_print_prices';

/** Только известные ключи и целые цены от 1 ₽ — остальное по умолчанию. */
function merge(raw: unknown): typeof PRINT_PRICES_DEFAULT {
  const out = { ...PRINT_PRICES_DEFAULT };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(out) as PrintPriceKey[]) {
      const v = Number((raw as PrintPrices)[key]);
      if (Number.isFinite(v) && v >= 1) out[key] = Math.round(v);
    }
  }
  return out;
}

let current = (() => {
  try {
    return merge(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return { ...PRINT_PRICES_DEFAULT };
  }
})();
const listeners = new Set<() => void>();

/** Цена по ключу, ₽. */
export function price(key: PrintPriceKey): number {
  return current[key];
}

/** Фото одного размера ('10x15', 'polaroid', …); незнакомый размер — как 10×15. */
export function photoPrice(size?: string): number {
  const key = `photo_${size || '10x15'}` as PrintPriceKey;
  return key in current ? current[key] : current.photo_10x15;
}

/** Цветная страница А4 по заливке чернилами: до 20% — «немного цвета». */
export function colorFillPrice(pct: number): number {
  return pct <= 20 ? current.a4_color_light : current.a4_color_full;
}

/** Лист А3: фото или чертёж (ч/б или цвет, 80 или 200 г/м²). */
export function a3SheetPrice(file: { a3Kind?: string; printColor?: string; a3PaperWeight?: string }): number {
  if (file.a3Kind === 'photo') return current.a3_photo;
  const color = (file.printColor || 'bw') === 'color' ? 'color' : 'bw';
  const weight = file.a3PaperWeight === '200' ? '200' : '80';
  return current[`a3_${color}_${weight}` as PrintPriceKey];
}

/** Отделка за одну копию — как binding_fee_per_copy на сервере. */
export function bindingFeePerCopy(binding: string, totalPages: number, a3 = false): number {
  if (binding === 'staple') return current.staple;
  if (binding === 'file') return a3 ? current.file_a3 : current.file_a4;
  if (binding === 'spring_metal') return totalPages <= 50 ? current.spring_metal_50 : current.spring_metal_more;
  if (binding === 'spring_plastic') {
    return totalPages <= 50 ? current.spring_plastic_50 : totalPages <= 90 ? current.spring_plastic_90 : current.spring_plastic_more;
  }
  if (binding === 'hard_cover') return current.hard_cover;
  return 0;
}

/** Взять свежие цены с сервера. Ошибка — не беда: остаются прежние. */
export async function loadPrintPrices(): Promise<void> {
  try {
    const { prices } = await pricesApi.get();
    current = merge(prices);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* память браузера недоступна — не страшно */ }
    listeners.forEach((l) => l());
  } catch {
    /* сервер не ответил — показываем последние известные цены */
  }
}

/**
 * Перерисовать экран, когда пришли цены с сервера. Вызывать в начале
 * компонента, который показывает цены; возвращает действующие цены.
 */
export function usePrintPrices() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
    () => current,
  );
}
