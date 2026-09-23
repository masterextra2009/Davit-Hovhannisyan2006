import React, { useEffect, useState } from 'react';
import { subscribeBrowserPush } from '../api/v2';

// Уведомления Windows о новых сообщениях и заказах, когда админка закрыта
// или свёрнута. Давид 24.09.2026: «когда не открыт админ, пусть один раз
// высветится, а то каждый раз надо заходить обновлять».
//
// Сервер (push_to_admins) слал их и раньше, но подписаться админу было негде:
// кнопка была только в кабинете клиента. Пока админка открыта перед глазами,
// сервер окошко не шлёт — там и так всплывает своё.

type State = 'checking' | 'off' | 'on' | 'denied' | 'unsupported' | 'busy' | 'error';

export default function AdminPushToggle() {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    if (Notification.permission !== 'granted') {
      setState('off');
      return;
    }
    // Разрешение уже есть — ещё раз сообщаем подписку серверу: она могла
    // пропасть там (смена ключа, переезд базы), а браузер об этом не знает.
    subscribeBrowserPush().then(() => setState('on')).catch(() => setState('off'));
  }, []);

  const enable = async () => {
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      await subscribeBrowserPush();
      setState('on');
    } catch {
      setState('error');
    }
  };

  if (state === 'checking' || state === 'unsupported') return null;

  if (state === 'on') {
    return (
      <div className="px-1 mb-5 text-[12px] font-semibold text-emerald-300/80 flex items-center gap-2">
        <span aria-hidden>🔔</span> Уведомления на этом компьютере включены
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="px-1 mb-5 text-[12px] text-amber-300/90 leading-snug">
        🔕 Уведомления запрещены в браузере. Нажмите на значок слева от адреса сайта → «Уведомления» → «Разрешить», затем обновите страницу.
      </div>
    );
  }

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={enable}
        disabled={state === 'busy'}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-[13px] font-bold text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-colors disabled:opacity-60"
      >
        <span aria-hidden>🔔</span>
        {state === 'busy' ? 'Включаю…' : 'Включить уведомления на этом компьютере'}
      </button>
      <p className="px-1 mt-1.5 text-[11px] text-white/45 leading-snug">
        {state === 'error'
          ? 'Не получилось включить — обновите страницу и нажмите ещё раз.'
          : 'О новых сообщениях и заказах, даже когда админка закрыта.'}
      </p>
    </div>
  );
}
