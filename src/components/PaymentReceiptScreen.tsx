/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Printer, AlertCircle, FileCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { db, doc, getDoc } from '../firebase';
import { Order } from '../types';
import { trackAnalyticsEvent } from '../utils';

type DocCheckItem = { id: string; label: string; ok: boolean; issue: string };

interface Props {
  orderId: string;
  onClose: () => void;
}

const photoSizePrices: Record<string, number> = {
  '10x15': 20, polaroid: 30, '13x18': 50, '15x21': 70, '20x30': 100, '30x40': 250,
};
const colorFillPrice = (pct: number) => (pct <= 20 ? 25 : pct <= 60 ? 40 : 65);

function filePrice(f: Order['files'][number]): number {
  const isPhoto = f.paperType === 'photo';
  const isA3 = f.format === 'a3';
  const isBinding = f.format === 'binding';
  const copies = f.fileCopies || 1;
  const pages = f.pageCount || 1;
  if (isPhoto) return (photoSizePrices[f.photoSize || '10x15'] || 20) * copies;
  if (isBinding) {
    if (!f.bindingKind) return 0;
    const bindingFee = f.bindingKind === 'spring_metal' ? (pages <= 100 ? 250 : 350) : 100;
    return bindingFee * copies;
  }
  const pp = (f.printColor || 'bw') === 'bw'
    ? (isA3 ? 100 : 20)
    : (isA3 ? 150 : colorFillPrice(f.colorFillPercent ?? 50));
  return pp * pages * copies;
}

