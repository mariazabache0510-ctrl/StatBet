import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, applyConfigPatch } from '../src/modules/rooms/roomModel.js';
import { joinRoom } from '../src/modules/rooms/playerService.js';
import * as engine from '../src/modules/market/marketEngine.js';
import { validateBank, pickStatements } from '../src/modules/statements/statementBank.js';
import { playerView, publicView, moderatorView } from '../src/modules/realtime/views.js';
import { DomainError } from '../src/lib/errors.js';

function makeBank() {
  const statements = [];
  for (const topic of [1, 2, 3, 4]) {
    for (let i = 1; i <= 3; i++) {
      statements.push({
        id: `T${topic}-${i}`,
        topic,
        truth: i % 2 === 1,
        statement: `Afirmación ${i} del tema ${topic}`,
        concept: `Concepto ${topic}.${i}`,
        explanation: 'Explicación de prueba.',
        misconception: 'Error de prueba.',
        active: true,
      });
    }
  }
  const res = validateBank({ topics: [], statements });
  assert.ok(res.ok, res.errors.join('\n'));
  return res.bank;
}

function setup(n = 3, patch = {}) {
  const room = createRoom('TEST1', 1000);
  applyConfigPatch(room, { perTopic: 1, ...patch });
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(joinRoom(room, `Jugador ${i + 1}`, { now: 1000 + i }).player.id);
  return { room, ids, bank: makeBank() };
}

test('las afirmaciones se intercalan por tema', () => {
  const bank = makeBank();
  const picked = pickStatements(bank, { perTopic: 2 });
  assert.deepEqual(picked.map((s) => s.id), ['T1-1', 'T2-1', 'T3-1', 'T4-1', 'T1-2', 'T2-2', 'T3-2', 'T4-2']);
});

test('iniciar abre la primera ronda con 100 fichas para todos', () => {
  const { room, ids, bank } = setup();
  engine.startGame(room, bank, 2000);
  assert.equal(room.phase, 'running');
  assert.equal(room.round.index, 0);
  assert.equal(room.round.status, 'betting');
  assert.equal(room.round.closesAt, 2000 + 45_000);
  assert.equal(room.game.statements.length, 4);
  for (const id of ids) assert.equal(room.players[id].chips, 100);
});

test('validación de apuestas: mínimo, saldo, lado y ronda', () => {
  const { room, ids, bank } = setup();
  engine.startGame(room, bank, 2000);
  const bet = (stake, side = true, round = 0, now = 3000) => engine.placeBet(room, ids[0], { round, side, stake }, now);
  assert.throws(() => bet(2), DomainError);
  assert.throws(() => bet(101), DomainError);
  assert.throws(() => bet(10, 'si'), DomainError);
  assert.throws(() => bet(10, true, 1), DomainError);
  assert.throws(() => bet(10, true, 0, 2000 + 45_000), /cerró/);
  assert.deepEqual(bet(100), { changed: false, allIn: true });
  assert.deepEqual(bet(40, false), { changed: true, allIn: false });
  assert.equal(room.round.bets[ids[0]].stake, 40);
});

test('revelar liquida: gana lo apostado si acierta y lo pierde si falla', () => {
  const { room, ids, bank } = setup(3);
  engine.startGame(room, bank, 2000);
  const truth = room.game.statements[0].truth;
  engine.placeBet(room, ids[0], { round: 0, side: truth, stake: 60 }, 3000);
  engine.placeBet(room, ids[1], { round: 0, side: !truth, stake: 80 }, 3000);
  const res = engine.revealRound(room, 4000);
  assert.equal(res.truth, truth);
  assert.equal(room.players[ids[0]].chips, 160);
  assert.equal(room.players[ids[1]].chips, 20);
  assert.equal(room.players[ids[2]].chips, 100);
  assert.equal(room.players[ids[2]].history[0].side, null);
  assert.equal(res.stats.bettors, 2);
  assert.equal(res.stats.abstained, 1);
  assert.equal(res.stats.confidentWrong, 1);
  assert.equal(res.winners[0].playerId, ids[0]);
  assert.throws(() => engine.revealRound(room, 4100), /ya se reveló/);
});

