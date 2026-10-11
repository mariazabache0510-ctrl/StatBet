import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { createRoom, applyConfigPatch } from '../src/modules/rooms/roomModel.js';
import { joinRoom } from '../src/modules/rooms/playerService.js';
import * as engine from '../src/modules/market/marketEngine.js';
import { loadBankFromFile } from '../src/modules/statements/statementBank.js';
import { betsCsv, statementsCsv, studentsCsv } from '../src/modules/exports/exportService.js';
import { buildXlsx } from '../src/modules/exports/xlsxReport.js';

async function playedRoom() {
  const { bank } = await loadBankFromFile('data/statements.json');
  const room = createRoom('EXP01', 1000);
  applyConfigPatch(room, { perTopic: 1 });
  const ids = ['Ana María', 'Juan; Pérez', 'Sofía'].map((n, i) => joinRoom(room, n, { now: 1000 + i }).player.id);
  engine.startGame(room, bank, 2000);
  let now = 3000;
  while (room.phase === 'running') {
    const truth = room.game.statements[room.round.index].truth;
    engine.placeBet(room, ids[0], { round: room.round.index, side: truth, stake: 40 }, now);
    engine.placeBet(room, ids[1], { round: room.round.index, side: !truth, stake: 25 }, now);
    engine.revealRound(room, now + 10);
    engine.nextRound(room, now + 20);
    now += 100;
  }
  return room;
}

test('el banco incluido es válido y trae afirmaciones verdaderas y falsas en cada tema', async () => {
  const { bank, warnings } = await loadBankFromFile('data/statements.json');
  assert.deepEqual(warnings, []);
  for (const t of [1, 2, 3, 4]) {
    const list = bank.statements.filter((s) => s.topic === t);
    assert.ok(list.length >= 5);
    assert.ok(list.some((s) => s.truth) && list.some((s) => !s.truth));
    for (const s of list) assert.ok(s.misconception && s.explanation && s.concept);
  }
  const ids = new Set(bank.statements.map((s) => s.id));
  assert.equal(ids.size, bank.statements.length);
  const raw = JSON.parse(await fs.readFile('data/statements.json', 'utf8'));
  assert.equal(raw.statements.length, bank.statements.length);
});

test('CSV para Excel en español: BOM, punto y coma, coma decimal y comillas', async () => {
  const room = await playedRoom();
  const csv = studentsCsv(room.results);
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^Puesto;Estudiante;Fichas/);
  assert.ok(lines.some((l) => l.includes('"Juan; Pérez"')));
  assert.ok(lines[1].split(';').some((c) => /^\d+,\d+$/.test(c)), 'debe haber decimales con coma');
  assert.equal(statementsCsv(room.results).trim().split('\r\n').length, 5);
  assert.equal(betsCsv(room.results).trim().split('\r\n').length, 1 + 3 * 4);
});

test('el Excel tiene las cuatro hojas con datos', async () => {
  const room = await playedRoom();
  const buffer = await buildXlsx({ room, results: room.results });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Resumen', 'Estudiantes', 'Afirmaciones', 'Apuestas']);
  const students = wb.getWorksheet('Estudiantes');
  assert.equal(students.getCell(5, 2).value, 'Estudiante');
  assert.equal(students.getCell(6, 2).value, 'Ana María');
  assert.equal(wb.getWorksheet('Apuestas').rowCount, 5 + 12);
});