export const PaymentReceiptScreen: React.FC<Props> = ({ orderId, onClose }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Платная "Проверка фото на документы" (см. handleDocCheckPaidSubmit в
  // Dashboard.tsx) не хранит картинку в заказе — она лежит в sessionStorage
  // на время оплаты. После возврата с ЮKassa запускаем саму проверку прямо
  // здесь и показываем результат вместо/вместе с обычным чеком.
  const [docCheckChecking, setDocCheckChecking] = useState(false);
  const [docCheckResult, setDocCheckResult] = useState<DocCheckItem[] | null>(null);
  const [docCheckError, setDocCheckError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'orders', orderId));
        if (cancelled) return;
        if (snap.exists()) {
          const loadedOrder = snap.data() as Order;
          setOrder(loadedOrder);
          trackAnalyticsEvent('payment_success');

          if (loadedOrder.notes?.startsWith('Платная проверка фото на документы')) {
            const pendingKey = `doc_check_pending_${orderId}`;
            const stashed = sessionStorage.getItem(pendingKey);
            if (stashed) {
              setDocCheckChecking(true);
              try {
                const { image, docType } = JSON.parse(stashed);
                const res = await fetch('https://sever-18.ru/api/photo-doc-check.php', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ image, docType }),
                });
                const data = await res.json();
                if (!res.ok || data.error) {
                  setDocCheckError(typeof data.error === 'string' ? data.error : 'Не удалось проверить фото');
                } else {
                  setDocCheckResult(data.checks || []);
                }
              } catch {
                setDocCheckError('Не удалось соединиться с сервером проверки');
              } finally {
                sessionStorage.removeItem(pendingKey);
                if (!cancelled) setDocCheckChecking(false);
              }
            } else {
              setDocCheckError('Фото для проверки не найдено (возможно, оплата была на другом устройстве) — напишите нам в чат, поможем.');
            }
          }
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  const orderDate = order?.orderDate ? new Date(order.orderDate) : new Date();
  const dateLabel = orderDate.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });

  return (
    <div className="min-h-dvh w-full flex items-center justify-center py-10 px-4" style={{ background: '#eef0f3' }}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm relative"
      >
        {/* Сам чек — белая "бумага" с зубчатым краем сверху и снизу */}
        <div
          className="bg-white text-slate-900 shadow-2xl relative"
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",
          }}
        >
          {/* Зубчатый верхний край */}
          <div
            className="h-3 w-full"
            style={{
              backgroundImage:
                'linear-gradient(-45deg, white 6px, transparent 0), linear-gradient(45deg, white 6px, #eef0f3 0)',
              backgroundPosition: 'left top',
              backgroundSize: '12px 12px',
              backgroundRepeat: 'repeat-x',
              transform: 'translateY(-1px)',
            }}
          />

          <div className="px-7 pt-2 pb-8">
            {/* Логотип / шапка */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-11 h-11 rounded-full bg-slate-900 flex items-center justify-center mb-2.5">
                <Printer className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-sm font-bold uppercase tracking-widest">Фото-Север</h1>
              <p className="text-[11px] text-slate-500 mt-0.5">Северное шоссе, 18</p>
            </div>

            <div className="border-t border-dashed border-slate-300 my-4" />

            {loading ? (
              <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">Загружаем данные заказа...</span>
              </div>
            ) : notFound || !order ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-sm font-bold">Оплата прошла успешно</p>
                <p className="text-[12px] text-slate-500 mt-1">Заказ {orderId}</p>
              </div>
            ) : (
              <>
                {/* Статус оплачено */}
                <div className="flex flex-col items-center text-center mb-5">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                  </div>
                  <p className="text-sm font-bold text-emerald-600 uppercase tracking-wide">Оплачено</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{dateLabel}</p>
                </div>

                <div className="border-t border-dashed border-slate-300 my-4" />

                {/* Номер заказа */}
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-slate-500">Заказ</span>
                  <span className="font-bold">{order.id}</span>
                </div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-slate-500">Клиент</span>
                  <span className="font-bold text-right max-w-[60%] truncate">{order.userName}</span>
                </div>
                {order.transactionId && (
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-slate-500">Транзакция</span>
                    <span className="font-bold text-right max-w-[60%] truncate">{order.transactionId}</span>
                  </div>
                )}

                <div className="border-t border-dashed border-slate-300 my-4" />

                {/* Позиции */}
                <div className="space-y-2 mb-2">
                  {order.notes?.startsWith('Платная проверка фото на документы') ? (
                    <div className="flex justify-between gap-3 text-[12px]">
                      <span className="text-slate-600 truncate">Проверка фото на документы</span>
                      <span className="font-bold shrink-0">{order.totalCost} ₽</span>
                    </div>
                  ) : (
                    order.files.map((f, i) => (
                      <div key={f.id || i} className="flex justify-between gap-3 text-[12px]">
                        <span className="text-slate-600 truncate">{i + 1}. {f.name}</span>
                        <span className="font-bold shrink-0">{filePrice(f)} ₽</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-dashed border-slate-300 my-4" />

                {order.promoCode && (
                  <div className="flex justify-between text-[12px] mb-1 text-emerald-600">
                    <span>Промокод {order.promoCode}</span>
                    <span className="font-bold">-{order.promoDiscount}%</span>
                  </div>
                )}

                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs font-bold uppercase tracking-wide">Итого</span>
                  <span className="text-xl font-black">{order.totalCost} ₽</span>
                </div>

                {order.notes?.startsWith('Платная проверка фото на документы') && (
                  <>
                    <div className="border-t border-dashed border-slate-300 my-4" />
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <FileCheck className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Результат проверки</span>
                      </div>
                      {docCheckChecking ? (
                        <div className="flex items-center gap-2 text-slate-500 text-[12px] py-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Проверяем фото...
                        </div>
                      ) : docCheckError ? (
                        <p className="text-[12px] text-rose-600 font-bold bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">{docCheckError}</p>
                      ) : docCheckResult ? (
                        docCheckResult.map(check => (
                          <div key={check.id} className={`flex items-start gap-2 p-2.5 rounded-xl border text-left ${check.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                            {check.ok ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p className={`text-[11px] font-black ${check.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{check.label}</p>
                              {check.issue && <p className="text-[11px] text-slate-500 mt-0.5">{check.issue}</p>}
                            </div>
                          </div>
                        ))
                      ) : null}
                    </div>
                  </>
                )}

                <div className="border-t border-dashed border-slate-300 my-4" />

                {/* Штрихкод-декор */}
                <div className="flex flex-col items-center gap-1.5 pt-1">
                  <div className="flex items-center gap-[1.5px] h-6 opacity-70">
                    {[1,3,1,2,4,1,2,3,1,4,2,1,3,1,2,4,1,3,2,1,4,1,3,1,2,1,3,4].map((w, i) => (
                      <div key={i} className="bg-slate-900 h-full" style={{ width: `${w * 0.85}px` }} />
                    ))}
                  </div>
                  <span className="text-[9px] tracking-widest text-slate-400">* {order.id} *</span>
                </div>
              </>
            )}
          </div>

          {/* Зубчатый нижний край */}
          <div
            className="h-3 w-full"
            style={{
              backgroundImage:
                'linear-gradient(-45deg, transparent 6px, white 0), linear-gradient(45deg, #eef0f3 6px, white 0)',
              backgroundPosition: 'left bottom',
              backgroundSize: '12px 12px',
              backgroundRepeat: 'repeat-x',
              transform: 'translateY(1px)',
            }}
          />
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-colors cursor-pointer"
        >
          Перейти в личный кабинет
        </button>
      </motion.div>
    </div>
  );
};
