/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';

type AiPriceItem = { label: string; qty: number; unitPrice: number; subtotal: number };
type AiPriceBreakdown = { items: AiPriceItem[]; total: number };

/* Карточка расчёта стоимости под ответ ИИ-консультанта — когда клиент
   спрашивает цену, модель (см. system-промпт в api/ai-chat.php) вместо
   голого текста отдаёт структурированные позиции, а тут это красиво
   рисуется с расшифровкой по каждой позиции и итогом внизу. Играет
   пружинный "выпрыг" один раз при появлении. */
export function AiPriceCard({ price }: { price: AiPriceBreakdown }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 210, damping: 18, mass: 0.9 } }}
      className="ai-price-card w-full max-w-[280px] rounded-2xl overflow-hidden border border-indigo-400/25 bg-gradient-to-br from-indigo-950/90 to-slate-950/90 shadow-lg shadow-indigo-950/40"
    >
      <div className="px-3.5 pt-3 pb-2 text-[10px] font-black uppercase tracking-widest text-indigo-300/80">
        Расчёт стоимости
      </div>
      <div className="px-3.5 pb-2.5 space-y-1.5">
        {price.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-white/70 truncate">{item.label} × {item.qty}</span>
            <span className="text-white font-bold shrink-0">{item.subtotal} ₽</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-white/10 bg-white/5">
        <span className="text-[11px] font-black text-white/80 uppercase tracking-wide">Итого</span>
        <span className="text-lg font-black text-white">{price.total} ₽</span>
      </div>
    </motion.div>
  );
}
