/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Персонаж для экрана приветствия — простая, но аккуратная flat-иллюстрация
// (SVG, без внешних ассетов): круглая голова, скруглённое тело, причёска и
// одежда отличаются по полу, в руках — стопка отпечатанных фото (по теме
// копи-центра). Не копия конкретной иллюстрации из Figma-референса (там
// детализированный 3D-рендер персонажей, который нельзя ни скопировать
// технически, ни просто перерисовать один в один без художника) — тот же
// общий дух (дружелюбный персонаж крупным планом, мягкая тень-подложка
// позади), адаптированный под нашу синюю палитру собственной геометрией.
export function WelcomeIllustration({ gender }: { gender: 'male' | 'female' }) {
  const isFemale = gender === 'female';
  const skin = '#f3c9a4';
  const hair = isFemale ? '#3b2a24' : '#2b211d';
  const top = isFemale ? '#2563eb' : '#1e40af';
  const topAccent = isFemale ? '#60a5fa' : '#3b82f6';
  const pants = '#0f2a5c';

  return (
    <svg viewBox="0 0 240 260" className="w-full h-full" role="img" aria-label={isFemale ? 'Иллюстрация: девушка держит стопку фотографий' : 'Иллюстрация: молодой человек держит стопку фотографий'}>
      {/* мягкая подложка-свечение позади персонажа */}
      <ellipse cx="120" cy="215" rx="86" ry="18" fill="#1d4ed8" opacity="0.18" />
      <circle cx="120" cy="120" r="108" fill="url(#welcomeGlow)" opacity="0.35" />
      <defs>
        <radialGradient id="welcomeGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ноги */}
      <rect x="96" y="188" width="20" height="46" rx="10" fill={pants} />
      <rect x="124" y="188" width="20" height="46" rx="10" fill={pants} />

      {/* туловище */}
      <rect x="82" y="118" width="76" height="82" rx="34" fill={top} />
      <rect x="82" y="118" width="76" height="34" rx="17" fill={topAccent} opacity="0.55" />

      {/* левая рука, придерживает стопку снизу */}
      <rect x="60" y="150" width="22" height="58" rx="11" fill={top} transform="rotate(-12 71 150)" />
      {/* правая рука */}
      <rect x="158" y="150" width="22" height="56" rx="11" fill={top} transform="rotate(14 169 150)" />

      {/* стопка отпечатанных фото в руках */}
      <g transform="translate(88 150)">
        <rect x="6" y="10" width="52" height="38" rx="4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" transform="rotate(-6 32 29)" />
        <rect x="2" y="4" width="52" height="38" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" transform="rotate(-2 28 23)" />
        <rect x="0" y="0" width="52" height="38" rx="4" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
        <rect x="6" y="6" width="40" height="22" rx="2" fill="#bfdbfe" />
        <circle cx="14" cy="15" r="4" fill="#93c5fd" />
        <path d="M8 26 L20 16 L30 24 L46 10 L46 26 Z" fill="#60a5fa" />
      </g>

      {/* голова */}
      <circle cx="120" cy="86" r="40" fill={skin} />

      {/* причёска */}
      {isFemale ? (
        <path
          d="M78 78 C74 46 96 26 120 26 C146 26 166 46 162 80 C160 66 150 70 150 84 L150 66 C150 52 136 44 120 44 C104 44 92 54 92 70 L91 86 C91 70 80 66 78 78 Z"
          fill={hair}
        />
      ) : (
        <path
          d="M80 80 C76 50 96 30 120 30 C144 30 164 50 160 80 C158 62 148 54 120 54 C96 54 84 60 82 76 Z"
          fill={hair}
        />
      )}

      {/* лицо */}
      <circle cx="107" cy="88" r="3.4" fill="#2b211d" />
      <circle cx="133" cy="88" r="3.4" fill="#2b211d" />
      <path d="M108 102 Q120 111 132 102" stroke="#7a4a2f" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="97" cy="98" r="6" fill="#f4a889" opacity="0.55" />
      <circle cx="143" cy="98" r="6" fill="#f4a889" opacity="0.55" />

      {isFemale && (
        <>
          <path d="M76 66 C70 90 74 116 84 128" stroke={hair} strokeWidth="14" strokeLinecap="round" fill="none" />
          <path d="M164 66 C170 90 166 116 156 128" stroke={hair} strokeWidth="14" strokeLinecap="round" fill="none" />
        </>
      )}
    </svg>
  );
}