test('el mercado se cierra solo por tiempo o cuando todos los conectados apostaron', () => {
  const { room, ids, bank } = setup(2);
  engine.startGame(room, bank, 2000);
  engine.placeBet(room, ids[0], { round: 0, side: true, stake: 10 }, 2500);
  assert.deepEqual(engine.tick(room, 3000, () => true), []);
  assert.deepEqual(engine.tick(room, 3000, (id) => id === ids[0]), [{ type: 'closed', index: 0, reason: 'all' }]);

  const other = setup(2);
  engine.startGame(other.room, other.bank, 2000);
  assert.deepEqual(engine.tick(other.room, 2000 + 45_000, () => true), [{ type: 'closed', index: 0, reason: 'time' }]);
});

test('revelación automática tras cerrar, si está activada', () => {
  const { room, bank } = setup(1, { autoReveal: true });
  engine.startGame(room, bank, 2000);
  engine.tick(room, 2000 + 45_000);
  assert.equal(room.round.status, 'closed');
  assert.deepEqual(engine.tick(room, 2000 + 46_000), []);
  assert.deepEqual(engine.tick(room, 2000 + 47_600), [{ type: 'revealed', index: 0 }]);
});

test('rescate del banco: quien queda con menos del mínimo recibe un préstamo', () => {
  const { room, ids, bank } = setup(2);
  engine.startGame(room, bank, 2000);
  const truth = room.game.statements[0].truth;
  engine.placeBet(room, ids[0], { round: 0, side: !truth, stake: 100 }, 3000);
  engine.revealRound(room, 4000);
  assert.equal(room.players[ids[0]].chips, 0);
  const next = engine.nextRound(room, 5000);
  assert.deepEqual(next.rescued, [{ playerId: ids[0], name: 'Jugador 1', amount: 30 }]);
  assert.equal(room.players[ids[0]].chips, 30);
  assert.equal(room.players[ids[0]].loans, 30);
  const board = engine.liveStandings(room);
  assert.equal(board.find((s) => s.id === ids[0]).net, 0);
});

test('pausa y reanudación conservan el tiempo restante del mercado', () => {
  const { room, bank } = setup(1);
  engine.startGame(room, bank, 2000);
  engine.pauseGame(room, 12_000);
  assert.equal(room.round.remainingMs, 35_000);
  assert.equal(engine.tick(room, 100_000).length, 0);
  assert.throws(() => engine.placeBet(room, Object.keys(room.players)[0], { round: 0, side: true, stake: 10 }, 13_000), /pausa/);
  engine.resumeGame(room, 200_000);
  assert.equal(room.round.closesAt, 235_000);
  engine.addTime(room, 15, 200_000);
  assert.equal(room.round.closesAt, 250_000);
});

test('tras un reinicio la partida en curso vuelve en pausa', () => {
  const { room, bank } = setup(1);
  engine.startGame(room, bank, 2000);
  assert.equal(engine.restoreAfterRestart(room, 5000), true);
  assert.equal(room.phase, 'paused');
  assert.equal(room.autoPaused, true);
});

