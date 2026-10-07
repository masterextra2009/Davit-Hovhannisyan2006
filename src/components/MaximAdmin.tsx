/**
 * Раздел «Максим» в админке — ИИ-администратор, который отвечает на звонки салона.
 * Журнал звонков с расшифровками, характер и цены (что он говорит клиентам),
 * память о звонивших. Данные живут на сервере Максима, сюда — через api/v2/maxim.php.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, PhoneForwarded, PhoneOff, Bot, Brain, FileText, RefreshCw, Save, Trash2, ChevronDown, Mail, ShieldAlert, Wallet, ExternalLink } from 'lucide-react';
import { maxim, MaximCall, MaximCosts, MaximMemoryEntry, MaximStatus } from '../api/v2';

type Section = 'calls' | 'money' | 'character' | 'memory';
type CallFilter = 'all' | 'clients' | 'svoi' | 'transferred' | 'spam';

const msk = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', ...opts });
const monthName = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  const s = new Date(Date.UTC(y, mm - 1, 15)).toLocaleString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtPhone = (n: string) => {
  const d = (n || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}` : n || 'Номер скрыт';
};
const plural = (n: number, one: string, few: string, many: string) => { const a = n % 100, b = n % 10; return a >= 11 && a <= 14 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };
const fmtRub = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: n < 10 ? 2 : 0 })} ₽`;
const fmtDur = (s: number) => (s < 60 ? `${s} с` : `${Math.floor(s / 60)} мин ${s % 60} с`);
const isSpam = (c: MaximCall) => !c.svoi && !c.transferred && c.seconds < 40 && c.events.some((e) => e.tool === 'end_call') && /не интересует/i.test(c.transcript);

/** «Максим: …» / «Клиент: …» / «Система: […]» → реплики для показа пузырями. */
function parseTranscript(t: string) {
  return t.split('\n').map((line) => {
    const m = line.match(/^(Максим|Клиент|Система):\s?(.*)$/);
    return m ? { who: m[1], text: m[2].trim() } : { who: '', text: line.trim() };
  }).filter((r) => r.text);
}

export function MaximAdmin() {
  const [section, setSection] = useState<Section>('calls');
  const [status, setStatus] = useState<MaximStatus | null>(null);
  const [statusError, setStatusError] = useState('');

  const loadStatus = useCallback(async () => {
    try { setStatus(await maxim.status()); setStatusError(''); }
    catch (e: any) { setStatusError(e?.message || 'Сервер Максима не отвечает'); }
  }, []);
  useEffect(() => { void loadStatus(); const t = setInterval(loadStatus, 15000); return () => clearInterval(t); }, [loadStatus]);

  return (
    <div className="p-5 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2"><Bot className="w-5 h-5" /> Максим — администратор на звонках</h2>
          <p className="text-sm text-white/50 mt-1">Отвечает на звонки салона голосом, отсеивает спам, зовёт вас, когда нужно, и всё записывает.</p>
        </div>
        <StatusBadge status={status} error={statusError} />
      </div>

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Звонков сегодня" value={String(status.todayCalls)} />
          <Tile label="Спам сегодня" value={String(status.todaySpam)} />
          <Tile label="Номер салона" value={status.trunk} warn={status.trunk !== 'на связи'} />
          <Tile label="Перевод вам на айфон" value={status.davidReady ? 'настроен' : 'ещё нет'} warn={!status.davidReady} />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <SectionBtn on={section === 'calls'} onClick={() => setSection('calls')} icon={<Phone className="w-4 h-4" />} text="Звонки" />
        <SectionBtn on={section === 'money'} onClick={() => setSection('money')} icon={<Wallet className="w-4 h-4" />} text="Расходы и оплаты" />
        <SectionBtn on={section === 'character'} onClick={() => setSection('character')} icon={<FileText className="w-4 h-4" />} text="Характер и цены" />
        <SectionBtn on={section === 'memory'} onClick={() => setSection('memory')} icon={<Brain className="w-4 h-4" />} text="Память" />
      </div>

      {section === 'calls' && <CallsSection months={status?.months || []} />}
      {section === 'money' && <MoneySection />}
      {section === 'character' && <CharacterSection />}
      {section === 'memory' && <MemorySection />}
    </div>
  );
}

