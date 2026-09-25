import { useEffect, useRef, useState } from 'react';
import * as v2 from '../api/v2';

// Карточка «Установки из Google Play» в аналитике админки — вариант 5
// «Полоса» из пяти показанных Давиду 26.09.2026 (заменила карточку
// «ИИ и проверка фото · сегодня»).
//
// Эффекты привязаны к настоящим цифрам, а не крутятся сами по себе:
//  • при открытии ячейки выезжают по очереди, число докручивается до
//    текущего, звёзды заполняются до оценки;
//  • если с прошлого открытия админки установок стало больше — край
//    карточки вспыхивает зелёным, над числом взлетает «+N». Прошлое число
//    помним в браузере (localStorage): это «что видел этот админ», а не данные.
//
// Цифры Google отдаёт отчётом раз в сутки — см. show_play_stats в misc.php.

type Stats = Awaited<ReturnType<typeof v2.visits.playStats>>;

const SEEN_KEY = 'sever18_play_total_seen';
const STAR_ROW = '★★★★★';

function useCountUp(to: number | null, ms = 1100): number | null {
  const [shown, setShown] = useState<number | null>(to);
  const from = useRef(0);
  useEffect(() => {
    if (to === null) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = from.current;
    from.current = to;
    if (reduce || start === to) {
      setShown(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setShown(Math.round(start + (to - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return shown;
}

function PlayIcon({ size = 32 }: { size?: number }) {
  return (
    <svg className="psc-play" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path className="psc-f1" d="M8 4.5 27.5 24 8 43.5c-1-.5-1.6-1.6-1.6-2.9V7.4c0-1.3.6-2.4 1.6-2.9Z" fill="#4285f4" />
      <path className="psc-f2" d="M34.1 17.4 27.5 24 8 4.5c.9-.4 2-.4 3 .2l23.1 12.7Z" fill="#34a853" />
      <path className="psc-f3" d="M34.1 30.6 11 43.3c-1 .6-2.1.6-3 .2L27.5 24l6.6 6.6Z" fill="#ea4335" />
      <path className="psc-f4" d="m34.1 17.4 7.3 4c2.2 1.2 2.2 4.1 0 5.3l-7.3 3.9L27.5 24l6.6-6.6Z" fill="#fbbc04" />
    </svg>
  );
}

export function PlayStatsCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    let alive = true;
    v2.visits
      .playStats()
      .then(s => {
        if (!alive) return;
        setStats(s);
        if (!s.configured) return;
        try {
          const seen = Number(localStorage.getItem(SEEN_KEY));
          if (seen > 0 && s.total > seen) setFresh(s.total - seen);
          localStorage.setItem(SEEN_KEY, String(s.total));
        } catch {
          /* браузер не даёт хранилище — просто без вспышки */
        }
      })
      .catch(() => alive && setStats({ configured: false }));
    return () => {
      alive = false;
    };
  }, []);

  const ok = stats?.configured === true ? stats : null;
  const total = useCountUp(ok ? ok.total : null);
  const week = useCountUp(ok ? ok.week : null, 900);
  const rating = ok?.rating ?? null;
  const updated = ok?.updatedAt ? new Date(ok.updatedAt) : null;

  const cell = 'psc-cell px-5 py-4 flex flex-col justify-center gap-1';
  const label = 'text-[11px] text-slate-400';
  const value = 'text-2xl font-black text-slate-800 dark:text-white tabular-nums';

  return (
    <div className={`glass-panel rounded-3xl col-span-full overflow-hidden relative psc ${fresh ? 'psc-flash' : ''}`}>
      <style>{CSS}</style>
      <div className="psc-grid">
        <div className={`${cell} psc-brand`}>
          <div className="flex items-center gap-2.5">
            <PlayIcon />
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-white leading-tight">
              Google
              <br />
              Play
            </span>
          </div>
        </div>
        <div className={cell}>
          <span className={label}>Всего установок</span>
          <span className={`${value} relative`}>
            {total ?? '—'}
            {fresh > 0 && <span className="psc-float">+{fresh}</span>}
          </span>
        </div>
        <div className={cell}>
          <span className={label}>Сегодня</span>
          <span className={`text-2xl font-black tabular-nums ${ok && ok.today > 0 ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}`}>
            {ok ? `+${ok.today}` : '—'}
          </span>
        </div>
        <div className={cell}>
          <span className={label}>За неделю</span>
          <span className={value}>{week ?? '—'}</span>
        </div>
        <div className={cell}>
          <span className={label}>Оценка</span>
          <span className={value}>
            {rating !== null ? rating.toFixed(1).replace('.', ',') : '—'}{' '}
            <span className="psc-stars" aria-label={rating !== null ? `${rating} из 5` : 'оценок пока нет'}>
              {STAR_ROW}
              <b style={{ width: `${rating !== null ? (rating / 5) * 100 : 0}%` }}>{STAR_ROW}</b>
            </span>
          </span>
        </div>
      </div>
      {stats && !stats.configured && (
        <div className="px-5 pb-3 -mt-1 text-[11px] text-slate-400">
          Статистика Google Play ещё не подключена — цифры появятся после настройки доступа к отчёту в Play Console.
        </div>
      )}
      {updated && !Number.isNaN(updated.getTime()) && (
        <div className="px-5 pb-3 -mt-1 text-[11px] text-slate-400">
          Google обновляет цифры раз в сутки · данные на {updated.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        </div>
      )}
    </div>
  );
}

const CSS = `
.psc-grid { display: grid; grid-template-columns: auto repeat(4, 1fr); }
.psc-cell + .psc-cell { border-left: 1px solid rgba(148,163,184,.18); }
.psc-brand { background: linear-gradient(145deg, rgba(1,135,95,.28), rgba(66,133,244,.16)); }
@media (max-width: 640px) {
  .psc-grid { grid-template-columns: 1fr 1fr; }
  .psc-brand { grid-column: 1 / -1; }
  .psc-cell + .psc-cell { border-left: 0; border-top: 1px solid rgba(148,163,184,.18); }
}
.psc-stars { position: relative; display: inline-block; font-size: 14px; letter-spacing: 2px; color: rgba(148,163,184,.35); vertical-align: 3px; }
.psc-stars b { position: absolute; left: 0; top: 0; overflow: hidden; white-space: nowrap; color: #fbbc04; text-shadow: 0 0 8px rgba(251,188,4,.5); }
.psc-float { position: absolute; left: 100%; top: -2px; margin-left: 6px; font-size: 14px; color: #34d399; text-shadow: 0 0 12px rgba(52,211,153,.6); }
.psc-play path { transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: no-preference) {
  .psc-cell { animation: psc-rise .6s cubic-bezier(.16,1,.3,1) both; }
  .psc-cell:nth-child(2) { animation-delay: .08s; } .psc-cell:nth-child(3) { animation-delay: .16s; }
  .psc-cell:nth-child(4) { animation-delay: .24s; } .psc-cell:nth-child(5) { animation-delay: .32s; }
  .psc-stars b { animation: psc-stars 1.2s .4s cubic-bezier(.16,1,.3,1) both; }
  .psc-f1 { animation: psc-f1 .7s cubic-bezier(.34,1.56,.64,1) both; }
  .psc-f2 { animation: psc-f2 .7s .08s cubic-bezier(.34,1.56,.64,1) both; }
  .psc-f3 { animation: psc-f3 .7s .16s cubic-bezier(.34,1.56,.64,1) both; }
  .psc-f4 { animation: psc-f4 .7s .24s cubic-bezier(.34,1.56,.64,1) both; }
  .psc::before { content: ''; position: absolute; top: -40%; bottom: -40%; left: -60%; width: 40%; pointer-events: none;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,.14), transparent);
    animation: psc-shine 1.1s .2s cubic-bezier(.65,0,.35,1) both; }
  .psc-flash { animation: psc-edge 1.4s .5s ease-out both; }
  .psc-float { animation: psc-float 1.6s .7s ease-out both; }
}
@keyframes psc-rise { from { opacity: 0; transform: translateY(10px); } }
@keyframes psc-stars { from { width: 0; } }
@keyframes psc-f1 { from { transform: translate(-14px,0) scale(.6); opacity: 0; } }
@keyframes psc-f2 { from { transform: translate(0,-14px) scale(.6); opacity: 0; } }
@keyframes psc-f3 { from { transform: translate(0,14px) scale(.6); opacity: 0; } }
@keyframes psc-f4 { from { transform: translate(14px,0) scale(.6); opacity: 0; } }
@keyframes psc-shine { from { transform: skewX(-18deg) translateX(-120%); } to { transform: skewX(-18deg) translateX(520%); } }
@keyframes psc-edge { 20% { box-shadow: 0 0 28px 2px rgba(52,211,153,.45); border-color: rgba(52,211,153,.8); } }
@keyframes psc-float { 0% { opacity: 0; transform: translateY(6px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(-30px); } }
`;
