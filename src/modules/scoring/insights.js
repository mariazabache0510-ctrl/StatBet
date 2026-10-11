import { DEFAULT_SCORING, probabilityOf, quadrantOf } from './scoring.js';

const round = (x, d = 4) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/** Tramos de confianza para la curva de calibración del curso. */
export const CONFIDENCE_BINS = [
  { from: 0, to: 0.2, label: '0–20 %' },
  { from: 0.2, to: 0.4, label: '20–40 %' },
  { from: 0.4, to: 0.6, label: '40–60 %' },
  { from: 0.6, to: 0.8, label: '60–80 %' },
  { from: 0.8, to: 1.0001, label: '80–100 %' },
];

const binOf = (c) => CONFIDENCE_BINS.findIndex((b) => c >= b.from && c < b.to);

/**
 * Estadística de una ronda revelada a partir de las apuestas.
 * bets: [{ side: boolean|null, stake, confidence, correct|null }]
 */
export function roundStats(statement, bets, threshold = DEFAULT_SCORING.highConfidence) {
  const placed = bets.filter((b) => b.side !== null && b.side !== undefined);
  const onTrue = placed.filter((b) => b.side === true);
  const onFalse = placed.filter((b) => b.side === false);
  const right = placed.filter((b) => b.correct);
  const wrong = placed.filter((b) => !b.correct);
  const histogram = CONFIDENCE_BINS.map(() => ({ right: 0, wrong: 0 }));
  for (const b of placed) histogram[Math.max(0, binOf(b.confidence))][b.correct ? 'right' : 'wrong'] += 1;
  const confidentWrong = wrong.filter((b) => b.confidence >= threshold).length;
  return {
    eligible: bets.length,
    bettors: placed.length,
    abstained: bets.length - placed.length,
    onTrue: onTrue.length,
    onFalse: onFalse.length,
    chipsTrue: onTrue.reduce((s, b) => s + b.stake, 0),
    chipsFalse: onFalse.reduce((s, b) => s + b.stake, 0),
    right: right.length,
    wrong: wrong.length,
    accuracy: placed.length ? round(right.length / placed.length) : null,
    meanConfidence: round(mean(placed.map((b) => b.confidence))),
    meanConfidenceWrong: round(mean(wrong.map((b) => b.confidence))),
    confidentWrong,
    /** Confianza perdida promedio: media de la confianza de quienes fallaron, contando 0 para quienes acertaron. */
    riskIndex: placed.length ? round(wrong.reduce((s, b) => s + b.confidence, 0) / placed.length) : 0,
    chipsWon: right.reduce((s, b) => s + b.stake, 0),
    chipsLost: wrong.reduce((s, b) => s + b.stake, 0),
    histogram,
    truth: statement.truth,
  };
}

/**
 * Reporte del curso. rounds: [{ index, statement, bets: [{ playerId, side, stake, confidence, correct }] }]
 */
