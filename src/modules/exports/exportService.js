/**
 * Exportación de resultados. CSV pensado para Excel en español (Colombia):
 * separador ";", coma decimal y BOM UTF-8 para que las tildes se vean bien.
 * Las mismas tablas alimentan el CSV y el Excel con diseño.
 */
import { BADGES } from '../scoring/insights.js';
import { QUADRANTS, quadrantOf } from '../scoring/scoring.js';

const dec = (n, digits = 2) => (n === null || n === undefined || Number.isNaN(n) ? '' : Number(n).toFixed(digits).replace('.', ','));

function cell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export const topicName = (results, id) => results.topics?.find((t) => t.id === id)?.name ?? `Tema ${id}`;
export const sideLabel = (side) => (side === true ? 'Verdadero' : side === false ? 'Falso' : 'Sin apuesta');
export const badgeLabels = (ids = []) => ids.map((id) => BADGES[id]?.label ?? id).join(', ');
const pct = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 10);

/** Columna → decimales; las columnas de porcentaje ya vienen en escala 0–100. */
export const STUDENT_FORMATS = { 9: 1, 10: 2, 11: 3, 12: 2, 13: 2, 14: 1 };

export function studentsTable(results) {
  const header = [
    'Puesto', 'Estudiante', 'Fichas', 'Préstamos del banco', 'Patrimonio neto', 'Ganancia', 'Rondas', 'Apostó', 'Aciertos',
    'Acierto (%)', 'Nota aciertos (0-5)', 'Calibración Brier (0-1)', 'Nota calibración (0-5)', 'Nota final (0-5)',
    'Sesgo de confianza (pp)', 'Dominio', 'Duda', 'Prudencia', 'Error de concepto', 'Sin apuesta', 'Mejor racha', 'Insignias',
  ];
  const rows = results.standings.map((s) => [
    s.place,
    s.name,
    s.chips,
    s.loans,
    s.net,
    s.profit,
    s.summary.rounds,
    s.summary.answered,
    s.summary.correct,
    pct(s.summary.accuracy),
    s.summary.accuracyGrade,
    s.summary.calibrationMean,
    s.summary.calibrationGrade,
    s.grade,
    s.summary.confidenceBias === null ? null : pct(s.summary.confidenceBias),
    s.summary.quadrants.mastery,
    s.summary.quadrants.doubt,
    s.summary.quadrants.prudence,
    s.summary.quadrants.misconception,
    s.summary.quadrants.none,
    s.summary.bestStreak,
    badgeLabels(s.badges),
  ]);
  return { header, rows };
}

export const STATEMENT_FORMATS = { 9: 1, 10: 1, 12: 1 };

export function statementsTable(results) {
  const header = [
    'Ronda', 'Id', 'Tema', 'Afirmación', 'Respuesta', 'Concepto', 'Apostaron', 'Acertaron', 'Fallaron', 'Acierto (%)',
    'Confianza media (%)', 'Errores con confianza alta', 'Índice de riesgo (%)', 'Fichas en Verdadero', 'Fichas en Falso', 'Error de concepto que delata',
  ];
  const rows = results.insights.perStatement.map((s) => [
    s.index + 1,
    s.id,
    topicName(results, s.topic),
    s.statement,
    s.truth ? 'Verdadera' : 'Falsa',
    s.concept,
    s.bettors,
    s.right,
    s.wrong,
    pct(s.accuracy),
    pct(s.meanConfidence),
    s.confidentWrong,
    pct(s.riskIndex),
    s.chipsTrue,
    s.chipsFalse,
    s.misconception ?? '',
  ]);
  return { header, rows };
}

export const BET_FORMATS = { 7: 1 };

export function betsTable(results) {
  const header = ['Estudiante', 'Ronda', 'Id', 'Tema', 'Apuesta', 'Fichas apostadas', 'Fichas disponibles', 'Confianza (%)', 'Resultado', 'Cambio', 'Fichas después', 'Cuadrante'];
  const rows = [];
  for (const s of results.standings) {
    for (const h of s.history) {
      rows.push([
        s.name,
        h.round + 1,
        h.statementId,
        topicName(results, h.topic),
        sideLabel(h.side),
        h.side === null ? 0 : h.stake,
        h.balanceBefore,
        h.side === null ? null : pct(h.confidence),
        h.side === null ? 'Sin apuesta' : h.correct ? 'Acertó' : 'Falló',
        h.delta,
        h.chipsAfter,
        QUADRANTS[quadrantOf(h)].label,
      ]);
    }
  }
  return { header, rows };
}

const csvRows = (rows, formats) => rows.map((r) => r.map((v, i) => (i in formats && typeof v === 'number' ? dec(v, formats[i]) : v ?? '—')));

export const studentsCsv = (results) => {
  const { header, rows } = studentsTable(results);
  return toCsv([header, ...csvRows(rows, STUDENT_FORMATS)]);
};

export const statementsCsv = (results) => {
  const { header, rows } = statementsTable(results);
  return toCsv([header, ...csvRows(rows, STATEMENT_FORMATS)]);
};

export const betsCsv = (results) => {
  const { header, rows } = betsTable(results);
  return toCsv([header, ...csvRows(rows, BET_FORMATS)]);
};
