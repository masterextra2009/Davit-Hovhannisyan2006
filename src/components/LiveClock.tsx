/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';

interface LiveClockProps {
  /** Extra classes for the outer glass pill (e.g. to hide on small screens). */
  className?: string;
  /** Show the seconds column. Defaults to true. */
  showSeconds?: boolean;
}

function formatParts(date: Date, showSeconds: boolean) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

/**
 * Small live-updating digital clock badge, styled to match the site's
 * dark-glass aesthetic (glass-card + a neon indigo/violet glow on the digits,
 * echoing the "neon-clock" reference the client provided).
 */
export function LiveClock({ className = '', showSeconds = true }: LiveClockProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={`glass-card flex items-center gap-2 px-3.5 py-2 rounded-xl shrink-0 ${className}`}
      title="Текущее время"
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
        style={{
          background: '#a855f7',
          boxShadow: '0 0 6px rgba(168,85,247,0.9), 0 0 12px rgba(99,102,241,0.7)',
        }}
      />
      <span
        className="font-mono text-xs sm:text-sm font-black tracking-widest tabular-nums select-none"
        style={{
          color: '#e9d8ff',
          textShadow:
            '0 0 4px rgba(216,180,254,0.9), 0 0 10px rgba(168,85,247,0.75), 0 0 20px rgba(99,102,241,0.5)',
        }}
      >
        {formatParts(now, showSeconds)}
      </span>
    </div>
  );
}
