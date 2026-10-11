import { html } from '../lib/html.js';
import { TOPICS, pct } from '../lib/format.js';
import { Icon } from './ui.js';

/**
 * Curva de calibración: eje x = probabilidad declarada (0,5–1), eje y = acierto real.
 * La diagonal es la calibración perfecta; por debajo hay sobreconfianza, por encima prudencia.
 */
export function CalibrationChart({ curve = [], height = 260, light = false }) {
  const W = 420;
  const H = 300;
  const pad = { l: 46, r: 16, t: 16, b: 42 };
  const x = (p) => pad.l + ((p - 0.5) / 0.5) * (W - pad.l - pad.r);
  const y = (a) => H - pad.b - a * (H - pad.t - pad.b);
  const pts = curve.filter((c) => c.bets > 0 && c.actual !== null && c.expected !== null);
  const maxBets = Math.max(1, ...pts.map((p) => p.bets));
  const ink = light ? '#1b2050' : '#c3c9ea';
  const grid = light ? 'rgba(27,32,80,0.12)' : 'rgba(160,172,230,0.16)';
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.expected).toFixed(1)},${y(p.actual).toFixed(1)}`).join(' ');
  return html`<svg class="calib-chart" viewBox=${`0 0 ${W} ${H}`} style=${`height:${height}px`} role="img" aria-label="Curva de calibración del curso">
    <defs>
      <linearGradient id="calib-line" x1="0" x2="1"><stop offset="0" stop-color="#ff4f9a"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
    </defs>
    <polygon points=${`${x(0.5)},${y(0.5)} ${x(1)},${y(1)} ${x(1)},${y(0)} ${x(0.5)},${y(0)}`} fill="rgba(255,107,87,0.07)" />
    <polygon points=${`${x(0.5)},${y(0.5)} ${x(1)},${y(1)} ${x(0.5)},${y(1)}`} fill="rgba(34,211,238,0.06)" />
    ${[0, 0.25, 0.5, 0.75, 1].map((a) => html`<g key=${`y${a}`}>
      <line x1=${pad.l} x2=${W - pad.r} y1=${y(a)} y2=${y(a)} stroke=${grid} />
      <text x=${pad.l - 8} y=${y(a) + 4} text-anchor="end" font-size="12" fill=${ink}>${Math.round(a * 100)}</text>
    </g>`)}
    ${[0.5, 0.625, 0.75, 0.875, 1].map((p) => html`<text key=${`x${p}`} x=${x(p)} y=${H - pad.b + 18} text-anchor="middle" font-size="12" fill=${ink}>${Math.round(p * 100)}</text>`)}
    <text x=${(pad.l + W - pad.r) / 2} y=${H - 6} text-anchor="middle" font-size="12" fill=${ink} opacity="0.8">Seguridad declarada (%)</text>
    <text x="12" y=${(pad.t + H - pad.b) / 2} text-anchor="middle" font-size="12" fill=${ink} opacity="0.8" transform=${`rotate(-90 12 ${(pad.t + H - pad.b) / 2})`}>Acierto real (%)</text>
    <line x1=${x(0.5)} y1=${y(0.5)} x2=${x(1)} y2=${y(1)} stroke=${ink} stroke-dasharray="6 6" opacity="0.55" />
    <text x=${x(0.97)} y=${y(0.97) - 10} text-anchor="end" font-size="11" fill=${ink} opacity="0.75">calibración perfecta</text>
    <text x=${x(0.98)} y=${y(0.12)} text-anchor="end" font-size="11" fill="#ff6b57" opacity="0.9">sobreconfianza</text>
    <text x=${x(0.52)} y=${y(0.92)} font-size="11" fill="#22d3ee" opacity="0.9">prudencia</text>
    ${path ? html`<path d=${path} fill="none" stroke="url(#calib-line)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />` : null}
    ${pts.map((p) => html`<g key=${p.label}>
      <circle cx=${x(p.expected)} cy=${y(p.actual)} r=${5 + 7 * Math.sqrt(p.bets / maxBets)} fill=${p.actual + 0.02 < p.expected ? '#ff4f9a' : '#22d3ee'} stroke=${light ? '#fff' : '#0b1026'} stroke-width="2.5" />
      <title>${`${p.label}: ${p.bets} apuestas, acierto ${Math.round(p.actual * 100)} % vs. ${Math.round(p.expected * 100)} % declarado`}</title>
    </g>`)}
    ${pts.length === 0 ? html`<text x=${W / 2} y=${H / 2} text-anchor="middle" font-size="14" fill=${ink}>Aún no hay apuestas reveladas</text>` : null}
  </svg>`;
}

/** Acierto por tema (barra) frente a la seguridad media declarada (marcador). */
export function TopicBars({ byTopic = [] }) {
  return html`<div class="topic-bars">
    ${byTopic.map((t) => {
      const meta = TOPICS[t.topic] ?? TOPICS[1];
      const acc = t.accuracy ?? 0;
      const bias = t.bias;
      const tag = bias === null ? null : bias > 0.08 ? { cls: 'over', text: 'sobreconfianza' } : bias < -0.08 ? { cls: 'under', text: 'subconfianza' } : { cls: 'ok', text: 'calibrado' };
      return html`<div key=${t.topic} class=${`topic-bar ${meta.key}`}>
        <div class="tb-head">
          <span class="tb-name"><${Icon} name=${meta.icon} size=${16} />${t.name ?? meta.short}</span>
          <span class="tb-val">${t.accuracy === null ? '—' : pct(acc)}</span>
        </div>
        <div class="tb-track">
          <span class="tb-fill" style=${`width:${acc * 100}%`}></span>
          ${t.meanProbability !== null ? html`<span class="tb-mark" style=${`left:${t.meanProbability * 100}%`} title=${`Seguridad media declarada: ${pct(t.meanProbability)}`}></span>` : null}
        </div>
        <div class="tb-foot">
          <span>${t.bets} apuestas</span>
          ${tag ? html`<span class=${`tb-tag ${tag.cls}`}>${tag.text}</span>` : null}
        </div>
      </div>`;
    })}
  </div>`;
}

/** Medidor del índice de riesgo (confianza perdida promedio) de una afirmación. */
export function RiskMeter({ value = 0 }) {
  return html`<span class="risk-meter" title=${`Índice de riesgo ${pct(value)}`}>
    <span class="risk-fill" style=${`width:${Math.min(100, value * 200)}%`}></span>
  </span>`;
}