function StatusBadge({ status, error }: { status: MaximStatus | null; error: string }) {
  if (error) return <span className="glass-card px-3 py-2 rounded-xl text-xs font-bold text-rose-300">● {error}</span>;
  if (!status) return <span className="glass-card px-3 py-2 rounded-xl text-xs font-bold text-white/50">● Проверяю…</span>;
  return (
    <span className="glass-card px-3 py-2 rounded-xl text-xs font-bold text-emerald-300">
      ● На связи{status.activeCalls ? ` · сейчас разговаривает (${status.activeCalls})` : ''}
    </span>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="text-[11px] uppercase tracking-widest text-white/45 font-extrabold">{label}</p>
      <p className={`text-base font-black mt-1 ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function SectionBtn({ on, onClick, icon, text }: { on: boolean; onClick: () => void; icon: React.ReactNode; text: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${on ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}>
      {icon}{text}
    </button>
  );
}

// ─────────────────────────── Звонки ───────────────────────────

function CallsSection({ months }: { months: string[] }) {
  const current = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(current);
  const [calls, setCalls] = useState<MaximCall[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<CallFilter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try { setCalls((await maxim.calls(month)).calls); }
    catch (e: any) { setError(e?.message || 'Не удалось загрузить звонки'); }
  }, [month]);
  useEffect(() => { setCalls(null); void load(); }, [load]);

  const allMonths = useMemo(() => Array.from(new Set([current, ...months])).sort().reverse(), [months, current]);
  const shown = useMemo(() => (calls || []).filter((c) => {
    if (filter === 'svoi') return c.svoi;
    if (filter === 'transferred') return c.transferred;
    if (filter === 'spam') return isSpam(c);
    if (filter === 'clients') return !c.svoi && !isSpam(c);
    return true;
  }), [calls, filter]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="glass-card rounded-xl px-3 py-2 text-sm font-bold text-white bg-transparent">
          {allMonths.map((m) => <option key={m} value={m} className="text-black">{monthName(m)}</option>)}
        </select>
        {([['all', 'Все'], ['clients', 'Клиенты'], ['svoi', 'Свои'], ['transferred', 'Переведены вам'], ['spam', 'Спам']] as [CallFilter, string][]).map(([k, t]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === k ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}>{t}</button>
        ))}
        <button onClick={() => void load()} className="ml-auto p-2 rounded-lg text-white/60 hover:text-white" title="Обновить"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!calls && !error && <p className="text-sm text-white/50">Загружаю…</p>}
      {calls && !shown.length && <p className="text-sm text-white/50">Звонков нет.</p>}

      {shown.map((c) => {
        const spam = isSpam(c);
        const isOpen = open === c.id;
        return (
          <div key={c.id} className="glass-panel rounded-2xl overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : c.id)} className="w-full text-left p-4 flex gap-3 items-start">
              <div className={`glass-icon-capsule w-9 h-9 shrink-0 ${c.transferred ? 'glass-icon-green' : spam ? 'glass-icon-gray' : 'glass-icon-blue'}`}>
                {c.transferred ? <PhoneForwarded className="w-4 h-4 text-white" /> : spam ? <PhoneOff className="w-4 h-4 text-white" /> : <Phone className="w-4 h-4 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-black text-white">{fmtPhone(c.number)}</span>
                  <span className="text-xs text-white/45">{msk(c.started, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {fmtDur(c.seconds)}{c.costRub != null ? ` · ${fmtRub(c.costRub)}` : ''}</span>
                  {c.svoi && <Badge text="свой" color="text-emerald-300" />}
                  {c.transferred && <Badge text="соединён с вами" color="text-emerald-300" />}
                  {spam && <Badge text="спам" color="text-white/50" />}
                  {c.notes.length > 0 && <Badge text="записка" color="text-amber-300" />}
                </div>
                <p className="text-sm text-white/70 mt-1">{c.summary || (spam ? 'Реклама — Максим отказался и положил трубку.' : 'Без разговора.')}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-white/40 shrink-0 mt-1 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-2 border-t border-white/10 pt-3">
                {c.notes.map((n, i) => (
                  <div key={i} className="flex gap-2 items-start text-sm text-amber-200 bg-amber-400/10 rounded-xl px-3 py-2"><Mail className="w-4 h-4 shrink-0 mt-0.5" />{n}</div>
                ))}
                {parseTranscript(c.transcript).map((r, i) => (
                  r.who === 'Система'
                    ? <p key={i} className="text-xs text-center text-white/45">{r.text}</p>
                    : <div key={i} className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${r.who === 'Максим' ? 'bg-white/10 text-white' : 'bg-blue-500/30 text-white ml-auto'}`}>
                        <span className="block text-[10px] font-extrabold uppercase tracking-widest text-white/45">{r.who === 'Максим' ? 'Максим' : 'Звонящий'}</span>{r.text}
                      </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`text-[10px] font-extrabold uppercase tracking-widest glass-card px-2 py-0.5 rounded-md ${color}`}>{text}</span>;
}

