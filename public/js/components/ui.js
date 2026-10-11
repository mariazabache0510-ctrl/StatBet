import { html, useEffect, useRef, useState } from '../lib/html.js';
import { TOPICS, colorFor, initials, highlightTokens, chips as fmtChips } from '../lib/format.js';

const S = (d, extra = '') => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ...${extra ? { 'stroke-width': extra } : {}}>${d}</svg>`;

const ICONS = {
  target: S(html`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>`),
  scales: S(html`<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>`),
  trend: S(html`<path d="M3 3v18h18"/><path d="M7 16l4-4 3 2 5-6"/>`),
  bars: S(html`<path d="M3 21h18"/><rect x="5" y="12" width="3" height="6" rx="0.5" fill="currentColor"/><rect x="10.5" y="8" width="3" height="10" rx="0.5" fill="currentColor"/><rect x="16" y="4" width="3" height="14" rx="0.5" fill="currentColor"/>`),
  trendUp: S(html`<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>`),
  trendDown: S(html`<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>`),
  crown: html`<svg viewBox="0 0 24 20" fill="currentColor"><path d="M2 6l5 4 5-8 5 8 5-4-2 11H4z"/><rect x="4" y="18" width="16" height="2" rx="1"/></svg>`,
  clock: S(html`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  check: S(html`<path d="M5 12.5l4.5 4.5L19 7.5"/>`, '3'),
  x: S(html`<path d="M6 6l12 12M18 6L6 18"/>`, '3'),
  star: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`,
  bolt: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
  eye: S(html`<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>`),
  shield: S(html`<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>`),
  rocket: S(html`<path d="M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2M9 15l-3-3c1-4 4.5-8.5 12-9 0 7.5-5 11-9 12z"/><circle cx="14.5" cy="9.5" r="1.6"/>`),
  users: S(html`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/>`),
  coins: S(html`<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3"/>`),
  wallet: S(html`<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/><path d="M6 6l9-3 1.5 3"/>`),
  play: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>`,
  pause: html`<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>`,
  stop: html`<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="5.5" width="13" height="13" rx="2"/></svg>`,
  sound: S(html`<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>`),
  mute: S(html`<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/>`),
  lock: S(html`<rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>`),
  unlock: S(html`<rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>`),
  trophy: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10v5a5 5 0 0 1-10 0zM5 4H2.5v2A3.5 3.5 0 0 0 6 9.5M19 4h2.5v2A3.5 3.5 0 0 1 18 9.5" stroke="currentColor" stroke-width="1.8" fill-rule="evenodd"/><path d="M10.5 13h3v4h-3zM7.5 18h9v2.5h-9z"/></svg>`,
  download: S(html`<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>`),
  expand: S(html`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`),
  gear: S(html`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`),
  book: S(html`<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7.5h8M8 11h6"/>`),
  link: S(html`<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>`),
  monitor: S(html`<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 16.5V21"/>`),
  back: S(html`<path d="M15 5l-7 7 7 7"/>`, '2.4'),
  plus: S(html`<path d="M12 5v14M5 12h14"/>`, '2.6'),
  minus: S(html`<path d="M5 12h14"/>`, '2.6'),
  trash: S(html`<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/>`),
  rotate: S(html`<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>`),
  logout: S(html`<path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/>`),
  chevron: S(html`<path d="M9 5l7 7-7 7"/>`, '2.6'),
  caretUp: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 6l8 11H4z"/></svg>`,
  caretDown: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 18L4 7h16z"/></svg>`,
  file: S(html`<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>`),
  bank: S(html`<path d="M3 9l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>`),
  alert: S(html`<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>`, '2.2'),
  info: S(html`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>`, '2.2'),
  bulb: S(html`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1.3 1.7 1.4 2.5h5.2c.1-.8.6-1.7 1.4-2.5A6 6 0 0 0 12 3z"/>`),
  gauge: S(html`<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 13l4-5"/><circle cx="12" cy="13" r="1.5" fill="currentColor"/>`),
  hourglass: S(html`<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>`),
  sparkle: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/></svg>`,
};

export function Icon({ name, size, cls = '' }) {
  const icon = ICONS[name] ?? ICONS.star;
  return html`<span class=${`icon ${cls}`} aria-hidden="true" style=${size ? `width:${size}px;height:${size}px` : ''}>${icon}</span>`;
}

/** Marca de StatBet: ficha con una «S» y la palabra con degradado rosa → cian. */
export function Logo({ size = 40, word = true, sub = null }) {
  return html`<span class="logo" style=${`--logo:${size}px`}>
    <svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg-sb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4f9a"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#lg-sb)"/>
      <circle cx="32" cy="32" r="30" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="9 7.7" opacity=".9"/>
      <circle cx="32" cy="32" r="20" fill="#0b1026"/>
      <path d="M38.5 25.5c-1.6-2.2-4-3.3-6.8-3.3-3.6 0-6.2 1.9-6.2 4.8 0 6.4 13.3 3.6 13.3 10.4 0 3.2-2.9 5.4-6.9 5.4-3.1 0-5.7-1.3-7.3-3.6" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>
    </svg>
    ${word ? html`<span class="logo-word"><b>Stat</b><i>Bet</i>${sub ? html`<small>${sub}</small>` : null}</span>` : null}
  </span>`;
}

export function TopicPill({ topic, name, compact = false }) {
  const meta = TOPICS[topic];
  if (!meta) return null;
  return html`<span class=${`pill topic-pill ${meta.key}`}><${Icon} name=${meta.icon} size=${14} />${compact ? meta.ticker : name ?? meta.short}</span>`;
}

export function TruthBadge({ truth, big = false }) {
  return html`<span class=${`truth-badge ${truth ? 'is-true' : 'is-false'} ${big ? 'big' : ''}`}>
    <${Icon} name=${truth ? 'check' : 'x'} />${truth ? 'Verdadera' : 'Falsa'}
  </span>`;
}

/** Ficha de casino en CSS (cara superior). `tone`: pink | cyan | violet | gold | ink. */
export function Chip({ tone = 'pink', size = 44, label = null, spin = false }) {
  return html`<span class=${`chip chip-${tone} ${spin ? 'spin' : ''}`} style=${`--chip:${size}px`} aria-hidden="true">
    <span class="chip-face"><span class="chip-inner">${label}</span></span>
  </span>`;
}

/** Pila de fichas con perspectiva; `count` fichas visibles (máximo 14). */
export function ChipStack({ count = 5, tone = 'pink', size = 46, max = 14 }) {
  const n = Math.max(0, Math.min(max, Math.round(count)));
  return html`<span class=${`chip-stack chip-${tone}`} style=${`--chip:${size}px;--n:${n}`} aria-hidden="true">
    ${Array.from({ length: n }, (_, i) => html`<span class="stack-chip" style=${`--i:${i}`}></span>`)}
  </span>`;
}

/** Ficha 3D girando (CSS preserve-3d) para la billetera y el lobby. */
export function Coin3D({ size = 120, value = null, tone = 'brand', spinning = true }) {
  return html`<div class=${`coin3d ${spinning ? 'spinning' : ''} coin-${tone}`} style=${`--coin:${size}px`} aria-hidden="true">
    <div class="coin3d-body">
      ${Array.from({ length: 8 }, (_, i) => html`<span class="coin3d-edge" style=${`--z:${i}`}></span>`)}
      <span class="coin3d-face front"><span>${value ?? 'S'}</span></span>
      <span class="coin3d-face back"><span>${value ?? 'B'}</span></span>
    </div>
    <span class="coin3d-shadow"></span>
  </div>`;
}

/** Número que se anima de su valor anterior al nuevo. */
export function AnimatedNumber({ value, format = fmtChips, ms = 900 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (value === null || value === undefined) return undefined;
    const start = performance.now();
    const a = from.current ?? value;
    const b = value;
    if (a === b || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = b;
      setShown(b);
      return undefined;
    }
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(a + (b - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = b;
    };
  }, [value]);
  return html`<span class="num">${format(shown)}</span>`;
}

/** Cuenta regresiva en anillo. */
export function RingTimer({ ms, totalMs, size = 64, paused = false, label = null }) {
  const k = totalMs ? Math.max(0, Math.min(1, ms / totalMs)) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const danger = ms <= 5000 && !paused;
  const warn = ms <= 15000 && !paused;
  return html`<span class=${`ring-timer ${danger ? 'danger' : warn ? 'warn' : ''} ${paused ? 'paused' : ''}`} style=${`--ring:${size}px`} role="timer" aria-label=${`Quedan ${Math.ceil(ms / 1000)} segundos`}>
    <svg viewBox="0 0 64 64">
      <circle cx="32" cy="32" r=${r} class="ring-track" />
      <circle cx="32" cy="32" r=${r} class="ring-bar" style=${`stroke-dasharray:${c};stroke-dashoffset:${c * (1 - k)}`} />
    </svg>
    <span class="ring-text">${paused ? html`<${Icon} name="pause" size=${size * 0.3} />` : label ?? Math.ceil(ms / 1000)}</span>
  </span>`;
}

export function Avatar({ id, name, size = 36, online = true, title }) {
  return html`<span class=${`avatar ${online ? '' : 'offline'}`} style=${`--s:${size}px;--c:${colorFor(id || name)}`} title=${title ?? name}>${initials(name)}</span>`;
}

// Inter no trae bien los diacríticos combinantes (x̄, ŷ): se dibujan con CSS sobre la letra base.
const MARK_RE = /(\S)([\u0302\u0304\u0305])/gu;
const TALL = /[A-Zbdfhklt0-9ÁÉÍÓÚÑβδθλ]/u;

export function MathText({ text }) {
  const s = String(text ?? '');
  if (!/[\u0302\u0304\u0305]/u.test(s)) return s;
  const out = [];
  let last = 0;
  for (const m of s.matchAll(MARK_RE)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const kind = m[2] === '\u0302' ? 'mk-hat' : 'mk-bar';
    out.push(html`<span class=${`${kind} ${TALL.test(m[1]) ? 'tall' : ''}`}>${m[1]}<span class="mk-src">${m[2]}</span></span>`);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Texto con los valores «x = 12» resaltados y la notación x̄ / ŷ bien dibujada. */
export function Rich({ text }) {
  return highlightTokens(text || '').map((p) => (p.hl ? html`<span class="hl"><${MathText} text=${p.t} /></span>` : html`<${MathText} text=${p.t} />`));
}

/** Confeti ligero en canvas con la paleta rosa/cian (se omite con movimiento reducido). */
export function Confetti({ fire }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!fire || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#ff4f9a', '#22d3ee', '#a78bfa', '#ffffff', '#ff7ab6', '#67e8f9'];
    const parts = Array.from({ length: 150 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.4,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 13,
      vy: -Math.random() * 13 - 4,
      r: Math.random() * 7 + 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() < 0.4,
    }));
    let raf;
    const start = performance.now();
    const step = (t) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.34;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        if (p.round) {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r / 2, p.r / 3.2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      }
      if (t - start < 3600) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return html`<canvas ref=${ref} class="confetti-canvas" aria-hidden="true"></canvas>`;
}

/** Pila de avisos breves. `group` reemplaza el aviso anterior del mismo grupo. */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = (text, { kind = 'info', ms = 3200, icon, group } = {}) => {
    const id = Math.random().toString(36).slice(2);
    const item = { id, text, kind, group, icon: icon ?? (kind === 'error' ? 'alert' : null) };
    setToasts((t) => [...t.filter((x) => !group || x.group !== group).slice(-3), item]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  };
  return [toasts, push];
}

export function Toasts({ toasts }) {
  return html`<div class="toast-stack" role="status" aria-live="polite">
    ${toasts.map((t) => html`<div key=${t.id} class=${`toast ${t.kind}`}>
      ${t.icon ? html`<span class="toast-icon"><${Icon} name=${t.icon} size=${16} /></span>` : null}<span>${t.text}</span>
    </div>`)}
  </div>`;
}

export function ConnectionBanner({ status }) {
  if (status !== 'reconnecting' && status !== 'connecting') return null;
  return html`<div class="conn-banner" role="status"><span class="spinner"></span>${status === 'connecting' ? 'Conectando…' : 'Reconectando… tus fichas están a salvo'}</div>`;
}

export function SoundToggle({ muted, onToggle }) {
  return html`<button class="icon-btn" onClick=${onToggle} aria-label=${muted ? 'Activar sonido' : 'Silenciar'} title=${muted ? 'Activar sonido' : 'Silenciar'}>
    <${Icon} name=${muted ? 'mute' : 'sound'} size=${20} />
  </button>`;
}

export function Footer() {
  return html`<p class="footer-note">Análisis Cuantitativo de Datos · StatBet</p>`;
}

/** Barra dividida Verdadero/Falso (cian/rosa) con porcentajes. */
export function SplitBar({ a, b, labelA = 'Verdadero', labelB = 'Falso', unit = '', highlight = null }) {
  const total = a + b;
  const pa = total ? (a / total) * 100 : 50;
  return html`<div class="split">
    <div class="split-bar" role="img" aria-label=${`${labelA} ${Math.round(pa)} %, ${labelB} ${Math.round(100 - pa)} %`}>
      <span class=${`split-a ${highlight === true ? 'hot' : highlight === false ? 'dim' : ''}`} style=${`width:${pa}%`}></span>
      <span class=${`split-b ${highlight === false ? 'hot' : highlight === true ? 'dim' : ''}`} style=${`width:${100 - pa}%`}></span>
    </div>
    <div class="split-legend">
      <span class="t-true"><b>${total ? Math.round(pa) : 0} %</b> ${labelA}${unit ? html` · ${fmtChips(a)} ${unit}` : null}</span>
      <span class="t-false">${labelB}${unit ? html` · ${fmtChips(b)} ${unit}` : null} <b>${total ? Math.round(100 - pa) : 0} %</b></span>
    </div>
  </div>`;
}

/** Histograma de confianza (5 tramos) con aciertos/errores apilados. */
export function ConfidenceHistogram({ histogram = [], labels = ['0–20', '20–40', '40–60', '60–80', '80–100'] }) {
  const max = Math.max(1, ...histogram.map((h) => h.right + h.wrong));
  return html`<div class="histo" role="img" aria-label="Distribución de la confianza de las apuestas">
    ${histogram.map((h, i) => html`<div class="histo-col">
      <div class="histo-bar">
        <span class="histo-wrong" style=${`height:${(h.wrong / max) * 100}%`} title=${`${h.wrong} fallaron`}></span>
        <span class="histo-right" style=${`height:${(h.right / max) * 100}%`} title=${`${h.right} acertaron`}></span>
      </div>
      <span class="histo-label">${labels[i]} %</span>
    </div>`)}
  </div>`;
}
