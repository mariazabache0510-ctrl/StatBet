#!/usr/bin/env node
/**
 * Simula un salón con bots que apuestan en la bolsa.
 *
 *   node scripts/load-test.js                     crea una sala, une 25 bots y conduce la partida completa
 *   node scripts/load-test.js --bots 60 --pace 1  más bots y menos pausa entre rondas
 *   node scripts/load-test.js --hold              crea la sala y une bots, pero el profe conduce desde el panel
 *   node scripts/load-test.js --code ABC123       une bots a una sala existente (sin conducirla)
 *
 * Opciones: --url (http://localhost:3000) --key (MODERATOR_KEY o profe123) --bots (25)
 *           --wait (segundos antes de empezar, 3) --pace (segundos entre revelar y avanzar, 3)
 */
import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const URL_BASE = String(opt('url', 'http://localhost:3000')).replace(/\/$/, '');
const KEY = String(opt('key', process.env.MODERATOR_KEY || 'profe123'));
const BOTS = Number(opt('bots', 25));
const WAIT = Number(opt('wait', 3));
const PACE = Number(opt('pace', 3));
const HOLD = !!opt('hold', false);
const GIVEN_CODE = opt('code', null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['Valentina', 'Santiago', 'Mariana', 'Sebastián', 'Isabella', 'Mateo', 'Gabriela', 'Samuel', 'Daniela', 'Nicolás', 'Sofía', 'Alejandro', 'Camila', 'Andrés', 'Laura', 'Juan José', 'Paula', 'David', 'Sara', 'Felipe', 'Natalia', 'Tomás', 'Juliana', 'Martín', 'Lucía', 'Emiliano', 'Antonia', 'Jerónimo', 'Manuela', 'Simón'];
const SURNAMES = ['Gómez', 'Rodríguez', 'López', 'Martínez', 'García', 'Hernández', 'Díaz', 'Moreno', 'Rojas', 'Vargas', 'Castro', 'Ortiz', 'Ramírez', 'Torres', 'Suárez'];

function connect(auth) {
  return new Promise((resolve, reject) => {
    const socket = io(URL_BASE, { auth, transports: ['websocket'], reconnection: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}
const emit = (socket, event, payload = {}) => new Promise((resolve) => socket.timeout(10_000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: 'timeout' } : res)));

const stats = { joined: 0, bets: 0, betErrors: 0, latencies: [] };
const truths = new Map();

async function main() {
  const mod = await connect({ role: 'moderator', key: KEY });
  let modState = null;
  mod.on('state:mod', (s) => {
    modState = s;
    if (s.current) truths.set(s.round.index, s.current.truth);
  });

  let code = GIVEN_CODE;
  if (code) {
    const res = await emit(mod, 'mod:watch', { code });
    if (!res.ok) throw new Error(`No se pudo vigilar la sala ${code}: ${res.error}`);
    code = res.code;
  } else {
    const res = await emit(mod, 'mod:createRoom', { title: 'Prueba de carga' });
    if (!res.ok) throw new Error(res.error);
    code = res.code;
  }
  console.log(`Sala ${code}`);
  console.log(`  Proyector: ${URL_BASE}/proyector?sala=${code}`);
  console.log(`  Panel:     ${URL_BASE}/moderador`);

  const bots = [];
  for (let i = 0; i < BOTS; i++) {
    const name = `${NAMES[i % NAMES.length]} ${SURNAMES[(i * 7) % SURNAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''}`;
    const res = await fetch(`${URL_BASE}/api/rooms/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, device: `bot-${code}-${i}` }),
    }).then((r) => r.json());
    if (!res.ok) {
      console.error(`  ${name}: ${res.error}`);
      continue;
    }
    const socket = await connect({ role: 'player', code, token: res.token });
    // Cada bot tiene un nivel de conocimiento y una tendencia a la sobreconfianza.
    const bot = { name, socket, skill: 0.45 + Math.random() * 0.5, bravado: (Math.random() - 0.35) * 0.5, me: null, betOn: -1 };
    socket.on('state:me', (m) => (bot.me = m));
    socket.on('state:public', (pub) => maybeBet(bot, pub));
    bots.push(bot);
    stats.joined++;
    await sleep(40);
  }
  console.log(`${stats.joined} bots en la sala.`);

  if (HOLD || GIVEN_CODE) {
    console.log('Los bots apostarán en cada ronda que abras desde el panel. Ctrl+C para salir.');
    return;
  }

  await sleep(WAIT * 1000);
  let res = await emit(mod, 'mod:start');
  if (!res.ok) throw new Error(res.error);
  const t0 = Date.now();
  while (true) {
    await waitFor(() => modState?.round?.status === 'closed' || modState?.round?.status === 'revealed', 120_000);
    await sleep(1200);
    if (modState.round.status !== 'revealed') {
      res = await emit(mod, 'mod:reveal');
      if (!res.ok) console.error('reveal:', res.error);
      await waitFor(() => modState.round.status === 'revealed', 5000);
    }
    const st = modState.round.reveal?.stats;
    if (st) console.log(`  Ronda ${modState.round.index + 1}/${modState.totalRounds}: ${st.right}/${st.bettors} acertaron, riesgo ${(st.riskIndex * 100).toFixed(0)} %`);
    await sleep(PACE * 1000);
    res = await emit(mod, 'mod:next');
    if (!res.ok) throw new Error(res.error);
    await sleep(300);
    if (modState.phase === 'finished') break;
  }
  await sleep(1500);
  await emit(mod, 'mod:revealPodium');
  const lat = stats.latencies.sort((a, b) => a - b);
  const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] ?? 0;
  console.log(`\nPartida terminada en ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
  console.log(`Apuestas: ${stats.bets} (errores ${stats.betErrors}). Latencia p50 ${p(0.5)} ms · p95 ${p(0.95)} ms.`);
  const top = modState.results?.standings.slice(0, 3) ?? [];
  top.forEach((s) => console.log(`  ${s.place}. ${s.name}: ${s.net} fichas, nota ${s.grade}`));
  console.log(`Nota promedio: ${modState.results?.averages.grade}`);
  for (const b of bots) b.socket.disconnect();
  mod.disconnect();
  process.exit(0);

  function waitFor(cond, ms) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const id = setInterval(() => {
        if (cond()) {
          clearInterval(id);
          resolve();
        } else if (Date.now() - start > ms) {
          clearInterval(id);
          reject(new Error('Tiempo de espera agotado.'));
        }
      }, 100);
    });
  }
}

function maybeBet(bot, pub) {
  const r = pub.round;
  if (!r || r.status !== 'betting' || pub.phase !== 'running' || bot.betOn === r.index) return;
  bot.betOn = r.index;
  const delay = 600 + Math.random() * Math.min(12_000, pub.config.betSeconds * 400);
  setTimeout(async () => {
    const chips = bot.me?.chips ?? pub.config.startChips;
    if (chips <= 0) return;
    const truth = truths.get(r.index);
    const knows = Math.random() < bot.skill;
    const side = truth === undefined ? Math.random() < 0.5 : knows ? truth : !truth;
    const conf = Math.min(1, Math.max(0.05, (knows ? bot.skill : 1 - bot.skill) - 0.25 + bot.bravado + (Math.random() - 0.5) * 0.3));
    const stake = Math.max(Math.min(pub.config.minBet, chips), Math.round(chips * conf));
    const t = Date.now();
    const res = await emit(bot.socket, 'player:bet', { round: r.index, side, stake: Math.min(chips, stake) });
    stats.latencies.push(Date.now() - t);
    if (res.ok) stats.bets++;
    else stats.betErrors++;
  }, delay);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
