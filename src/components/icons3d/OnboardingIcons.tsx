import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

const css = `
@keyframes ob-float {
  0%,100% { transform: translateY(0px) rotate(-4deg); }
  50%      { transform: translateY(-8px) rotate(2deg); }
}
@keyframes ob-float2 {
  0%,100% { transform: translateY(0px) rotate(6deg); }
  50%      { transform: translateY(-6px) rotate(-3deg); }
}
@keyframes ob-float3 {
  0%,100% { transform: translateY(0px) rotate(-8deg); }
  50%      { transform: translateY(-10px) rotate(4deg); }
}
@keyframes ob-spin {
  0%   { transform: rotateY(0deg); }
  100% { transform: rotateY(360deg); }
}
@keyframes ob-pulse-shadow {
  0%,100% { opacity: 0.22; transform: scaleX(1); }
  50%      { opacity: 0.12; transform: scaleX(0.82); }
}
`;

function injectCSS() {
  if (typeof document !== 'undefined' && !document.getElementById('ob-icon-css')) {
    const s = document.createElement('style');
    s.id = 'ob-icon-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
}

/* ── Shared coin shape helper ─────────────────────────────────────────────── */
function Coin({
  cx, cy, rx, ry,
  gradId, shimId,
  topColor, midColor, botColor,
  rimColor,
  children,
  style,
}: {
  cx: number; cy: number; rx: number; ry: number;
  gradId: string; shimId: string;
  topColor: string; midColor: string; botColor: string;
  rimColor: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <g style={style}>
      <defs>
        <radialGradient id={gradId} cx="38%" cy="32%" r="65%">
          <stop offset="0%"   stopColor={topColor} />
          <stop offset="55%"  stopColor={midColor} />
          <stop offset="100%" stopColor={botColor} />
        </radialGradient>
        <radialGradient id={shimId} cx="30%" cy="25%" r="55%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="60%"  stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* rim */}
      <ellipse cx={cx} cy={cy+ry*0.1} rx={rx} ry={ry*0.22} fill={rimColor} />
      {/* face */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${gradId})`} />
      {/* content */}
      {children}
      {/* gloss */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${shimId})`} />
      {/* edge highlight */}
      <ellipse cx={cx} cy={cy-ry*0.62} rx={rx*0.58} ry={ry*0.13}
        fill="white" opacity="0.35" />
    </g>
  );
}

/* ════════════════════════════════════════════════════════
   IconDocument — золотая монета «PRINT» с бумагой
═══════════════════════════════════════════════════════ */
export const IconDocument: React.FC<IconProps> = ({ size = 110, className }) => {
  injectCSS();
  return (
    <svg width={size} height={size} viewBox="0 0 110 110"
      xmlns="http://www.w3.org/2000/svg" className={className}
      style={{ overflow: 'visible' }}>

      {/* shadows */}
      <ellipse cx="55" cy="100" rx="28" ry="5"
        fill="#b8860b" style={{ animation: 'ob-pulse-shadow 3s ease-in-out infinite' }} />
      <ellipse cx="82" cy="100" rx="14" ry="3"
        fill="#7c3aed" opacity="0.18"
        style={{ animation: 'ob-pulse-shadow 3.4s ease-in-out infinite 0.5s' }} />

      {/* back small coin — purple */}
      <g style={{ animation: 'ob-float3 4.2s ease-in-out infinite 0.8s', transformOrigin: '82px 48px' }}>
        <Coin cx={82} cy={48} rx={18} ry={18}
          gradId="doc-p-g" shimId="doc-p-s"
          topColor="#a78bfa" midColor="#7c3aed" botColor="#4c1d95"
          rimColor="#6d28d9">
          <text x={82} y={53} textAnchor="middle"
            fontSize="12" fontWeight="900" fill="white" opacity="0.9"
            fontFamily="system-ui">P</text>
        </Coin>
      </g>

      {/* back small coin — silver */}
      <g style={{ animation: 'ob-float2 3.8s ease-in-out infinite 0.3s', transformOrigin: '28px 72px' }}>
        <Coin cx={28} cy={72} rx={14} ry={14}
          gradId="doc-s-g" shimId="doc-s-s"
          topColor="#e2e8f0" midColor="#94a3b8" botColor="#475569"
          rimColor="#64748b">
          <circle cx={28} cy={72} r={5} fill="white" opacity="0.25"/>
        </Coin>
      </g>

      {/* main gold coin */}
      <g style={{ animation: 'ob-float 3.5s ease-in-out infinite', transformOrigin: '52px 52px' }}>
        <Coin cx={52} cy={52} rx={36} ry={36}
          gradId="doc-g-g" shimId="doc-g-s"
          topColor="#fde68a" midColor="#f59e0b" botColor="#92400e"
          rimColor="#b45309">
          {/* doc icon inside */}
          <rect x={40} y={38} width={18} height={23} rx={2.5}
            fill="white" opacity="0.25" />
          <rect x={44} y={42} width={10} height={2} rx={1} fill="white" opacity="0.7"/>
          <rect x={44} y={46} width={7}  height={2} rx={1} fill="white" opacity="0.5"/>
          <rect x={44} y={50} width={9}  height={2} rx={1} fill="white" opacity="0.4"/>
          <path d="M52 38 L58 38 L58 44 L52 44 Z" fill="white" opacity="0.15"/>
          <path d="M52 38 L58 44 L52 44 Z" fill="#92400e" opacity="0.4"/>
        </Coin>
      </g>
    </svg>
  );
};

