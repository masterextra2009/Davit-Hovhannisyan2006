/**
 * Раздел «Цены печати» в админке (17.10.2026): Давид меняет цену здесь —
 * и она одна для сайта, приложения и суммы к оплате. Хранит их сервер
 * (misc.php?action=prices / prices-save, _pricing.php).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Save, Tag, Undo2 } from 'lucide-react';
import { prices as pricesApi, PrintPrices } from '../api/v2';

/** Группы и подписи полей — порядок как в прайсе у клиента. */
const GROUPS: { title: string; hint?: string; items: [key: string, label: string][] }[] = [
  {
    title: 'Фото',
    hint: 'за один отпечаток',
    items: [
      ['photo_10x15', '10×15'],
      ['photo_polaroid', 'Полароид'],
      ['photo_13x18', '13×18'],
      ['photo_15x21', '15×21'],
      ['photo_20x30', '20×30'],
      ['photo_30x40', '30×40'],
    ],
  },
  {
    title: 'Коллаж',
    hint: 'за лист',
    items: [
      ['collage_plain', 'На обычной бумаге'],
      ['collage_photo', 'На фотобумаге'],
    ],
  },
  {
    title: 'Документы А4',
    hint: 'за страницу',
    items: [
      ['a4_bw', 'Чёрно-белая'],
      ['a4_color_light', 'Цветная, немного цвета (до 20%)'],
      ['a4_color_full', 'Цветная, много цвета'],
    ],
  },
  {
    title: 'А3 и чертежи',
    hint: 'за лист',
    items: [
      ['a3_photo', 'Фото А3'],
      ['a3_bw_80', 'Чертёж ч/б, 80 г/м²'],
      ['a3_bw_200', 'Чертёж ч/б, 200 г/м²'],
      ['a3_color_80', 'Чертёж цветной, 80 г/м²'],
      ['a3_color_200', 'Чертёж цветной, 200 г/м²'],
    ],
  },
  {
    title: 'Отделка',
    hint: 'за одну копию',
    items: [
      ['staple', 'Скоба (степлер)'],
      ['file_a4', 'Файлик А4'],
      ['file_a3', 'Файлик А3'],
      ['spring_metal_50', 'Пружина металл, до 50 листов'],
      ['spring_metal_more', 'Пружина металл, больше 50 листов'],
      ['spring_plastic_50', 'Пружина пластик, до 50 листов'],
      ['spring_plastic_90', 'Пружина пластик, 51–90 листов'],
      ['spring_plastic_more', 'Пружина пластик, больше 90 листов'],
      ['hard_cover', 'Твёрдая обложка'],
    ],
  },
];

