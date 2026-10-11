import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrationToGrade,
  confidenceOf,
  normalizeWeights,
  probabilityOf,
  quadrantOf,
  roundCalibration,
  scenarioGrades,
  summarizePlayer,
} from '../src/modules/scoring/scoring.js';
import { classInsights, roundStats } from '../src/modules/scoring/insights.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('la confianza es la fracción de fichas disponibles y se traduce a probabilidad 0,5–1', () => {
  close(confidenceOf(25, 100), 0.25);
  close(confidenceOf(100, 100), 1);
  close(confidenceOf(150, 100), 1);
  close(confidenceOf(5, 0), 0);
  close(probabilityOf(0), 0.5);
  close(probabilityOf(1), 1);
  close(probabilityOf(0.4), 0.7);
});

test('calibración por ronda (Brier): todo o nada en los extremos, 0,75 sin apuesta', () => {
  close(roundCalibration(1, true), 1);
  close(roundCalibration(1, false), 0);
  close(roundCalibration(0, true), 0.75);
  close(roundCalibration(0, false), 0.75);
  close(roundCalibration(0.4, true), 1 - 0.3 ** 2);
  close(roundCalibration(0.4, false), 1 - 0.7 ** 2);
  close(roundCalibration(0.9, null), 0.75);
});

test('la regla es propia: declarar la seguridad real maximiza el puntaje esperado', () => {
  for (const belief of [0.55, 0.7, 0.85, 0.95]) {
    const expected = (c) => belief * roundCalibration(c, true) + (1 - belief) * roundCalibration(c, false);
    const honest = (belief - 0.5) / 0.5;
    for (const other of [0, 0.25, 0.5, 0.75, 1]) {
      assert.ok(expected(honest) >= expected(other) - 1e-9, `creencia ${belief}: honesta ${honest} vs ${other}`);
    }
  }
});

test('escala de calibración: 0,5 → 0 y 1 → 5', () => {
  close(calibrationToGrade(0.5), 0);
  close(calibrationToGrade(0.4), 0);
  close(calibrationToGrade(0.75), 2.5);
  close(calibrationToGrade(1), 5);
});

test('cuadrantes de confianza', () => {
  assert.equal(quadrantOf({ side: true, confidence: 0.8, correct: true }), 'mastery');
  assert.equal(quadrantOf({ side: true, confidence: 0.2, correct: true }), 'doubt');
  assert.equal(quadrantOf({ side: false, confidence: 0.2, correct: false }), 'prudence');
  assert.equal(quadrantOf({ side: false, confidence: 0.5, correct: false }), 'misconception');
  assert.equal(quadrantOf({ side: null, confidence: 0, correct: null }), 'none');
});

test('resumen de un jugador: aciertos, calibración y nota combinada', () => {
  const history = [
    { side: true, confidence: 1, correct: true },
    { side: false, confidence: 0.5, correct: true },
    { side: true, confidence: 0.2, correct: false },
    { side: null, confidence: 0, correct: null },
  ];
  const s = summarizePlayer(history, { weights: { accuracy: 0.6, calibration: 0.4 } });
  assert.equal(s.rounds, 4);
  assert.equal(s.answered, 3);
  assert.equal(s.correct, 2);
  close(s.accuracy, 0.5);
  close(s.accuracyGrade, 2.5);
  const brier = (1 + (1 - 0.25 ** 2) + (1 - 0.6 ** 2) + 0.75) / 4;
  close(s.calibrationMean, Math.round(brier * 10000) / 10000);
  close(s.calibrationGrade, Math.round(calibrationToGrade(brier) * 100) / 100);
  close(s.grade, Math.round((0.6 * 2.5 + 0.4 * calibrationToGrade(brier)) * 100) / 100);
  assert.deepEqual(s.quadrants, { mastery: 2, doubt: 0, prudence: 1, misconception: 0, none: 1 });
  assert.equal(s.bestStreak, 2);
});

test('escenarios: la honestidad le gana a apostar siempre todo o siempre lo mínimo', () => {
  const [perfect, honest, allIn, minimal, coinAllIn, coinLow] = scenarioGrades({ accuracy: 0.6, calibration: 0.4 });
  assert.equal(perfect.grade, 5);
  assert.ok(honest.grade > allIn.grade, `${honest.grade} > ${allIn.grade}`);
  assert.ok(honest.grade > minimal.grade, `${honest.grade} > ${minimal.grade}`);
  assert.ok(coinLow.grade > coinAllIn.grade, 'quien duda y lo reconoce supera a quien apuesta todo al azar');
  assert.equal(coinAllIn.calibrationGrade, 0);
});

test('los pesos se normalizan y nunca quedan en cero', () => {
  assert.deepEqual(normalizeWeights({ accuracy: 3, calibration: 1 }), { accuracy: 0.75, calibration: 0.25 });
  assert.deepEqual(normalizeWeights({ accuracy: 0, calibration: 0 }), { accuracy: 0.6, calibration: 0.4 });
});

test('estadística de una ronda: distribución, errores con confianza e índice de riesgo', () => {
  const bets = [
    { side: true, stake: 80, confidence: 0.8, correct: false },
    { side: true, stake: 50, confidence: 0.5, correct: false },
    { side: false, stake: 10, confidence: 0.1, correct: true },
    { side: null, stake: 0, confidence: 0, correct: null },
  ];
  const s = roundStats({ truth: false }, bets);
  assert.equal(s.bettors, 3);
  assert.equal(s.abstained, 1);
  assert.equal(s.onTrue, 2);
  assert.equal(s.chipsTrue, 130);
  assert.equal(s.chipsFalse, 10);
  assert.equal(s.confidentWrong, 2);
  close(s.riskIndex, (0.8 + 0.5) / 3, 1e-3);
  assert.equal(s.histogram[4].wrong, 1);
});

test('reporte del curso: los conceptos críticos se ordenan por confianza perdida', () => {
  const st = (id, truth, concept) => ({ id, topic: 1, truth, concept, statement: id, misconception: 'x', explanation: 'y' });
  const rounds = [
    { index: 0, statement: st('A', true, 'Leve'), bets: [{ side: false, stake: 10, confidence: 0.1, correct: false }, { side: true, stake: 50, confidence: 0.5, correct: true }] },
    { index: 1, statement: st('B', false, 'Grave'), bets: [{ side: true, stake: 100, confidence: 1, correct: false }, { side: true, stake: 90, confidence: 0.9, correct: false }] },
    { index: 2, statement: st('C', true, 'Sin errores'), bets: [{ side: true, stake: 30, confidence: 0.3, correct: true }] },
  ];
  const r = classInsights(rounds, { topics: [{ id: 1, name: 'Estimación' }] });
  assert.deepEqual(r.critical.map((c) => c.id), ['B', 'A']);
  assert.equal(r.byConcept[0].concept, 'Grave');
  assert.equal(r.byTopic[0].bets, 5);
  assert.equal(r.quadrants.misconception, 2);
  assert.equal(r.curve.reduce((s, b) => s + b.bets, 0), 5);
});
