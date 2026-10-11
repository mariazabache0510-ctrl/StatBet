export const TOPICS = {
  1: { key: 't1', short: 'Estimación', ticker: 'EST', icon: 'target' },
  2: { key: 't2', short: 'Hipótesis', ticker: 'HIP', icon: 'scales' },
  3: { key: 't3', short: 'Regresión', ticker: 'REG', icon: 'trend' },
  4: { key: 't4', short: 'ANOVA', ticker: 'ANV', icon: 'bars' },
};

export const QUADRANTS = {
  mastery: { label: 'Dominio', hint: 'Acertaste apostando fuerte: sabes que sabes.', tone: 'win' },
  doubt: { label: 'Duda', hint: 'Acertaste apostando poco: sabes, pero todavía dudas.', tone: 'cyan' },
  prudence: { label: 'Prudencia', hint: 'Fallaste apostando poco: sabías que no sabías.', tone: 'pink' },
  misconception: { label: 'Error de concepto', hint: 'Fallaste apostando fuerte: creías saber algo que no es así.', tone: 'loss' },
  none: { label: 'Sin apuesta', hint: 'No apostaste en esa ronda.', tone: 'muted' },
};

export const BADGES = {
  oracle: { label: 'Oráculo', desc: 'La mejor calibración del salón: tu confianza coincidió con tus aciertos.', icon: 'eye' },
  wolf: { label: 'Lobo de la Bolsa', desc: 'El mayor patrimonio al cierre del mercado.', icon: 'crown' },
  perfect: { label: 'Pleno estadístico', desc: 'Acertaste todas las afirmaciones.', icon: 'star' },
  streak: { label: 'Racha alcista', desc: 'Cuatro o más aciertos seguidos.', icon: 'trendUp' },
  allin: { label: 'All-in ganador', desc: 'Apostaste todas tus fichas y acertaste.', icon: 'bolt' },
  prudent: { label: 'Sabe lo que no sabe', desc: 'Cuando fallaste, siempre habías apostado poco.', icon: 'shield' },
  comeback: { label: 'Remontada', desc: 'Pediste un rescate al banco y aun así terminaste con ganancias.', icon: 'rocket' },
};

export const QUADRANT_THRESHOLD = 0.5;

export function quadrantOf(h) {
  if (!h || h.side === null || h.side === undefined) return 'none';
  const high = h.confidence >= QUADRANT_THRESHOLD;
  if (h.correct) return high ? 'mastery' : 'doubt';
  return high ? 'misconception' : 'prudence';
}

export function mmss(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function secs(ms) {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** Notas con coma decimal, como se escriben en Colombia. */
export function grade(n, digits = 1) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(digits).replace('.', ',');
}

export function dec(n, digits = 2) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(digits).replace('.', ',');
}

export function pct(n, digits = 0) {
  if (n === null || n === undefined) return '—';
  return `${(n * 100).toFixed(digits).replace('.', ',')} %`;
}

export function chips(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('es-CO');
}

export function signed(n) {
  if (!n) return '±0';
  return `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('es-CO')}`;
}

export function initials(name = '') {
  const parts = name.replace(/\(\d+\)/, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_COLORS = ['#ff4f9a', '#22d3ee', '#a78bfa', '#fbbf24', '#2dd4a7', '#f472b6', '#38bdf8', '#fb923c'];
export function colorFor(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const DIFFICULTY = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };

export function ordinal(n) {
  return `${n}.º`;
}

/** Probabilidad de acertar que declara una apuesta (0,5 a 1). */
export const probability = (confidence) => 0.5 + 0.5 * Math.min(1, Math.max(0, confidence));

/** Etiqueta de seguridad para el control de apuesta. */
export function confidenceLabel(c) {
  if (c >= 0.999) return 'All-in: seguridad total';
  if (c >= 0.75) return 'Muy seguro';
  if (c >= 0.5) return 'Bastante seguro';
  if (c >= 0.25) return 'Algo seguro';
  return 'Con dudas';
}

export function phaseLabel(phase) {
  return { lobby: 'Sala de espera', running: 'Mercado activo', paused: 'En pausa', finished: 'Mercado cerrado' }[phase] ?? phase;
}

/** Resalta asignaciones tipo «n = 36» o «R² = 0,81» como en las diapositivas. */
export function highlightTokens(text = '') {
  const re = /([^\s=,;:()«»]{1,8}\s=\s[−-]?\d+(?:[.,]\d+)?(?:\s?(?:mg|mm|cm|min|ms|h|s|%)(?![\p{L}]))?)/gu;
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], hl: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