/* ════════════════════════════════════════════════════════
   IconUpload — синяя хромовая монета «↑»
═══════════════════════════════════════════════════════ */
export const IconUpload: React.FC<IconProps> = ({ size = 110, className }) => {
  injectCSS();
  return (
    <svg width={size} height={size} viewBox="0 0 110 110"
      xmlns="http://www.w3.org/2000/svg" className={className}
      style={{ overflow: 'visible' }}>

      <ellipse cx="52" cy="100" rx="28" ry="5"
        fill="#0284c7" style={{ animation: 'ob-pulse-shadow 3.2s ease-in-out infinite' }} />
      <ellipse cx="83" cy="99" rx="13" ry="3"
        fill="#0ea5e9" opacity="0.18"
        style={{ animation: 'ob-pulse-shadow 3.6s ease-in-out infinite 0.6s' }} />

      {/* small teal coin back-right */}
      <g style={{ animation: 'ob-float2 4s ease-in-out infinite 1s', transformOrigin: '83px 50px' }}>
        <Coin cx={83} cy={50} rx={17} ry={17}
          gradId="up-t-g" shimId="up-t-s"
          topColor="#67e8f9" midColor="#0891b2" botColor="#164e63"
          rimColor="#0e7490">
          <text x={83} y={55} textAnchor="middle"
            fontSize="11" fontWeight="900" fill="white" opacity="0.85"
            fontFamily="system-ui">↑</text>
        </Coin>
      </g>

      {/* small silver coin back-left */}
      <g style={{ animation: 'ob-float3 3.6s ease-in-out infinite 0.2s', transformOrigin: '26px 70px' }}>
        <Coin cx={26} cy={70} rx={13} ry={13}
          gradId="up-s-g" shimId="up-s-s"
          topColor="#e0f2fe" midColor="#7dd3fc" botColor="#0369a1"
          rimColor="#0284c7">
          <circle cx={26} cy={70} r={4} fill="white" opacity="0.3"/>
        </Coin>
      </g>

      {/* main blue chrome coin */}
      <g style={{ animation: 'ob-float 3.3s ease-in-out infinite', transformOrigin: '52px 52px' }}>
        <Coin cx={52} cy={52} rx={37} ry={37}
          gradId="up-m-g" shimId="up-m-s"
          topColor="#bae6fd" midColor="#0ea5e9" botColor="#0c4a6e"
          rimColor="#0369a1">
          {/* upload arrow */}
          <polygon points="52,33 43,44 48,44 48,56 56,56 56,44 61,44"
            fill="white" opacity="0.9"/>
          <rect x="46" y="58" width="12" height="2.5" rx="1.2"
            fill="white" opacity="0.5"/>
        </Coin>
      </g>
    </svg>
  );
};

