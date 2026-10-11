#!/usr/bin/env node
// Valida el banco de afirmaciones. Uso: npm run validate:statements [-- ruta.json]
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateBank, TOPIC_IDS } from '../src/modules/statements/statementBank.js';

const file = path.resolve(process.argv[2] || 'data/statements.json');
const raw = JSON.parse(await fs.readFile(file, 'utf8'));
const res = validateBank(raw);

console.log(`Banco: ${file}`);
if (res.bank) {
  for (const t of TOPIC_IDS) {
    const list = res.bank.statements.filter((s) => s.topic === t);
    const active = list.filter((s) => s.active);
    const trues = active.filter((s) => s.truth).length;
    const name = res.bank.topics.find((x) => x.id === t)?.name;
    console.log(`  Tema ${t} (${name}): ${list.length} afirmaciones, ${active.length} activas (${trues} V / ${active.length - trues} F)`);
  }
}
for (const w of res.warnings) console.log(`  Aviso: ${w}`);
if (!res.ok) {
  for (const e of res.errors) console.error(`  ERROR: ${e}`);
  process.exit(1);
}
console.log('Banco válido.');
