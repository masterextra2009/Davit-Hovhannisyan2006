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
      {call && call.state !== 'calling' && (
        <p className={`text-[12px] font-bold rounded-lg px-2.5 py-1.5 ${
          call.state === 'answered'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
        }`}>
          📞 {call.auto ? 'авто · ' : ''}{mskTime(call.doneAt || call.at)} — {call.state === 'answered' ? (call.result || 'поговорили') : 'не взял трубку'}
        </p>
      )}
    </div>
  );
}