/* ════════════════════════════════════════════════════════
   IconSettings — зелёная монета «⚙»
═══════════════════════════════════════════════════════ */
export const IconSettings: React.FC<IconProps> = ({ size = 110, className }) => {
  injectCSS();
  return (
    <svg width={size} height={size} viewBox="0 0 110 110"
      xmlns="http://www.w3.org/2000/svg" className={className}
      style={{ overflow: 'visible' }}>

      <ellipse cx="52" cy="100" rx="28" ry="5"
        fill="#059669" style={{ animation: 'ob-pulse-shadow 3.4s ease-in-out infinite' }} />
      <ellipse cx="82" cy="99" rx="13" ry="3"
        fill="#10b981" opacity="0.18"
        style={{ animation: 'ob-pulse-shadow 3.8s ease-in-out infinite 0.4s' }} />

      {/* small lime coin */}
      <g style={{ animation: 'ob-float3 4.1s ease-in-out infinite 0.9s', transformOrigin: '82px 49px' }}>
        <Coin cx={82} cy={49} rx={16} ry={16}
          gradId="set-l-g" shimId="set-l-s"
          topColor="#bbf7d0" midColor="#22c55e" botColor="#14532d"
          rimColor="#16a34a">
          <circle cx={82} cy={49} r={5} fill="white" opacity="0.25"/>
          <circle cx={82} cy={49} r={2.5} fill="#14532d" opacity="0.5"/>
        </Coin>
      </g>

      {/* small aqua coin */}
      <g style={{ animation: 'ob-float2 3.7s ease-in-out infinite 0.25s', transformOrigin: '27px 71px' }}>
        <Coin cx={27} cy={71} rx={13} ry={13}
          gradId="set-a-g" shimId="set-a-s"
          topColor="#a7f3d0" midColor="#34d399" botColor="#065f46"
          rimColor="#059669">
          <circle cx={27} cy={71} r={4} fill="white" opacity="0.3"/>
        </Coin>
      </g>

      {/* main green coin */}
      <g style={{ animation: 'ob-float 3.6s ease-in-out infinite', transformOrigin: '52px 52px' }}>
        <Coin cx={52} cy={52} rx={37} ry={37}
          gradId="set-m-g" shimId="set-m-s"
          topColor="#6ee7b7" midColor="#10b981" botColor="#064e3b"
          rimColor="#047857">
          {/* gear simplified */}
          <circle cx={52} cy={52} r={15} fill="none" stroke="white" strokeWidth="5" opacity="0.8"/>
          <circle cx={52} cy={52} r={6}  fill="white" opacity="0.85"/>
          {[0,45,90,135,180,225,270,315].map((deg, i) => {
            const rad = deg * Math.PI / 180;
            const x1 = 52 + Math.cos(rad) * 11;
            const y1 = 52 + Math.sin(rad) * 11;
            const x2 = 52 + Math.cos(rad) * 18;
            const y2 = 52 + Math.sin(rad) * 18;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.8"/>;
          })}
        </Coin>
      </g>
    </svg>
  );
};

/* ════════════════════════════════════════════════════════
   IconZap — оранжевая / золотая монета «⚡»
═══════════════════════════════════════════════════════ */
export const IconZap: React.FC<IconProps> = ({ size = 110, className }) => {
  injectCSS();
  return (
    <svg width={size} height={size} viewBox="0 0 110 110"
      xmlns="http://www.w3.org/2000/svg" className={className}
      style={{ overflow: 'visible' }}>

      <ellipse cx="52" cy="100" rx="28" ry="5"
        fill="#ea580c" style={{ animation: 'ob-pulse-shadow 3.1s ease-in-out infinite' }} />
      <ellipse cx="83" cy="99" rx="13" ry="3"
        fill="#fbbf24" opacity="0.2"
        style={{ animation: 'ob-pulse-shadow 3.5s ease-in-out infinite 0.7s' }} />

      {/* small gold coin */}
      <g style={{ animation: 'ob-float2 4.3s ease-in-out infinite 1.1s', transformOrigin: '83px 50px' }}>
        <Coin cx={83} cy={50} rx={16} ry={16}
          gradId="zap-g-g" shimId="zap-g-s"
          topColor="#fef08a" midColor="#eab308" botColor="#713f12"
          rimColor="#ca8a04">
          <text x={83} y={55} textAnchor="middle"
            fontSize="13" fontWeight="900" fill="white" opacity="0.9"
            fontFamily="system-ui">⚡</text>
        </Coin>
      </g>

      {/* small red coin */}
      <g style={{ animation: 'ob-float3 3.9s ease-in-out infinite 0.15s', transformOrigin: '26px 70px' }}>
        <Coin cx={26} cy={70} rx={13} ry={13}
          gradId="zap-r-g" shimId="zap-r-s"
          topColor="#fca5a5" midColor="#ef4444" botColor="#7f1d1d"
          rimColor="#dc2626">
          <circle cx={26} cy={70} r={4} fill="white" opacity="0.3"/>
        </Coin>
      </g>

      {/* main orange coin */}
      <g style={{ animation: 'ob-float 3.4s ease-in-out infinite', transformOrigin: '52px 52px' }}>
        <Coin cx={52} cy={52} rx={37} ry={37}
          gradId="zap-m-g" shimId="zap-m-s"
          topColor="#fed7aa" midColor="#f97316" botColor="#7c2d12"
          rimColor="#ea580c">
          {/* lightning bolt */}
          <polygon points="57,30 43,54 51,54 47,74 65,48 57,48"
            fill="white" opacity="0.92"/>
          <polygon points="57,33 46,53 52,53 49,67 61,50 55,50"
            fill="white" opacity="0.2"/>
        </Coin>
      </g>
    </svg>
  );
};
