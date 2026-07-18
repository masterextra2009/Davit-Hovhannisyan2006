/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Service } from '../types';

/* Те же 3D SVG-иконки-заглушки (когда у услуги нет своего фото/иконки),
   что и в клиентском кабинете (Dashboard.tsx, вкладка "Услуги") — держим
   это в одном месте, чтобы демо-превью не разошлось с реальным видом. */
function get3DIcon(svc: Service) {
  const t = svc.title.toLowerCase();
  const e = svc.emoji;
  if ((t.includes('фото') && (t.includes('докум') || t.includes('документ'))) || e === '🪪' || e === '📷') return (
    <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 8px 16px rgba(168,85,247,0.35))'}}>
      <defs>
        <linearGradient id={`d-g2-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#c084fc"/><stop offset="100%" stopColor="#a855f7"/></linearGradient>
        <linearGradient id={`d-g2t-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#e9d5ff"/><stop offset="100%" stopColor="#c084fc"/></linearGradient>
      </defs>
      <ellipse cx="40" cy="74" rx="20" ry="4" fill="rgba(168,85,247,0.2)"/>
      <rect x="10" y="38" width="60" height="24" rx="10" fill="#7c3aed"/>
      <rect x="10" y="26" width="60" height="20" rx="10" fill={`url(#d-g2-${svc.id})`}/>
      <rect x="28" y="20" width="20" height="10" rx="5" fill={`url(#d-g2t-${svc.id})`}/>
      <circle cx="40" cy="38" r="14" fill="#1e1b4b"/>
      <circle cx="40" cy="38" r="10" fill="#0f0a2e"/>
      <circle cx="40" cy="38" r="6" fill="#312e81"/>
      <circle cx="37" cy="35" r="2.5" fill="rgba(255,255,255,0.45)"/>
      <rect x="54" y="29" width="8" height="5" rx="2.5" fill="rgba(255,255,255,0.5)"/>
      <rect x="14" y="28" width="28" height="5" rx="3" fill="rgba(255,255,255,0.22)"/>
    </svg>
  );
  if (t.includes('переплёт') || t.includes('переплет') || t.includes('binding') || e === '📎' || e === '📚') return (
    <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 8px 16px rgba(249,115,22,0.35))'}}>
      <defs>
        <linearGradient id={`d-g3-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fb923c"/><stop offset="100%" stopColor="#f97316"/></linearGradient>
      </defs>
      <ellipse cx="40" cy="74" rx="20" ry="4" fill="rgba(249,115,22,0.2)"/>
      <rect x="22" y="16" width="44" height="52" rx="4" fill="#fef3c7"/>
      <rect x="14" y="12" width="52" height="54" rx="6" fill={`url(#d-g3-${svc.id})`}/>
      <rect x="56" y="16" width="6" height="46" rx="2" fill="#fef9c3"/>
      <rect x="24" y="24" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/>
      <rect x="24" y="31" width="18" height="2" rx="1" fill="rgba(255,255,255,0.35)"/>
      <rect x="24" y="37" width="22" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
      <circle cx="20" cy="26" r="4" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
      <circle cx="20" cy="36" r="4" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
      <circle cx="20" cy="46" r="4" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
      <circle cx="20" cy="56" r="4" fill="none" stroke="#94a3b8" strokeWidth="2.5"/>
      <rect x="18" y="14" width="28" height="7" rx="3.5" fill="rgba(255,255,255,0.28)"/>
    </svg>
  );
  if (t.includes('скан') || e === '🔍' || e === '📠') return (
    <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 8px 16px rgba(16,185,129,0.35))'}}>
      <defs>
        <linearGradient id={`d-g4-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#34d399"/><stop offset="100%" stopColor="#10b981"/></linearGradient>
      </defs>
      <ellipse cx="40" cy="74" rx="20" ry="4" fill="rgba(16,185,129,0.2)"/>
      <rect x="12" y="50" width="56" height="14" rx="7" fill="#065f46"/>
      <rect x="12" y="44" width="56" height="12" rx="7" fill={`url(#d-g4-${svc.id})`}/>
      <rect x="16" y="16" width="48" height="34" rx="5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="1"/>
      <rect x="22" y="20" width="36" height="26" rx="3" fill="white" opacity="0.9"/>
      <rect x="26" y="24" width="20" height="2" rx="1" fill="#bfdbfe"/>
      <rect x="26" y="28" width="24" height="2" rx="1" fill="#bfdbfe"/>
      <rect x="26" y="32" width="16" height="2" rx="1" fill="#bfdbfe"/>
      <circle cx="62" cy="50" r="4" fill="#34d399"/>
      <rect x="16" y="44" width="26" height="5" rx="2.5" fill="rgba(255,255,255,0.28)"/>
    </svg>
  );
  return (
    <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{filter:'drop-shadow(0 8px 16px rgba(59,130,246,0.35))'}}>
      <defs>
        <linearGradient id={`d-g1-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#60a5fa"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient>
        <linearGradient id={`d-g1t-${svc.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#93c5fd"/><stop offset="100%" stopColor="#60a5fa"/></linearGradient>
      </defs>
      <ellipse cx="40" cy="74" rx="20" ry="4" fill="rgba(59,130,246,0.2)"/>
      <rect x="14" y="36" width="52" height="26" rx="8" fill="#1d4ed8"/>
      <rect x="14" y="28" width="52" height="16" rx="8" fill={`url(#d-g1-${svc.id})`}/>
      <rect x="16" y="26" width="48" height="10" rx="6" fill={`url(#d-g1t-${svc.id})`}/>
      <rect x="30" y="10" width="20" height="24" rx="3" fill="white" opacity="0.95"/>
      <rect x="34" y="14" width="12" height="2" rx="1" fill="#bfdbfe"/>
      <rect x="34" y="18" width="9" height="2" rx="1" fill="#bfdbfe"/>
      <rect x="34" y="22" width="11" height="2" rx="1" fill="#bfdbfe"/>
      <rect x="24" y="38" width="32" height="4" rx="2" fill="rgba(0,0,0,0.2)"/>
      <circle cx="54" cy="32" r="3" fill="#34d399"/>
      <circle cx="62" cy="32" r="3" fill="rgba(255,255,255,0.3)"/>
      <rect x="18" y="28" width="26" height="5" rx="3" fill="rgba(255,255,255,0.28)"/>
    </svg>
  );
}

/* Показывает витрину услуг ровно теми же карточками/классами, что видит
   клиент в личном кабинете (вкладка "Услуги" в Dashboard.tsx) — без
   наклона по мыши и без открытия заказа, это просто предпросмотр для
   администратора, а не полноценная копия кабинета клиента. */
export function ServicesShowcaseDemo({ services }: { services: Service[] }) {
  const [expanded, setExpanded] = useState<Service | null>(null);
  const shown = services.filter(s => s.isActive);

  if (shown.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="font-bold">Витрина услуг пока пуста</p>
        <p className="text-sm mt-1">Скоро здесь появятся все услуги</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
        {shown.map(svc => (
          <motion.div
            key={svc.id}
            layoutId={`svc-demo-card-${svc.id}`}
            className="service-glass-card relative select-none flex flex-col"
          >
            <button
              type="button"
              onClick={() => setExpanded(svc)}
              title="Демо — открыть как видит клиент"
              className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/45 hover:bg-black/60 text-white flex items-center justify-center cursor-pointer backdrop-blur-sm transition-colors"
            >
              👁
            </button>
            <div className="service-glass-card-media h-40 shrink-0 flex items-center justify-center relative">
              <div className="service-card-glow absolute inset-0 pointer-events-none" />
              {svc.imageUrl ? (
                <img src={svc.imageUrl} alt={svc.title}
                  loading="lazy"
                  className="w-full h-full object-cover rounded-t-[20px] relative z-10"
                  style={{ transform: `scale(${svc.imageScale || 1})` }}
                />
              ) : svc.iconUrl ? (
                <img src={svc.iconUrl} alt={svc.title} loading="lazy" className="w-16 h-16 object-contain relative z-10" />
              ) : (
                <div className="relative z-10">{get3DIcon(svc)}</div>
              )}
            </div>
            <div className="px-3.5 pt-3 pb-3.5 flex flex-col flex-1">
              <p className="font-extrabold text-[13px] text-slate-800 dark:text-white mb-0.5 leading-tight">{svc.title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {svc.description?.slice(0, 50)}{(svc.description?.length || 0) > 50 ? '...' : ''}
              </p>
              <p className="font-black text-xl text-indigo-600 dark:text-indigo-400 mt-2 mb-2">{svc.price}</p>
              <button className="btn-3d-choose w-full mt-auto py-2.5 rounded-xl font-black text-xs text-white cursor-default">Заказать →</button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Раскрытие карточки — центрированное окно (не на весь экран, это же
          админка на десктопе, не телефон клиента), та же пружина для
          плавности. Кнопка "Заказать" тут неактивна — только предпросмотр. */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="svc-demo-expanded-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setExpanded(null)}
          >
            {/* Ширина ровно как у экрана iPhone (390px, тот же ориентир, что и
                в остальном проекте, см. feedback-sever18-ios-reference) — это
                демо специально нужно, чтобы админ с широкого ПК-монитора
                увидел, как карточка на самом деле выглядит на телефоне у
                клиента, а не растянутую под десктоп версию. */}
            <motion.div
              layoutId={`svc-demo-card-${expanded.id}`}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-window w-[390px] max-w-[calc(100vw-2rem)] overflow-hidden flex flex-col max-h-[85vh] relative"
            >
              <button
                onClick={() => setExpanded(null)}
                aria-label="Закрыть"
                className="absolute z-20 top-3 right-3 w-8 h-8 rounded-full bg-black/45 text-white text-sm font-black flex items-center justify-center cursor-pointer backdrop-blur-sm"
              >✕</button>

              <div className="w-full h-56 shrink-0 bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center">
                {expanded.imageUrl ? (
                  <img
                    src={expanded.imageUrl}
                    alt={expanded.title}
                    className="w-full h-full object-cover"
                  />
                ) : expanded.iconUrl ? (
                  <img src={expanded.iconUrl} alt={expanded.title} className="w-32 h-32 object-contain" />
                ) : (
                  <span className="text-[80px] leading-none">{expanded.emoji}</span>
                )}
              </div>

              <div className="flex-1 flex flex-col px-5 py-5 overflow-y-auto">
                <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">{expanded.title}</h2>
                {expanded.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-2 whitespace-pre-wrap">{expanded.description}</p>
                )}
                <p className="font-black text-2xl text-indigo-600 dark:text-indigo-400 mt-4">{expanded.price}</p>
                <button className="btn-3d-choose w-full mt-4 py-3 rounded-2xl font-black text-sm text-white cursor-default">Заказать →</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
