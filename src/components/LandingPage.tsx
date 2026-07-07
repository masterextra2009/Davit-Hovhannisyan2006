/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  Phone, MapPin, Clock, ArrowRight, Upload, Sliders, PackageCheck,
  FileText, Printer, Send, ShieldCheck, ExternalLink
} from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
}

const STEPS = [
  {
    icon: Upload,
    title: 'Загрузите файл',
    desc: 'PDF, фото, документы, чертежи — до 100 МБ, любые форматы, прямо с телефона или компьютера.',
  },
  {
    icon: Sliders,
    title: 'Настройте параметры',
    desc: 'Формат (А4/А3), цвет или ч/б, количество копий, срочность и переплёт — всё в пару кликов.',
  },
  {
    icon: PackageCheck,
    title: 'Заберите заказ',
    desc: 'Оплата онлайн или на месте, push-уведомление когда готово. Забрать — на Северном шоссе, 18.',
  },
];

const PRICES = [
  { label: 'А4, чёрно-белая', price: 'от 20 ₽', unit: '/ стр.' },
  { label: 'А4, цветная', price: 'от 40 ₽', unit: '/ стр.' },
  { label: 'А3, любой цвет', price: 'от 45 ₽', unit: '/ стр.' },
  { label: 'Срочная печать', price: '+50%', unit: 'к стоимости' },
];

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#03000a] text-slate-900 dark:text-white">

      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/70 dark:bg-black/40 border-b border-slate-150 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo-192-v2.png" alt="Фото-Север" className="w-9 h-9 rounded-xl object-cover" />
            <div className="leading-tight">
              <div className="text-sm font-black">Фото-Север</div>
              <div className="text-[10px] text-slate-500 dark:text-white/40">Северное шоссе, 18</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="tel:+79680508800" className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-white/70 hover:text-orange-500 transition-colors">
              <Phone className="w-3.5 h-3.5" />
              8 (968) 050-88-00
            </a>
            <button
              onClick={onEnter}
              className="landing-cta-btn btn-holo-glass flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold cursor-pointer"
            >
              Войти в кабинет
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-14 grid md:grid-cols-2 gap-10 items-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Принимаем заказы онлайн
          </div>

          <h1 className="landing-h1 text-3xl sm:text-4xl md:text-[42px] font-black leading-[1.1] tracking-tight mb-4">
            Печать фото и документов<br className="hidden sm:block" /> в Раменском <span className="bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">за минуты</span>
          </h1>

          <p className="landing-p text-sm sm:text-base leading-relaxed mb-7 max-w-md">
            Загрузи файл онлайн — мы распечатаем и сообщим, когда будет готово. Фото, документы А4/А3, чертежи, переплёт. Без очередей и звонков.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button
              onClick={onEnter}
              className="landing-cta-btn btn-holo-glass flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Загрузить файл
            </button>
            <a
              href="https://t.me/photosever18"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <Send className="w-4 h-4" />
              Написать в Telegram
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg">
            <div className="flex items-start gap-2">
              <Phone className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold">8 (968) 050-88-00</div>
                <div className="text-[10px] text-slate-400">Звоните</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold">Северное шоссе, 18</div>
                <div className="text-[10px] text-slate-400">Раменское</div>
              </div>
            </div>
            <div className="flex items-start gap-2 col-span-2 sm:col-span-1">
              <Clock className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold">Пн–Пт 9:00–19:00</div>
                <div className="text-[10px] text-slate-400">Сб–Вс 10:00–19:00</div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative flex justify-center"
        >
          <div className="relative w-full max-w-[320px] rounded-[32px] overflow-hidden shadow-2xl border border-white/20 glass-card">
            <video
              src="/hero-demo.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-auto block"
            />
          </div>
        </motion.div>
      </section>

      {/* ===== КАК ЗАКАЗАТЬ ===== */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="landing-h2 text-2xl sm:text-3xl font-black text-center mb-2">Как заказать</h2>
        <p className="text-sm text-slate-500 dark:text-white/50 text-center mb-10">Три шага — и готово</p>

        <div className="grid sm:grid-cols-3 gap-5">
          {STEPS.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass-card rounded-3xl p-6 relative"
            >
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-purple-600 text-white text-xs font-black flex items-center justify-center shadow-lg">
                {i + 1}
              </div>
              <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mb-4">
                <step.icon className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="text-sm font-black mb-1.5">{step.title}</h3>
              <p className="text-xs text-slate-500 dark:text-white/50 leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== ЦЕНЫ ===== */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="glass-card rounded-3xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h2 className="landing-h2 text-xl sm:text-2xl font-black mb-1">Цены</h2>
              <p className="text-xs text-slate-500 dark:text-white/50">Ориентировочные — точную стоимость увидите при оформлении заказа</p>
            </div>
            <button
              onClick={onEnter}
              className="flex items-center gap-1.5 text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
            >
              Полный прайс в кабинете
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {PRICES.map((p, i) => (
              <div key={i} className="rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 p-4 text-center">
                <div className="text-lg font-black text-orange-500">{p.price}</div>
                <div className="text-[10px] text-slate-400 mb-1.5">{p.unit}</div>
                <div className="text-xs font-bold">{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== КАРТА ===== */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="landing-h2 text-2xl sm:text-3xl font-black text-center mb-2">Где нас найти</h2>
        <p className="text-sm text-slate-500 dark:text-white/50 text-center mb-8">Раменское, Северное шоссе, 18</p>

        <div className="glass-card rounded-3xl overflow-hidden">
          <iframe
            title="Карта — Фото-Север, Северное шоссе 18, Раменское"
            src="https://yandex.ru/map-widget/v1/?text=Раменское%20Северное%20шоссе%2018&z=16"
            width="100%"
            height="360"
            style={{ border: 0 }}
            loading="lazy"
          />
          <div className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-bold">Северное шоссе, 18, Раменское</span>
            </div>
            <a
              href="https://yandex.ru/maps/?text=Раменское%20Северное%20шоссе%2018&rtext=~Раменское%20Северное%20шоссе%2018"
              target="_blank" rel="noopener noreferrer"
              className="landing-cta-btn btn-holo-glass flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold cursor-pointer"
            >
              Построить маршрут
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-slate-150 dark:border-white/10 mt-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid sm:grid-cols-3 gap-8 text-xs text-slate-500 dark:text-white/50">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo-192-v2.png" alt="Фото-Север" className="w-7 h-7 rounded-lg object-cover" />
              <span className="text-sm font-black text-slate-900 dark:text-white">Фото-Север</span>
            </div>
            <p className="leading-relaxed">Копи-центр в Раменском.<br />Печать фото, документов, чертежей.</p>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Контакты</div>
            <a href="tel:+79680508800" className="flex items-center gap-1.5 hover:text-orange-500 transition-colors"><Phone className="w-3.5 h-3.5" /> 8 (968) 050-88-00</a>
            <a href="https://t.me/photosever18" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-orange-500 transition-colors"><Send className="w-3.5 h-3.5" /> @photosever18</a>
            <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Северное шоссе, 18, Раменское</div>
            <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Пн–Пт 9:00–19:00 · Сб–Вс 10:00–19:00</div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Реквизиты
            </div>
            <div>ИП, ИНН 501110120673</div>
            <div>ОГРНИП 324774600314137</div>
            <div className="pt-2 flex flex-col gap-1">
              <button onClick={onEnter} className="text-left hover:text-orange-500 transition-colors underline decoration-dotted">Публичная оферта</button>
              <button onClick={onEnter} className="text-left hover:text-orange-500 transition-colors underline decoration-dotted">Политика обработки персональных данных</button>
            </div>
          </div>
        </div>
        <div className="text-center text-[10px] text-slate-400 dark:text-white/30 pb-6">
          &copy; 2026 Копи-Центр «Фото-Север» &middot; Северное шоссе, 18 &middot; Лицензия SSL
        </div>
      </footer>
    </div>
  );
}
