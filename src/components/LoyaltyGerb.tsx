import * as v2 from '../api/v2';

// Уровень клиента в кабинете сайта — «Герб», как в приложении (GerbCard.tsx):
// тёмная сцена, крупная эмблема уровня покачивается, за ней дышит свет,
// ниже скидка, шкала до следующего уровня и все эмблемы в ряд.
// Цифры — с сервера (orders.php?action=loyalty): он же ставит скидку.

type LevelCode = 'bronze' | 'silver' | 'gold' | 'platinum';

/** Пороги и скидки — как LOYALTY_TIERS в server/api/v2/_pricing.php. */
const LEVELS: { code: LevelCode; name: string; from: number; percent: number; glow: string; title: string; bar: [string, string] }[] = [
  { code: 'bronze', name: 'Бронзовый', from: 2000, percent: 5, glow: '#ff9a4d', title: '#ffcf9e', bar: ['#c98548', '#ff9a4d'] },
  { code: 'silver', name: 'Серебряный', from: 10000, percent: 10, glow: '#cfdcff', title: '#eef2f8', bar: ['#aeb8c8', '#eef2ff'] },
  { code: 'gold', name: 'Золотой', from: 25000, percent: 15, glow: '#ffc84a', title: '#ffe08a', bar: ['#e7b441', '#ffe08a'] },
  { code: 'platinum', name: 'Платиновый', from: 50000, percent: 20, glow: '#7fd6ff', title: '#c8efff', bar: ['#7cc6e2', '#d6f4ff'] },
];

export const levelEmblemUrl = (code: LevelCode) => `/levels/${code}.webp`;

const rub = (v: number) => `${Math.max(0, Math.round(v)).toLocaleString('ru-RU')} ₽`;

export function LoyaltyGerb({ loyalty, compact = false }: { loyalty: v2.Loyalty | null; compact?: boolean }) {
  if (!loyalty) return null;
  const paid = loyalty.paid;
  const idx = LEVELS.findIndex(l => l.code === loyalty.tier?.code);
  const cur = idx >= 0 ? LEVELS[idx] : null;
  const next = LEVELS[idx + 1] ?? null;
  // Без уровня на сцене — будущая бронза, приглушённая: видно, к чему идти.
  const shown = cur ?? LEVELS[0];
  const from = cur?.from ?? 0;
  const progress = next ? Math.max(0, Math.min(1, (paid - from) / (next.from - from))) : 1;
  const bar = (next ?? cur ?? LEVELS[0]).bar;
  const size = compact ? 132 : 190;

  return (
    <div
      className="rounded-3xl text-center text-white px-4 pt-4 pb-4"
      style={{ background: 'linear-gradient(180deg,#2b2f3a,#14161c)' }}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .gerb-float { animation: gerbFloat 3.2s ease-in-out infinite; }
          .gerb-breath { animation: gerbBreath 3s ease-in-out infinite; }
        }
        @keyframes gerbFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes gerbBreath { 0%,100% { opacity: .25; transform: scale(.92) } 50% { opacity: .6; transform: scale(1.08) } }
      `}</style>
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <div
          className={`absolute rounded-full ${cur ? 'gerb-breath' : ''}`}
          style={{ inset: '14%', background: shown.glow, filter: 'blur(20px)', opacity: cur ? 0.45 : 0.08 }}
        />
        <img
          src={levelEmblemUrl(shown.code)}
          alt={cur ? `Эмблема уровня «${cur.name}»` : 'Эмблема первого уровня'}
          className="gerb-float absolute inset-0 w-full h-full"
          style={{ opacity: cur ? 1 : 0.35 }}
        />
      </div>

      <span
        className="inline-block rounded-full px-3 py-1 mt-1 text-[13px] font-black"
        style={{ background: 'rgba(255,255,255,.1)', color: cur?.title ?? '#dfe3ea' }}
      >
        {cur ? cur.name : 'Без уровня'}
      </span>
      <div className="font-black mt-1 mb-3" style={{ fontSize: compact ? 28 : 36, color: cur?.title ?? '#fff' }}>
        {cur ? `−${cur.percent}%` : '0%'}
      </div>

      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.12)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(paid > 0 ? 4 : 0, progress * 100)}%`, background: `linear-gradient(90deg,${bar[0]},${bar[1]})` }}
        />
      </div>
      <p className="text-[13px] leading-snug mt-2.5" style={{ color: '#b9c0cf' }}>
        {next
          ? <>До уровня «{next.name}» осталось <b className="text-white">{rub(next.from - paid)}</b> — там скидка {next.percent}%</>
          : <>Высший уровень — скидка {cur?.percent ?? 0}% на каждый заказ</>}
      </p>

      {!compact && (
        <>
          <div className="flex justify-center gap-2.5 mt-4">
            {LEVELS.map((l, k) => (
              <img
                key={l.code}
                src={levelEmblemUrl(l.code)}
                alt={`${l.name}: от ${rub(l.from)}, скидка ${l.percent}%`}
                title={`${l.name}: от ${rub(l.from)}, скидка ${l.percent}%`}
                className="w-11 h-11"
                style={{ opacity: k > idx ? 0.28 : 1 }}
              />
            ))}
          </div>
          {cur && (
            <p className="text-[11px] leading-snug mt-3" style={{ color: 'rgba(255,255,255,.55)' }}>
              Скидка считается сама при оплате. С промокодом не складывается — действует бо́льшая.
            </p>
          )}
        </>
      )}
    </div>
  );
}
