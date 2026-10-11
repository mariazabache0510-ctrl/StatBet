/**
 * Puntuación de StatBet. Funciones puras (sin estado de sala) para poder probarlas.
 *
 * Confianza c = fichas apostadas / fichas disponibles al abrir la ronda (0 a 1).
 * Se traduce a la probabilidad de acertar que el estudiante declara: p = 0,5 + 0,5·c
 * (apostar casi nada = «moneda al aire», apostar todo = «estoy 100 % seguro»).
 *
 * Calibración por ronda (puntuación de Brier): s = 1 − (o − p)², con o = 1 si acertó.
 * Es una regla «propia»: el promedio esperado es máximo cuando p refleja la seguridad real,
 * así que ni apostar siempre todo ni apostar siempre lo mínimo es una buena estrategia.
 * Una ronda sin apuesta equivale a p = 0,5 (s = 0,75) y cuenta como no acertada.
 *
 * Nota (0 a 5) = wA · aciertos(0–5) + wC · calibración(0–5), con
 * calibración(0–5) = 5 · clamp((s̄ − 0,5) / 0,5): s̄ = 0,5 (todo o nada al azar) → 0; s̄ = 1 → 5.
 */

export const DEFAULT_SCORING = {
  weights: { accuracy: 0.6, calibration: 0.4 },
  highConfidence: 0.5,
};

export const QUADRANTS = {
  mastery: { label: 'Dominio', hint: 'Acertó y apostó fuerte: sabe que sabe.' },
  doubt: { label: 'Duda', hint: 'Acertó pero apostó poco: sabe, pero todavía duda.' },
  prudence: { label: 'Prudencia', hint: 'Falló apostando poco: sabe que no sabe.' },
  misconception: { label: 'Error de concepto', hint: 'Falló apostando fuerte: cree saber algo que no es así.' },
  none: { label: 'Sin apuesta', hint: 'No apostó en esa ronda.' },
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function normalizeWeights(w = {}) {
  const a = Math.max(0, Number(w.accuracy) || 0);
  const c = Math.max(0, Number(w.calibration) || 0);
  const total = a + c;
  if (total <= 0) return { ...DEFAULT_SCORING.weights };
  return { accuracy: round(a / total, 4), calibration: round(c / total, 4) };
}

export function confidenceOf(stake, balanceBefore) {
  if (!balanceBefore || balanceBefore <= 0) return 0;
  return clamp01(stake / balanceBefore);
}

export const probabilityOf = (confidence) => 0.5 + 0.5 * clamp01(confidence);

/** Calibración de una ronda (0 a 1). `correct` null = sin apuesta. */
export function roundCalibration(confidence, correct) {
  if (correct === null || correct === undefined) return 0.75;
  const p = probabilityOf(confidence);
  const o = correct ? 1 : 0;
  return 1 - (o - p) ** 2;
}

export const calibrationToGrade = (meanScore) => 5 * clamp01((meanScore - 0.5) / 0.5);

export function quadrantOf(entry, threshold = DEFAULT_SCORING.highConfidence) {
  if (!entry || entry.side === null || entry.side === undefined) return 'none';
  const high = entry.confidence >= threshold;
  if (entry.correct) return high ? 'mastery' : 'doubt';
  return high ? 'misconception' : 'prudence';
}

/**
 * Resumen de un jugador a partir de su historial de rondas reveladas.
 * history: [{ round, side|null, stake, balanceBefore, confidence, correct|null, delta }]
 */
export function summarizePlayer(history, { weights = DEFAULT_SCORING.weights, threshold = DEFAULT_SCORING.highConfidence } = {}) {
  const w = normalizeWeights(weights);
  const rounds = history.length;
  const answered = history.filter((h) => h.side !== null && h.side !== undefined);
  const correct = answered.filter((h) => h.correct).length;
  const quadrants = { mastery: 0, doubt: 0, prudence: 0, misconception: 0, none: 0 };
  let calibSum = 0;
  let streak = 0;
  let bestStreak = 0;
  for (const h of history) {
    quadrants[quadrantOf(h, threshold)] += 1;
    calibSum += roundCalibration(h.confidence ?? 0, h.side === null || h.side === undefined ? null : h.correct);
    streak = h.correct ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  const accuracy = rounds ? correct / rounds : 0;
  const calibrationMean = rounds ? calibSum / rounds : 0;
  const accuracyGrade = 5 * accuracy;
  const calibrationGrade = rounds ? calibrationToGrade(calibrationMean) : 0;
  const grade = w.accuracy * accuracyGrade + w.calibration * calibrationGrade;
  const meanProbability = answered.length ? answered.reduce((s, h) => s + probabilityOf(h.confidence), 0) / answered.length : null;
  const answeredAccuracy = answered.length ? correct / answered.length : null;
  const meanConfidenceRight = mean(answered.filter((h) => h.correct).map((h) => h.confidence));
  const meanConfidenceWrong = mean(answered.filter((h) => !h.correct).map((h) => h.confidence));
  return {
    rounds,
    answered: answered.length,
    correct,
    accuracy: round(accuracy, 4),
    accuracyGrade: round(accuracyGrade),
    calibrationMean: round(calibrationMean, 4),
    calibrationGrade: round(calibrationGrade),
    grade: round(grade),
    weights: w,
    quadrants,
    bestStreak,
    /** Positivo = sobreconfianza (cree acertar más de lo que acierta). */
    confidenceBias: meanProbability === null ? null : round(meanProbability - answeredAccuracy, 4),
    meanConfidenceRight: meanConfidenceRight === null ? null : round(meanConfidenceRight, 4),
    meanConfidenceWrong: meanConfidenceWrong === null ? null : round(meanConfidenceWrong, 4),
  };
}

function mean(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

/** Ranking del juego: patrimonio neto (fichas − préstamos), luego nota, luego nombre. */
export function compareStandings(a, b) {
  return b.net - a.net || b.grade - a.grade || b.correct - a.correct || a.name.localeCompare(b.name, 'es');
}

/** Puestos con empates compartidos (mismo patrimonio y misma nota = mismo puesto). */
export function assignPlaces(sorted, key = (x) => `${x.net}|${x.grade}`) {
  let place = 0;
  let prev = null;
  sorted.forEach((x, i) => {
    const k = key(x);
    if (k !== prev) place = i + 1;
    prev = k;
    x.place = place;
  });
  return sorted;
}

/** Escenarios de ejemplo para la vista previa de la fórmula en el panel. */
export function scenarioGrades(weights) {
  const n = 12;
  const make = (correctCount, confRight, confWrong) =>
    Array.from({ length: n }, (_, i) => {
      const correct = i < correctCount;
      return { side: true, confidence: correct ? confRight : confWrong, correct };
    });
  const cases = [
    { label: '12/12 apostando todo', history: make(12, 1, 1) },
    { label: '9/12, fuerte al acertar y poco al fallar', history: make(9, 0.8, 0.15) },
    { label: '9/12 apostando siempre todo', history: make(9, 1, 1) },
    { label: '9/12 apostando siempre lo mínimo', history: make(9, 0.05, 0.05) },
    { label: '6/12 apostando siempre todo', history: make(6, 1, 1) },
    { label: '6/12 apostando poco (sabe que duda)', history: make(6, 0.1, 0.1) },
  ];
  return cases.map((c) => ({ label: c.label, ...summarizePlayer(c.history, { weights }) }));
}
