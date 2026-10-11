/**
 * Informe en Excel con la identidad visual de StatBet (tinta profunda, rosa y cian).
 * Los números se guardan como números con formato: Excel los muestra con la coma decimal del equipo.
 */
import ExcelJS from 'exceljs';
import { betsTable, statementsTable, studentsTable, topicName } from './exportService.js';

const C = {
  ink: 'FF0B1026',
  navy: 'FF161C44',
  pink: 'FFFF4F9A',
  pinkSoft: 'FFFFE3EF',
  cyan: 'FF22D3EE',
  cyanSoft: 'FFDDF8FC',
  text: 'FF1A1F3D',
  muted: 'FF5B6283',
  line: 'FFDCE0EE',
  zebra: 'FFF6F7FC',
  white: 'FFFFFFFF',
  mint: 'FF0F9F7A',
  mintSoft: 'FFD9F6EE',
  coral: 'FFD9432F',
  coralSoft: 'FFFDE3DF',
  amber: 'FF9A6400',
  amberSoft: 'FFFFF2D6',
};
const TOPIC_COLORS = { 1: 'FF22D3EE', 2: 'FFFF4F9A', 3: 'FFA78BFA', 4: 'FFFBBF24' };
const FONT = 'Calibri';

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: C.line } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

function banner(ws, { title, subtitle, cols }) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 18, bold: true, color: { argb: C.white } };
  t.fill = fill(C.ink);
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 34;

  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
  s.fill = fill(C.navy);
  s.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 22;

  ws.getRow(3).height = 6;
  for (let c = 1; c <= cols; c++) ws.getCell(3, c).fill = fill(c % 2 ? C.pink : C.cyan);
}

function sectionTitle(ws, row, text, cols) {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text.toUpperCase();
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.navy } };
  cell.border = { bottom: { style: 'medium', color: { argb: C.pink } } };
  ws.getRow(row).height = 20;
}

function headerRow(ws, rowNumber, labels) {
  const row = ws.getRow(rowNumber);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.font = { name: FONT, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.navy);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = box;
  });
  row.height = 34;
}

function gradeStyle(cell, grade) {
  if (typeof grade !== 'number') return;
  const [bg, fg] = grade >= 4 ? [C.mintSoft, C.mint] : grade >= 3 ? [C.amberSoft, C.amber] : [C.coralSoft, C.coral];
  cell.fill = fill(bg);
  cell.font = { name: FONT, bold: true, color: { argb: fg } };
}

function bodyRows(ws, startRow, rows, { formats = {}, wrapFrom = 30 } = {}) {
  rows.forEach((values, r) => {
    const row = ws.getRow(startRow + r);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v === null || v === undefined || v === '' ? '—' : v;
      cell.font = { name: FONT, color: { argb: C.text } };
      cell.border = box;
      cell.alignment = { vertical: 'middle', wrapText: typeof v === 'string' && v.length > wrapFrom };
      if (typeof v === 'number') {
        cell.alignment.horizontal = 'center';
        if (formats[i] !== undefined) cell.numFmt = formats[i] === 0 ? '0' : `0.${'0'.repeat(formats[i])}`;
      }
      if (r % 2 === 1) cell.fill = fill(C.zebra);
    });
  });
}

function kv(ws, row, pairs, cols) {
  pairs.forEach(([k, v], i) => {
    const r = row + i;
    const key = ws.getCell(r, 1);
    key.value = k;
    key.font = { name: FONT, bold: true, color: { argb: C.muted } };
    ws.mergeCells(r, 2, r, cols);
    const val = ws.getCell(r, 2);
    val.value = v;
    val.font = { name: FONT, color: { argb: C.text } };
    val.alignment = { wrapText: true, vertical: 'top' };
  });
  return row + pairs.length;
}

function topicCell(cell, topicId) {
  const color = TOPIC_COLORS[topicId];
  if (!color) return;
  cell.fill = fill(color);
  cell.font = { name: FONT, bold: true, color: { argb: C.ink } };
}