export function classInsights(rounds, { topics = [], threshold = DEFAULT_SCORING.highConfidence } = {}) {
  const perStatement = rounds.map((r) => ({
    index: r.index,
    id: r.statement.id,
    topic: r.statement.topic,
    statement: r.statement.statement,
    truth: r.statement.truth,
    concept: r.statement.concept,
    misconception: r.statement.misconception,
    explanation: r.statement.explanation,
    ...roundStats(r.statement, r.bets, threshold),
  }));

  const critical = [...perStatement]
    .filter((s) => s.bettors > 0 && s.wrong > 0)
    .sort((a, b) => b.riskIndex - a.riskIndex || b.confidentWrong - a.confidentWrong || a.index - b.index);

  const allBets = rounds.flatMap((r) => r.bets.filter((b) => b.side !== null && b.side !== undefined).map((b) => ({ ...b, topic: r.statement.topic })));

  const byTopic = topics.map((t) => {
    const list = allBets.filter((b) => b.topic === t.id);
    const acc = list.length ? list.filter((b) => b.correct).length / list.length : null;
    const p = mean(list.map((b) => probabilityOf(b.confidence)));
    return {
      topic: t.id,
      name: t.name,
      bets: list.length,
      accuracy: round(acc),
      meanProbability: round(p),
      bias: acc === null ? null : round(p - acc),
      confidentWrong: list.filter((b) => !b.correct && b.confidence >= threshold).length,
    };
  });

  const curve = CONFIDENCE_BINS.map((bin, i) => {
    const list = allBets.filter((b) => binOf(b.confidence) === i);
    return {
      label: bin.label,
      bets: list.length,
      expected: round(mean(list.map((b) => probabilityOf(b.confidence)))),
      actual: list.length ? round(list.filter((b) => b.correct).length / list.length) : null,
    };
  });

  const quadrants = { mastery: 0, doubt: 0, prudence: 0, misconception: 0 };
  for (const b of allBets) quadrants[quadrantOf(b, threshold)] += 1;

  const concepts = new Map();
  for (const s of perStatement) {
    const c = concepts.get(s.concept) ?? { concept: s.concept, topic: s.topic, statements: 0, bettors: 0, wrong: 0, confidentWrong: 0, riskSum: 0 };
    c.statements += 1;
    c.bettors += s.bettors;
    c.wrong += s.wrong;
    c.confidentWrong += s.confidentWrong;
    c.riskSum += s.riskIndex * s.bettors;
    concepts.set(s.concept, c);
  }
  const byConcept = [...concepts.values()]
    .map((c) => ({ ...c, riskIndex: c.bettors ? round(c.riskSum / c.bettors) : 0, riskSum: undefined }))
    .sort((a, b) => b.riskIndex - a.riskIndex);

  const totalAcc = allBets.length ? allBets.filter((b) => b.correct).length / allBets.length : null;
  const totalP = mean(allBets.map((b) => probabilityOf(b.confidence)));
  return {
    perStatement,
    critical,
    byTopic,
    byConcept,
    curve,
    quadrants,
    totals: {
      bets: allBets.length,
      accuracy: round(totalAcc),
      meanProbability: round(totalP),
      bias: totalAcc === null ? null : round(totalP - totalAcc),
    },
  };
}

export const BADGES = {
  oracle: { label: 'Oráculo', desc: 'La mejor calibración del salón: su confianza coincidió con sus aciertos.' },
  wolf: { label: 'Lobo de la Bolsa', desc: 'El mayor patrimonio al cierre del mercado.' },
  perfect: { label: 'Pleno estadístico', desc: 'Acertó todas las afirmaciones.' },
  streak: { label: 'Racha alcista', desc: 'Cuatro o más aciertos seguidos.' },
  allin: { label: 'All-in ganador', desc: 'Apostó todas sus fichas y acertó.' },
  prudent: { label: 'Sabe lo que no sabe', desc: 'Cuando falló, siempre había apostado poco: ningún error de concepto.' },
  comeback: { label: 'Remontada', desc: 'Pidió un rescate al banco y aun así terminó con ganancias.' },
};

/** Insignias de cada jugador (necesita todos los resúmenes para las de «el mejor del salón»). */
export function assignBadges(standings) {
  const active = standings.filter((s) => s.summary.answered > 0);
  const bestCalib = Math.max(0, ...active.map((s) => s.summary.calibrationGrade));
  const bestNet = Math.max(...active.map((s) => s.net), -Infinity);
  for (const s of standings) {
    const b = [];
    const sum = s.summary;
    if (sum.answered > 0) {
      if (bestCalib > 0 && sum.calibrationGrade === bestCalib) b.push('oracle');
      if (s.net === bestNet && s.net > 0) b.push('wolf');
      if (sum.rounds > 0 && sum.correct === sum.rounds) b.push('perfect');
      if (sum.bestStreak >= 4) b.push('streak');
      if (s.history.some((h) => h.correct && h.confidence >= 0.999)) b.push('allin');
      const wrong = sum.quadrants.prudence + sum.quadrants.misconception;
      if (wrong > 0 && sum.quadrants.misconception === 0) b.push('prudent');
      if (s.rescues > 0 && s.profit > 0) b.push('comeback');
    }
    s.badges = b;
  }
  return standings;
}