// ─────────────────────────── Расходы и оплаты ───────────────────────────

function MoneySection() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<MaximCosts | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null); setError('');
    maxim.costs(month).then(setData).catch((e) => setError(e?.message || 'Не удалось загрузить'));
  }, [month]);

  const now = new Date().toISOString().slice(0, 7);
  const months = [now, ...Array.from({ length: 5 }, (_, i) => { const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - i - 1); return d.toISOString().slice(0, 7); })];

  return (
    <div className="space-y-4">
      <select value={month} onChange={(e) => setMonth(e.target.value)} className="glass-card rounded-xl px-3 py-2 text-sm font-bold text-white bg-transparent">
        {months.map((m) => <option key={m} value={m} className="text-black">{monthName(m)}</option>)}
      </select>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!data && !error && <p className="text-sm text-white/50">Считаю…</p>}
      {data && (
        <>
          <div className="glass-panel rounded-3xl p-5">
            <p className="text-[11px] uppercase tracking-widest text-white/45 font-extrabold">Всего за {monthName(data.month).toLowerCase()}</p>
            <p className="text-3xl font-black text-white mt-1">{fmtRub(data.totalRub)}</p>
            <div className="mt-4 space-y-2 text-sm">
              <Row label={`ИИ Google — ${data.calls} ${plural(data.calls, 'звонок', 'звонка', 'звонков')}, ${data.minutes.toLocaleString('ru-RU')} мин`} value={fmtRub(data.aiRub)} />
              {data.fixed.map((f) => <Row key={f.name} label={f.name} value={fmtRub(f.rub)} />)}
            </div>
            <p className="text-xs text-white/45 mt-4">
              В среднем звонок — {fmtRub(data.perCall)}, минута разговора — {fmtRub(data.perMinute)}. ИИ считается по реальным данным Google за каждый звонок
              (по курсу {data.usdRub} ₽ за $); сервер и номер — по тарифу.
            </p>
          </div>

          <div className="glass-panel rounded-3xl p-5 space-y-3">
            <div>
              <h3 className="text-sm font-black text-white">Ближайшие оплаты</h3>
              <p className="text-xs text-white/50 mt-0.5">Максим напомнит в Telegram заранее (ежемесячные — за 3 дня и в день оплаты, разовые — за месяц, неделю и день).</p>
            </div>
            {!data.payments.length && <p className="text-sm text-white/50">Ничего не запланировано.</p>}
            {data.payments.map((p) => (
              <div key={p.id} className="flex items-start gap-3 glass-card rounded-2xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{p.name}{p.rub ? ` — около ${fmtRub(p.rub)}` : ''}</p>
                  <p className={`text-xs mt-0.5 ${p.inDays <= 3 ? 'text-amber-300 font-bold' : 'text-white/50'}`}>
                    {p.inDays === 0 ? 'Сегодня' : `${p.dueText} · через ${p.inDays} дн.`}
                  </p>
                  {p.note && <p className="text-xs text-white/55 mt-1">{p.note}</p>}
                </div>
                <a href={p.link} target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white">
                  {p.rub ? 'Оплатить' : 'Открыть'} <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string; key?: React.Key }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 last:border-0">
      <span className="text-white/70">{label}</span>
      <span className="font-black text-white shrink-0">{value}</span>
    </div>
  );
}

// ─────────────────────────── Характер и цены ───────────────────────────

function CharacterSection() {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    maxim.character().then((r) => { setText(r.text); setSaved(r.text); }).catch((e) => setError(e?.message || 'Не удалось загрузить'));
  }, []);

  const dirty = text !== null && text !== saved;
  const save = async () => {
    if (text === null) return;
    setState('saving'); setError('');
    try { await maxim.saveCharacter(text); setSaved(text); setState('saved'); }
    catch (e: any) { setError(e?.message || 'Не сохранилось'); setState('error'); }
  };

  return (
    <div className="glass-panel rounded-3xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
        <p className="text-sm text-white/70">
          Всё, что Максим знает о салоне: цены, адрес, часы, что можно и нельзя говорить. Он говорит клиентам <b>только то, что здесь написано</b>.
          Поменяли цену — поменяйте здесь. Изменения действуют <b>со следующего звонка</b>.
        </p>
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {text === null && !error && <p className="text-sm text-white/50">Загружаю…</p>}
      {text !== null && (
        <>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setState('idle'); }}
            spellCheck={false}
            className="w-full min-h-[520px] glass-card rounded-2xl p-4 text-sm leading-relaxed text-white bg-transparent font-mono resize-y focus:outline-none focus:ring-2 focus:ring-white/20"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={save} disabled={!dirty || state === 'saving'} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition">
              <Save className="w-4 h-4" />{state === 'saving' ? 'Сохраняю…' : 'Сохранить'}
            </button>
            {dirty && <button onClick={() => { setText(saved); setState('idle'); }} className="text-sm text-white/55 hover:text-white">Отменить правки</button>}
            {state === 'saved' && !dirty && <span className="text-sm text-emerald-300">✓ Сохранено — Максим будет говорить так со следующего звонка</span>}
            {dirty && <span className="text-xs text-amber-300">Есть несохранённые изменения</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── Память ───────────────────────────

function MemorySection() {
  const [memory, setMemory] = useState<Record<string, MaximMemoryEntry[]> | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(() => {
    maxim.memory().then((r) => setMemory(r.memory)).catch((e) => setError(e?.message || 'Не удалось загрузить'));
  }, []);
  useEffect(load, [load]);

  const forget = async (num: string) => {
    try { await maxim.forget(num); setConfirm(null); load(); }
    catch (e: any) { setError(e?.message || 'Не получилось'); }
  };

  // Дата в памяти — «07.10.2026, 23:16:51»; для сортировки переставляем в «2026.10.07, …».
  const last = (l: MaximMemoryEntry[]) => (l[l.length - 1]?.date || '').replace(/^(\d\d)\.(\d\d)\.(\d{4})/, '$3.$2.$1');
  const entries = (Object.entries(memory || {}) as [string, MaximMemoryEntry[]][]).sort((a, b) => last(b[1]).localeCompare(last(a[1])));
  return (
    <div className="space-y-3">
      <p className="text-sm text-white/55">После каждого разговора Максим кратко записывает, о чём шла речь, и вспоминает это, когда человек звонит снова.</p>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {memory && !entries.length && <p className="text-sm text-white/50">Пока никого не помнит.</p>}
      {entries.map(([num, list]) => (
        <div key={num} className="glass-panel rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white">{fmtPhone(num)}</span>
            <span className="text-xs text-white/45">{list.length} {plural(list.length, 'звонок', 'звонка', 'звонков')}</span>
            {confirm === num
              ? <span className="ml-auto flex gap-2">
                  <button onClick={() => forget(num)} className="text-xs font-bold text-rose-300 hover:text-rose-200">Да, забыть</button>
                  <button onClick={() => setConfirm(null)} className="text-xs text-white/55 hover:text-white">Нет</button>
                </span>
              : <button onClick={() => setConfirm(num)} className="ml-auto p-1.5 rounded-lg text-white/40 hover:text-rose-300" title="Забыть этого человека"><Trash2 className="w-4 h-4" /></button>}
          </div>
          {list.slice().reverse().map((m, i) => (
            <p key={i} className="text-sm text-white/70"><span className="text-white/40">{m.date}: </span>{m.summary}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