const pctText = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)} %`);

function summarySheet(wb, { room, results, partial }) {
  const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  const cols = 8;
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 30 }];
  banner(ws, { title: 'StatBet · La Bolsa de Hipótesis', subtitle: `${room.config.title} · Sala ${room.code}${partial ? ' · Resultados parciales' : ''}`, cols });

  let row = 5;
  sectionTitle(ws, row, 'Datos de la sesión', cols);
  const w = results.weights;
  row = kv(ws, row + 1, [
    ['Fecha', new Date(room.createdAt).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })],
    ['Estudiantes', results.standings.length],
    ['Afirmaciones jugadas', `${results.roundsPlayed} de ${results.totalRounds}`],
    ['Fichas iniciales', results.startChips],
    ['Nota promedio (0-5)', results.averages.grade ?? '—'],
    ['Acierto promedio', pctText(results.averages.accuracy)],
    ['Fórmula de la nota', `${Math.round(w.accuracy * 100)} % aciertos + ${Math.round(w.calibration * 100)} % calibración. Calibración = 5 × (Brier promedio − 0,5) / 0,5, con Brier por ronda = 1 − (resultado − p)² y p = 0,5 + 0,5 × (fichas apostadas / fichas disponibles).`],
  ], cols);
  ws.getRow(row - 1).height = 48;

  row += 1;
  sectionTitle(ws, row, 'Por tema', cols);
  headerRow(ws, row + 1, ['Tema', 'Apuestas', 'Acierto', 'Seguridad declarada', 'Sesgo (pp)', 'Errores con confianza alta']);
  results.insights.byTopic.forEach((t, i) => {
    const r = ws.getRow(row + 2 + i);
    const values = [t.name, t.bets, t.accuracy, t.meanProbability, t.bias === null ? null : t.bias * 100, t.confidentWrong];
    values.forEach((v, j) => {
      const cell = r.getCell(j + 1);
      cell.value = v === null || v === undefined ? '—' : v;
      cell.border = box;
      cell.font = { name: FONT, color: { argb: C.text } };
      cell.alignment = { horizontal: j ? 'center' : 'left', vertical: 'middle' };
      if (j === 2 || j === 3) cell.numFmt = '0%';
      if (j === 4) cell.numFmt = '+0.0;-0.0;0.0';
    });
    topicCell(r.getCell(1), t.topic);
  });
  row += 3 + results.insights.byTopic.length;

  sectionTitle(ws, row, 'Conceptos críticos: el curso apostó con confianza y falló', cols);
  headerRow(ws, row + 1, ['Concepto', 'Tema', 'Respuesta', 'Fallaron', 'Con confianza alta', 'Índice de riesgo', 'Afirmación', 'Error de concepto']);
  const critical = results.insights.critical.slice(0, 8);
  if (critical.length === 0) {
    ws.getCell(row + 2, 1).value = 'Sin errores registrados.';
  }
  critical.forEach((c, i) => {
    const r = ws.getRow(row + 2 + i);
    const values = [c.concept, topicName(results, c.topic), c.truth ? 'Verdadera' : 'Falsa', `${c.wrong} de ${c.bettors}`, c.confidentWrong, c.riskIndex, c.statement, c.misconception ?? ''];
    values.forEach((v, j) => {
      const cell = r.getCell(j + 1);
      cell.value = v;
      cell.border = box;
      cell.font = { name: FONT, color: { argb: C.text }, bold: j === 0 };
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: [1, 2, 3, 4, 5].includes(j) ? 'center' : 'left' };
      if (j === 5) cell.numFmt = '0%';
    });
    topicCell(r.getCell(2), c.topic);
    r.height = 60;
  });
  return ws;
}

function tableSheet(wb, { name, title, subtitle, table, formats, widths, gradeCols = [], topicCol = null, results }) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }] });
  ws.columns = widths.map((width) => ({ width }));
  banner(ws, { title, subtitle, cols: table.header.length });
  headerRow(ws, 5, table.header);
  bodyRows(ws, 6, table.rows, { formats });
  table.rows.forEach((values, r) => {
    for (const c of gradeCols) gradeStyle(ws.getRow(6 + r).getCell(c + 1), values[c]);
    if (topicCol !== null) {
      const topic = results.topics.find((t) => t.name === values[topicCol])?.id;
      topicCell(ws.getRow(6 + r).getCell(topicCol + 1), topic);
    }
  });
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: table.header.length } };
  return ws;
}

export async function buildXlsx({ room, results, partial = false }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'StatBet';
  wb.created = new Date();
  const sub = `${room.config.title} · Sala ${room.code}`;
  summarySheet(wb, { room, results, partial });
  tableSheet(wb, {
    name: 'Estudiantes',
    title: 'Notas por estudiante',
    subtitle: sub,
    table: studentsTable(results),
    formats: { 9: 1, 10: 2, 11: 3, 12: 2, 13: 2, 14: 1 },
    widths: [8, 28, 10, 12, 12, 11, 9, 9, 10, 11, 12, 13, 13, 12, 13, 10, 9, 11, 12, 11, 10, 34],
    gradeCols: [13],
    results,
  });
  tableSheet(wb, {
    name: 'Afirmaciones',
    title: 'Resultado por afirmación',
    subtitle: sub,
    table: statementsTable(results),
    formats: { 9: 1, 10: 1, 12: 1 },
    widths: [8, 9, 20, 60, 12, 30, 11, 11, 10, 11, 13, 13, 12, 12, 12, 50],
    topicCol: 2,
    results,
  });
  tableSheet(wb, {
    name: 'Apuestas',
    title: 'Detalle de apuestas',
    subtitle: sub,
    table: betsTable(results),
    formats: { 7: 1 },
    widths: [28, 8, 9, 20, 13, 12, 12, 12, 13, 10, 12, 18],
    topicCol: 3,
    results,
  });
  return wb.xlsx.writeBuffer();
}
