/** 鸡你太美 hero。脚在踏板上；展板圆角裁切；轮子转、球转、车不散架。 */
export function JntmBanner() {
  return (
    <svg
      viewBox="0 0 1200 480"
      role="img"
      aria-label="鸡你太美：只因这只鹈鹕会骑车"
      className="h-auto w-full overflow-hidden rounded-xl border border-border"
    >
      <defs>
        <linearGradient id="jntmBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14110d" />
          <stop offset="1" stopColor="#241f18" />
        </linearGradient>
        <linearGradient id="jntmGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b8893a" />
          <stop offset="1" stopColor="#e8c36a" />
        </linearGradient>
        <linearGradient id="jntmSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7eefc" />
          <stop offset="0.62" stopColor="#a4cce8" />
          <stop offset="1" stopColor="#7eafd0" />
        </linearGradient>
        <linearGradient id="jntmBeak" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f3d48a" />
          <stop offset="0.55" stopColor="#e09a3a" />
          <stop offset="1" stopColor="#c47a22" />
        </linearGradient>
        <linearGradient id="jntmPouch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7e2a4" />
          <stop offset="1" stopColor="#d4ae62" />
        </linearGradient>
        <linearGradient id="jntmFeather" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#fffaf2" />
          <stop offset="0.55" stopColor="#efe6d4" />
          <stop offset="1" stopColor="#d4c4a8" />
        </linearGradient>
        <linearGradient id="jntmHair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d0d4dc" />
          <stop offset="0.35" stopColor="#8f96a0" />
          <stop offset="1" stopColor="#4e555e" />
        </linearGradient>
        <linearGradient id="jntmGrass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7aa85a" />
          <stop offset="1" stopColor="#4e7a38" />
        </linearGradient>
        <radialGradient id="jntmBall" cx="32%" cy="28%" r="72%">
          <stop offset="0" stopColor="#f4ae66" />
          <stop offset="0.5" stopColor="#e07028" />
          <stop offset="1" stopColor="#8f3e10" />
        </radialGradient>
        <radialGradient id="jntmTire" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#3e3e3e" />
          <stop offset="1" stopColor="#0e0e0e" />
        </radialGradient>
        <clipPath id="jntmPlate">
          <rect width="520" height="372" rx="22" />
        </clipPath>
        <filter id="jntmSoft" x="-8%" y="-8%" width="116%" height="124%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#0b0906" floodOpacity="0.4" />
        </filter>
        <pattern id="jntmGrain" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.35" fill="#efe6d4" opacity="0.07" />
        </pattern>
      </defs>

      <rect width="1200" height="480" fill="url(#jntmBg)" />
      <rect width="1200" height="480" fill="url(#jntmGrain)" />
      <path d="M0 428 C 260 398, 480 452, 760 416 C 980 386, 1100 438, 1200 412 V480 H0 Z" fill="#1a1712" />

      <text x="56" y="70" fill="#d4a24c" fontFamily="ui-monospace, Menlo, monospace" fontSize="14" letterSpacing="6">
        JNTM · PELICAN SALON
      </text>
      <text x="50" y="166" fill="#f3efe4" fontFamily="Georgia, 'Noto Serif SC', serif" fontSize="84" fontWeight="700">
        鸡你太美
      </text>
      <text x="56" y="214" fill="#d4a24c" fontFamily="Georgia, 'Noto Serif SC', serif" fontSize="26">
        只因这只鹈鹕会骑车
      </text>
      <text x="56" y="256" fill="#9a9183" fontFamily="Georgia, serif" fontSize="16">
        中分 · 吊带 · 项链 · 篮球在手上 · 脚还在脚踏上
      </text>

      <g transform="translate(628 44)" filter="url(#jntmSoft)">
        <g clipPath="url(#jntmPlate)">
          <rect width="520" height="372" rx="22" fill="url(#jntmSky)" />
          <rect x="0" y="276" width="520" height="96" fill="url(#jntmGrass)" />
          <path d="M0 276 H520" stroke="#d4a24c" strokeWidth="4" />
          <ellipse cx="262" cy="312" rx="168" ry="18" fill="#3f6a30" opacity="0.35" />

          <g transform="translate(28 4)">
            {/* 1 后轮 */}
            <g transform="translate(96 300)">
              <ellipse cx="6" cy="8" rx="50" ry="8" fill="#1a1712" opacity="0.18" />
              <circle r="46" fill="url(#jntmTire)" />
              <circle r="34" fill="none" stroke="#d4a24c" strokeWidth="3" />
              <circle r="31" fill="none" stroke="#2c2619" strokeWidth="1" />
              <g>
                <path
                  d="M0 -28 V28 M-28 0 H28 M-20 -20 L20 20 M-20 20 L20 -20"
                  fill="none"
                  stroke="#d9d0be"
                  strokeWidth="1.35"
                />
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.7s" repeatCount="indefinite" />
              </g>
              <circle r="7" fill="#d4a24c" stroke="#1c1812" strokeWidth="1.1" />
            </g>

            {/* 2 车架（在前后轮之间） */}
            <g fill="none" stroke="#1c1812" strokeLinecap="round" strokeLinejoin="round">
              <path d="M96 300 L168 188 L292 188 L360 300" strokeWidth="8" />
              <path d="M168 188 L220 262" strokeWidth="6.5" />
              <path d="M220 262 L96 300" strokeWidth="6" />
              <path d="M220 262 L360 300" strokeWidth="6" />
              <path d="M168 188 L154 132" strokeWidth="7" />
              <path d="M292 188 L308 170" strokeWidth="6" />
            </g>
            <g fill="none" stroke="#8a8376" strokeLinecap="round" opacity="0.55">
              <path d="M100 296 L170 192 L288 192 L356 296" strokeWidth="2" />
            </g>
            <ellipse cx="160" cy="128" rx="20" ry="7.5" fill="#2a241c" stroke="#1c1812" strokeWidth="1.4" transform="rotate(-16 160 128)" />
            <path d="M154 132 L132 118" stroke="#1c1812" strokeWidth="6" strokeLinecap="round" />
            <path d="M118 114 H142" stroke="#1c1812" strokeWidth="7" strokeLinecap="round" />

            {/* 3 牙盘（不转，脚才站得住） */}
            <g transform="translate(220 262)">
              <circle r="15" fill="none" stroke="#d4a24c" strokeWidth="3" />
              <circle r="5" fill="#1c1812" />
              <g transform="rotate(38)">
                <rect x="-3.5" y="6" width="7" height="26" rx="1.5" fill="#d4a24c" />
                <rect x="-13" y="28" width="22" height="7" rx="2.5" fill="#241f18" stroke="#1c1812" strokeWidth="0.8" />
              </g>
              <g transform="rotate(218)">
                <rect x="-3.5" y="6" width="7" height="26" rx="1.5" fill="#b8893a" />
                <rect x="-13" y="28" width="22" height="7" rx="2.5" fill="#241f18" stroke="#1c1812" strokeWidth="0.8" />
              </g>
            </g>

            {/* 4 远脚（上踏） */}
            <ellipse cx="198" cy="238" rx="13" ry="8" fill="#1a1712" stroke="#3d352b" strokeWidth="1.1" transform="rotate(-32 198 238)" />

            {/* 5 西裤 */}
            <path
              d="M176 198 C170 228 176 250 196 268 L214 258 C202 236 200 214 196 198 Z"
              fill="#7a7e86"
              stroke="#2c3036"
              strokeWidth="1.3"
            />
            <path
              d="M196 196 C214 214 236 236 258 250 L272 238 C244 220 220 202 208 190 Z"
              fill="#6c7078"
              stroke="#2c3036"
              strokeWidth="1.3"
            />

            {/* 6 近脚（下踏，压在踏板上） */}
            <ellipse cx="246" cy="292" rx="15" ry="9" fill="#14110d" stroke="#3d352b" strokeWidth="1.2" transform="rotate(28 246 292)" />

            {/* 7 身体 / 高领 / 吊带 / 项链 */}
            <ellipse cx="188" cy="172" rx="50" ry="38" fill="url(#jntmFeather)" stroke="#2a241c" strokeWidth="1.7" />
            <path d="M150 164 C186 126 228 150 226 178 L214 196 C186 208 154 196 150 174 Z" fill="#14110d" />
            <rect x="176" y="140" width="26" height="16" rx="8" fill="#0b0906" />
            <path d="M166 188 C170 158 174 142 178 138" fill="none" stroke="#d8c39a" strokeWidth="5.5" strokeLinecap="round" />
            <path d="M212 186 C206 156 202 142 198 138" fill="none" stroke="#cbb28a" strokeWidth="5.5" strokeLinecap="round" />
            <rect x="172" y="134" width="10" height="8" rx="1.5" fill="#d4a24c" stroke="#5c4a28" strokeWidth="0.7" />
            <rect x="194" y="134" width="10" height="8" rx="1.5" fill="#d4a24c" stroke="#5c4a28" strokeWidth="0.7" />
            <path d="M176 158 Q192 176 208 158" fill="none" stroke="#d4d8de" strokeWidth="1.8" />
            <circle cx="192" cy="176" r="4.2" fill="url(#jntmGold)" stroke="#5c4a28" strokeWidth="0.7" />

            {/* 8 后翅 */}
            <path
              d="M226 168 C278 150 322 172 344 208 C316 194 276 180 230 178 Z"
              fill="url(#jntmFeather)"
              stroke="#2a241c"
              strokeWidth="1.4"
            />

            {/* 9 头 + 中分 + 喙 */}
            <g transform="translate(232 118)">
              <circle r="28" fill="url(#jntmFeather)" stroke="#2a241c" strokeWidth="1.7" />
              <path d="M-1 -28 C-20 -32 -36 -14 -34 10 C-30 -2 -16 -6 -1 -8 C-4 -18 -3 -26 -1 -28 Z" fill="url(#jntmHair)" />
              <path d="M1 -28 C20 -32 36 -12 34 12 C30 0 16 -6 1 -8 C4 -18 3 -26 1 -28 Z" fill="url(#jntmHair)" />
              <path d="M0 -29 L0 -7" stroke="#f3efe4" strokeWidth="3" strokeLinecap="round" />
              <circle cx="9" cy="0" r="3.3" fill="#1c1812" />
              <circle cx="10.3" cy="-1.3" r="1.05" fill="#fffaf2" />
              <ellipse cx="44" cy="10" rx="38" ry="10" fill="url(#jntmBeak)" stroke="#8a5a20" strokeWidth="1.3" />
              <path d="M20 12 C46 32 70 14 74 12 C50 20 30 16 20 12 Z" fill="url(#jntmPouch)" stroke="#8a5a20" strokeWidth="1.1" />
            </g>

            {/* 10 前轮（压在车架前） */}
            <g transform="translate(360 300)">
              <circle r="46" fill="url(#jntmTire)" />
              <circle r="34" fill="none" stroke="#d4a24c" strokeWidth="3" />
              <circle r="31" fill="none" stroke="#2c2619" strokeWidth="1" />
              <g>
                <path
                  d="M0 -28 V28 M-28 0 H28 M-20 -20 L20 20 M-20 20 L20 -20"
                  fill="none"
                  stroke="#d9d0be"
                  strokeWidth="1.35"
                />
                <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.7s" repeatCount="indefinite" />
              </g>
              <circle r="7" fill="#d4a24c" stroke="#1c1812" strokeWidth="1.1" />
            </g>

            {/* 11 持球翅（最前） */}
            <g>
              <path d="M152 168 C118 150 92 118 78 86" fill="none" stroke="#2a241c" strokeWidth="13" strokeLinecap="round" />
              <path d="M152 168 C118 150 92 118 78 86" fill="none" stroke="#efe6d4" strokeWidth="8" strokeLinecap="round" />
              <g transform="translate(68 68)">
                <g>
                  <circle r="30" fill="url(#jntmBall)" stroke="#5a2a10" strokeWidth="1.5" />
                  <path d="M0 -30 C20 -8 20 8 0 30 C-20 8 -20 -8 0 -30 M-28 0 H28" fill="none" stroke="#5a2a10" strokeWidth="1.6" />
                  <ellipse cx="-8" cy="-9" rx="9" ry="5" fill="#fff" opacity="0.2" />
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2.6s" repeatCount="indefinite" />
                </g>
              </g>
            </g>
          </g>
        </g>
        <rect width="520" height="372" rx="22" fill="none" stroke="#3d352b" strokeWidth="1.2" />
      </g>
    </svg>
  );
}