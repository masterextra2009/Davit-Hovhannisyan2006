/**
 * Кнопка «Позвонить через Максима» на карточке готового заказа (вкладка «К выдаче»).
 * Максим звонит клиенту: «заказ готов, когда заберёте?» — итог разговора
 * (придёт / не взял / отменить) потом появляется прямо здесь, под кнопкой.
 */
import React, { useState } from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import { maxim, MaximOrderCall } from '../api/v2';

const mskTime = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Цвет итога: придёт — зелёный, отказ/неверный номер — красный, не взял — жёлтый.
const RESULT_TONE = {
  good: { bg: '#16a34a', border: '#4ade80', text: '#ffffff', icon: '✅' },
  bad: { bg: '#dc2626', border: '#f87171', text: '#ffffff', icon: '❌' },
  missed: { bg: '#f59e0b', border: '#fcd34d', text: '#1c1917', icon: '⏳' },
};

export function MaximCallButton({ orderId, hasPhone, call, onCall }: {
  orderId: string;
  hasPhone: boolean;
  call?: MaximOrderCall;
  onCall: (call: MaximOrderCall) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const calling = starting || call?.state === 'calling';

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const r = await maxim.callClient(orderId);
      onCall(r.call);
    } catch (e: any) {
      setError(e?.message || 'Не удалось позвонить');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* rounded-[12px], а не rounded-xl: в тёмной админке .rounded-xl перекрашивается
          в серое стекло с !important (index.css) — кнопка была бы серой. Яркая всегда
          (Давид, 10.10), даже без номера — тогда просто не нажимается. */}
      <button
        type="button"
        onClick={start}
        disabled={calling || !hasPhone}
        title={hasPhone ? 'Максим позвонит клиенту и спросит, когда он заберёт заказ' : 'У клиента нет номера телефона'}
        className="w-full flex items-center justify-center gap-2 rounded-[12px] px-3 py-2.5 text-[13px] font-extrabold text-white bg-gradient-to-r from-emerald-500 to-lime-400 shadow-lg shadow-emerald-500/30 hover:brightness-110 transition disabled:cursor-not-allowed cursor-pointer"
      >
        {calling ? <Loader2 className="w-4 h-4 animate-spin" /> : hasPhone ? <Phone className="w-4 h-4" /> : <PhoneOff className="w-4 h-4" />}
        {calling ? 'Максим звонит…' : !hasPhone ? 'Нет номера телефона' : call ? 'Позвонить ещё раз' : 'Позвонить через Максима'}
      </button>
      {error && <p className="text-[12px] font-bold text-rose-500">{error}</p>}
      {/* Итог звонка — крупной цветной плашкой, чтобы было видно издалека (Давид, 11.10).
          Цвета через style: в тёмной админке классы bg-emerald/rounded-xl перекрашиваются. */}
      {call && call.state !== 'calling' && (() => {
        const raw = call.state === 'answered' ? (call.result || 'поговорили') : 'не взял трубку';
        // Голое «отменить» читается как кнопка — пишем, что это слова клиента.
        const result = /^\s*отменить\.?\s*$/i.test(raw) ? 'отказался — отменить заказ' : raw;
        const tone = call.state !== 'answered' ? RESULT_TONE.missed
          : /отмен|не нуж|неверн/i.test(result) ? RESULT_TONE.bad
          : /не понял|итога нет|разговора не было/i.test(result) ? RESULT_TONE.missed
          : RESULT_TONE.good;
        return (
          <div className="rounded-[12px] px-3 py-2.5" style={{ background: tone.bg, border: `2px solid ${tone.border}`, color: tone.text }}>
            <div className="text-[12px] font-bold" style={{ opacity: 0.85 }}>
              📞 Максим{call.auto ? ' (авто)' : ''} · {mskTime(call.doneAt || call.at)}
            </div>
            <div className="text-[17px] leading-snug font-black mt-0.5">
              {tone.icon} {result.charAt(0).toUpperCase() + result.slice(1)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