export function PrintPricesAdmin() {
  const [saved, setSaved] = useState<PrintPrices | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const { prices } = await pricesApi.get();
      setSaved(prices);
      setDraft(Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, String(v)])));
    } catch (e: any) {
      setLoadError(e?.message || 'Сервер не ответил');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Что поменяно и не сохранено; пустое или неверное поле — ошибка.
  const { changed, invalid } = useMemo(() => {
    const changed: PrintPrices = {};
    const invalid: string[] = [];
    if (!saved) return { changed, invalid };
    for (const key of Object.keys(draft)) {
      const raw = draft[key];
      const n = Number(raw.replace(',', '.').trim());
      if (raw.trim() === '' || !Number.isFinite(n) || n < 1 || n > 100000 || !Number.isInteger(n)) {
        invalid.push(key);
      } else if (n !== saved[key]) {
        changed[key] = n;
      }
    }
    return { changed, invalid };
  }, [draft, saved]);
  const changedCount = Object.keys(changed).length;

  const save = async () => {
    if (!changedCount || invalid.length) return;
    const list = GROUPS.flatMap((g) => g.items)
      .filter(([k]) => k in changed)
      .map(([k, label]) => `${label}: ${saved?.[k]} → ${changed[k]} ₽`)
      .join('\n');
    if (!window.confirm(`Сохранить новые цены? Клиенты будут платить по ним.\n\n${list}`)) return;
    setSaving(true);
    setMessage(null);
    try {
      const { prices } = await pricesApi.save(changed);
      setSaved(prices);
      setDraft(Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, String(v)])));
      setMessage({ ok: true, text: 'Цены сохранены' });
    } catch (e: any) {
      setMessage({ ok: false, text: e?.message || 'Не удалось сохранить' });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!saved) return;
    setDraft(Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])));
    setMessage(null);
  };

  return (
    <div className="p-5 space-y-5 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-black text-white flex items-center gap-2"><Tag className="w-5 h-5" /> Цены печати</h2>
        <p className="text-sm text-white/50 mt-1">Меняете цену здесь — по ней считается сумма к оплате. Цены услуг из витрины меняются в разделе «Услуги».</p>
      </div>

      {/* Пока сайт и приложение показывают свои, вписанные цены (шаги 3–4). Убрать, когда они начнут брать цены отсюда. */}
      <div className="p-4 flex items-start gap-3" style={{ borderRadius: 16, background: 'rgba(245,158,11,.18)', border: '1px solid rgba(252,211,77,.55)' }}>
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#fcd34d' }} />
        <p className="text-sm text-white">
          <b style={{ color: '#fcd34d' }}>Пока не меняйте цены.</b> Сайт и приложение ещё показывают клиентам старые цены — их подключим следующими шагами. Если поменять сейчас, клиент увидит одну цену, а заплатит другую.
        </p>
      </div>

      {loadError && (
        <div className="p-4 flex items-center gap-3 flex-wrap" style={{ borderRadius: 16, background: 'rgba(244,63,94,.14)', border: '1px solid rgba(253,164,175,.45)' }}>
          <p className="text-sm text-white flex-1">Не получилось загрузить цены: {loadError}</p>
          <button onClick={() => void load()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white/10 hover:bg-white/15 text-white" style={{ borderRadius: 12 }}>
            <RefreshCw className="w-3.5 h-3.5" /> Ещё раз
          </button>
        </div>
      )}

      {saved && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {GROUPS.map((g) => (
              <div key={g.title} className="p-4 space-y-2.5" style={{ borderRadius: 16, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>
                <p className="text-sm font-black text-white">
                  {g.title} {g.hint && <span className="text-xs font-semibold text-white/45">· {g.hint}</span>}
                </p>
                {g.items.map(([key, label]) => {
                  const bad = invalid.includes(key);
                  const isChanged = key in changed;
                  return (
                    <label key={key} className="flex items-center gap-3">
                      <span className="text-sm flex-1 min-w-0" style={{ color: bad ? '#fda4af' : isChanged ? '#fbbf24' : 'rgba(255,255,255,.8)', fontWeight: isChanged || bad ? 700 : 400 }}>
                        {label}{isChanged && saved ? ` (было ${saved[key]} ₽)` : ''}
                      </span>
                      <span className="relative shrink-0">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft[key] ?? ''}
                          onChange={(e) => { setDraft((d) => ({ ...d, [key]: e.target.value })); setMessage(null); }}
                          aria-label={`${g.title}: ${label}, рублей`}
                          className="w-24 pl-3 pr-7 py-1.5 text-right text-sm font-bold text-white focus:outline-none"
                          style={{
                            // Тёмная тема админки перекрашивает поля — поменянную цену видно по подписи слева.
                            borderRadius: 10,
                            background: 'rgba(0,0,0,.25)',
                            border: `1px solid ${bad ? '#fb7185' : isChanged ? '#fbbf24' : 'rgba(255,255,255,.15)'}`,
                          }}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/50 pointer-events-none">₽</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap sticky bottom-3 p-3" style={{ borderRadius: 16, background: 'rgba(15,17,26,.85)', border: '1px solid rgba(255,255,255,.12)', backdropFilter: 'blur(12px)' }}>
            <button
              onClick={() => void save()}
              disabled={!changedCount || invalid.length > 0 || saving}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-black disabled:opacity-40"
              style={{ borderRadius: 12, background: '#f59e0b', color: '#111' }}
            >
              <Save className="w-4 h-4" /> {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
            {changedCount > 0 && (
              <button onClick={reset} className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold text-white bg-white/10 hover:bg-white/15" style={{ borderRadius: 12 }}>
                <Undo2 className="w-4 h-4" /> Отменить
              </button>
            )}
            <span className="text-sm" style={{ color: invalid.length ? '#fda4af' : message ? (message.ok ? '#6ee7b7' : '#fda4af') : 'rgba(255,255,255,.55)' }}>
              {invalid.length
                ? 'Цена — целое число от 1 до 100 000 ₽ (поле подсвечено красным)'
                : message
                  ? message.text
                  : changedCount
                    ? `Изменено: ${changedCount}`
                    : 'Изменений нет'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