test('partida completa: al terminar se calculan notas, ranking e insignias', () => {
  const { room, ids, bank } = setup(3);
  engine.startGame(room, bank, 2000);
  let now = 3000;
  while (room.phase === 'running') {
    const truth = room.game.statements[room.round.index].truth;
    engine.placeBet(room, ids[0], { round: room.round.index, side: truth, stake: room.players[ids[0]].chips }, now);
    engine.placeBet(room, ids[1], { round: room.round.index, side: !truth, stake: 10 }, now);
    engine.revealRound(room, now + 100);
    engine.nextRound(room, now + 200);
    now += 1000;
  }
  assert.equal(room.phase, 'finished');
  const res = room.results;
  assert.equal(res.roundsPlayed, 4);
  const [first, second, third] = res.standings;
  assert.equal(first.id, ids[0]);
  assert.equal(first.chips, 1600);
  assert.equal(first.grade, 5);
  assert.ok(first.badges.includes('oracle'));
  assert.ok(first.badges.includes('wolf'));
  assert.ok(first.badges.includes('perfect'));
  assert.ok(first.badges.includes('allin'));
  assert.equal(second.id, ids[2]);
  assert.equal(third.id, ids[1]);
  assert.ok(third.badges.includes('prudent'));
  assert.equal(res.insights.perStatement.length, 4);
});

test('terminar antes de revelar anula la ronda abierta sin mover fichas', () => {
  const { room, ids, bank } = setup(1);
  engine.startGame(room, bank, 2000);
  engine.placeBet(room, ids[0], { round: 0, side: true, stake: 50 }, 3000);
  engine.finishGame(room, 4000, 'moderator');
  assert.equal(room.round.status, 'void');
  assert.equal(room.players[ids[0]].chips, 100);
  assert.equal(room.results.roundsPlayed, 0);
});

test('reiniciar devuelve a todos al lobby con las fichas iniciales', () => {
  const { room, ids, bank } = setup(1);
  engine.startGame(room, bank, 2000);
  engine.placeBet(room, ids[0], { round: 0, side: true, stake: 50 }, 3000);
  engine.revealRound(room, 4000);
  engine.resetGame(room);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.players[ids[0]].chips, 100);
  assert.equal(room.players[ids[0]].history.length, 0);
});

test('volver a entrar en plena partida recupera al mismo jugador (sin fichas nuevas)', () => {
  const room = createRoom('TEST2', 1000);
  const first = joinRoom(room, 'Laura', { deviceId: 'device-abc-123' });
  engine.startGame(room, makeBank(), 2000);
  room.players[first.player.id].chips = 7;
  const again = joinRoom(room, 'Laura', { deviceId: 'device-abc-123' });
  assert.equal(again.player.id, first.player.id);
  assert.equal(again.resumed, true);
  assert.equal(room.players[first.player.id].chips, 7);
  assert.throws(() => joinRoom(room, 'laura', { deviceId: 'otro-dispositivo-1' }), /Ya hay un inversor/);
  const late = joinRoom(room, 'Pedro', { deviceId: 'device-xyz-999' });
  assert.equal(late.player.chips, 100);
  assert.ok(room.round.eligible.includes(late.player.id));
});

test('la verdad no viaja a estudiantes ni al proyector antes de revelar', () => {
  const { room, ids, bank } = setup(2);
  engine.startGame(room, bank, 2000);
  engine.placeBet(room, ids[0], { round: 0, side: true, stake: 30 }, 3000);
  const secret = JSON.stringify([publicView(room, { bank }), playerView(room, ids[0]), playerView(room, ids[1])]);
  const s = room.game.statements[0];
  assert.ok(!secret.includes(s.explanation), 'la explicación no debe filtrarse');
  assert.ok(!secret.includes('"truth"'), 'la verdad no debe filtrarse');
  assert.ok(!secret.includes('"onTrue"'), 'la distribución de apuestas no debe filtrarse');
  assert.ok(!JSON.stringify(playerView(room, ids[1])).includes('"side":true'), 'un jugador no ve la apuesta de otro');

  const mod = moderatorView(room, {});
  assert.equal(mod.current.truth, s.truth);
  assert.equal(mod.betStats.bettors, 1);

  engine.revealRound(room, 4000);
  const after = publicView(room, { bank });
  assert.equal(after.round.reveal.truth, s.truth);
  assert.equal(after.round.reveal.explanation, s.explanation);
  assert.equal(after.round.reveal.stats.onTrue, 1);
});
