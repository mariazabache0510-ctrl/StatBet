import { DomainError } from '../../lib/errors.js';
import { pickStatements } from '../statements/statementBank.js';
import { addLog, orderedPlayers } from '../rooms/roomModel.js';
import { assignPlaces, compareStandings, confidenceOf, summarizePlayer } from '../scoring/scoring.js';
import { assignBadges, classInsights, roundStats } from '../scoring/insights.js';

/**
 * Reglas de La Bolsa de Hipótesis. Todo ocurre en el servidor: el reloj, la validación
 * de cada apuesta y la liquidación. La verdad de una afirmación solo se usa al revelar.
 *
 * Ciclo de una ronda: betting (mercado abierto) → closed (sin más apuestas) → revealed.
 * Una ronda «void» se anuló porque el moderador terminó la partida antes de revelarla.
 */

const AUTO_REVEAL_DELAY_MS = 2500;

export function newPlayerState(config) {
  return { chips: config.startChips, loans: 0, rescues: 0, history: [] };
}

const isRunning = (room) => room.phase === 'running';

export function startGame(room, bank, now = Date.now(), rand = Math.random) {
  if (room.phase !== 'lobby') throw new DomainError('La partida ya empezó.');
  if (Object.keys(room.players).length === 0) throw new DomainError('Todavía no hay jugadores en la sala.');
  const picked = pickStatements(bank, { perTopic: room.config.perTopic, random: room.config.randomPick, rand });
  if (picked.length === 0) throw new DomainError('El banco no tiene afirmaciones activas.');
  room.game = {
    startedAt: now,
    statements: picked.map((s) => ({ ...s })),
    topics: bank.topics.map((t) => ({ ...t })),
    rounds: [],
  };
  for (const p of Object.values(room.players)) Object.assign(p, newPlayerState(room.config));
  room.results = null;
  room.podiumRevealed = false;
  room.phase = 'running';
  addLog(room, `Mercado abierto con ${picked.length} afirmaciones.`, now);
  return openRound(room, 0, now);
}

function openRound(room, index, now) {
  const { minBet, rescueChips, betSeconds } = room.config;
  const rescued = [];
  for (const p of Object.values(room.players)) {
    if (p.chips < minBet && rescueChips > 0) {
      p.chips += rescueChips;
      p.loans += rescueChips;
      p.rescues += 1;
      rescued.push({ playerId: p.id, name: p.name, amount: rescueChips });
    }
  }
  room.round = {
    index,
    status: 'betting',
    openedAt: now,
    closesAt: room.phase === 'paused' ? null : now + betSeconds * 1000,
    remainingMs: room.phase === 'paused' ? betSeconds * 1000 : null,
    closedAt: null,
    revealedAt: null,
    eligible: Object.keys(room.players),
    bets: {},
  };
  if (rescued.length) addLog(room, `Rescate del banco para ${rescued.map((r) => r.name).join(', ')}.`, now);
  return { index, rescued };
}

export function currentStatement(room) {
  return room.round && room.game ? room.game.statements[room.round.index] : null;
}

export function placeBet(room, playerId, { round, side, stake }, now = Date.now()) {
  const r = room.round;
  if (room.phase === 'paused') throw new DomainError('El mercado está en pausa.');
  if (!isRunning(room) || !r) throw new DomainError('El mercado no está abierto.');
  if (Number(round) !== r.index) throw new DomainError('Esa afirmación ya no está en juego.');
  if (r.status !== 'betting' || (r.closesAt !== null && now >= r.closesAt)) throw new DomainError('El mercado ya cerró para esta afirmación.');
  if (typeof side !== 'boolean') throw new DomainError('Elige Verdadero o Falso.');
  const player = room.players[playerId];
  if (!player) throw new DomainError('Jugador no encontrado.');
  const balance = player.chips;
  if (balance <= 0) throw new DomainError('No tienes fichas para apostar.');
  const amount = Math.round(Number(stake));
  const min = Math.min(room.config.minBet, balance);
  if (!Number.isFinite(amount) || amount < min) throw new DomainError(`La apuesta mínima es de ${min} fichas.`);
  if (amount > balance) throw new DomainError(`Solo tienes ${balance} fichas.`);
  if (!r.eligible.includes(playerId)) r.eligible.push(playerId);
  const changed = !!r.bets[playerId];
  r.bets[playerId] = { side, stake: amount, balanceBefore: balance, at: now };
  return { changed, allIn: amount === balance };
}

/** ¿Ya apostaron todos los jugadores conectados que pueden apostar en esta ronda? */
export function everyoneBet(room, isOnline = () => true) {
  const r = room.round;
  if (!r || r.status !== 'betting') return false;
  const waiting = r.eligible.filter((id) => room.players[id] && isOnline(id) && !r.bets[id]);
  return waiting.length === 0 && Object.keys(r.bets).length > 0;
}

export function closeRound(room, now = Date.now()) {
  const r = room.round;
  if (!r || r.status !== 'betting') throw new DomainError('No hay un mercado abierto.');
  r.status = 'closed';
  r.closedAt = now;
  r.closesAt = null;
  r.remainingMs = null;
  return { index: r.index, bets: Object.keys(r.bets).length };
}

export function revealRound(room, now = Date.now()) {
  const r = room.round;
  if (!r || !room.game) throw new DomainError('No hay una ronda en juego.');
  if (r.status === 'betting') closeRound(room, now);
  if (r.status !== 'closed') throw new DomainError('Esta ronda ya se reveló.');
  const statement = room.game.statements[r.index];
  const bets = [];
  for (const playerId of r.eligible) {
    const p = room.players[playerId];
    if (!p) continue;
    const bet = r.bets[playerId];
    let entry;
    if (bet) {
      const correct = bet.side === statement.truth;
      const delta = correct ? bet.stake : -bet.stake;
      p.chips += delta;
      entry = {
        round: r.index,
        statementId: statement.id,
        topic: statement.topic,
        side: bet.side,
        stake: bet.stake,
        balanceBefore: bet.balanceBefore,
        confidence: confidenceOf(bet.stake, bet.balanceBefore),
        correct,
        delta,
        chipsAfter: p.chips,
      };
    } else {
      entry = { round: r.index, statementId: statement.id, topic: statement.topic, side: null, stake: 0, balanceBefore: p.chips, confidence: 0, correct: null, delta: 0, chipsAfter: p.chips };
    }
    p.history.push(entry);
    bets.push({ playerId, name: p.name, ...entry });
  }
  const stats = roundStats(statement, bets);
  const winners = bets
    .filter((b) => b.correct)
    .sort((a, b) => b.delta - a.delta || b.confidence - a.confidence)
    .slice(0, 3)
    .map((b) => ({ playerId: b.playerId, name: b.name, delta: b.delta, confidence: b.confidence }));
  room.game.rounds[r.index] = { index: r.index, statementId: statement.id, stats, winners, bets };
  r.status = 'revealed';
  r.revealedAt = now;
  addLog(room, `Afirmación ${r.index + 1} revelada: ${statement.truth ? 'VERDADERA' : 'FALSA'} (${stats.right}/${stats.bettors} acertaron).`, now);
  return { index: r.index, truth: statement.truth, stats, winners };
}

export function nextRound(room, now = Date.now()) {
  const r = room.round;
  if (!r || r.status !== 'revealed') throw new DomainError('Primero revela la afirmación actual.');
  if (r.index + 1 >= room.game.statements.length) {
    finishGame(room, now, 'completed');
    return { finished: true };
  }
  return { finished: false, ...openRound(room, r.index + 1, now) };
}

export function finishGame(room, now = Date.now(), reason = 'moderator') {
  if (!room.game) throw new DomainError('La partida no ha empezado.');
  if (room.phase === 'finished') return;
  if (room.round && room.round.status !== 'revealed') {
    room.round.status = 'void';
    room.round.closesAt = null;
  }
  room.phase = 'finished';
  room.game.endedAt = now;
  room.results = buildResults(room, now);
  addLog(room, reason === 'completed' ? 'Mercado cerrado: se jugaron todas las afirmaciones.' : 'El moderador cerró el mercado.', now);
}

export function pauseGame(room, now = Date.now()) {
  if (room.phase !== 'running') throw new DomainError('El juego no está en curso.');
  room.phase = 'paused';
  const r = room.round;
  if (r?.status === 'betting' && r.closesAt !== null) {
    r.remainingMs = Math.max(0, r.closesAt - now);
    r.closesAt = null;
  }
  addLog(room, 'Mercado en pausa.', now);
}

export function resumeGame(room, now = Date.now()) {
  if (room.phase !== 'paused') throw new DomainError('El juego no está en pausa.');
  room.phase = 'running';
  room.autoPaused = false;
  const r = room.round;
  if (r?.status === 'betting') {
    r.closesAt = now + Math.max(r.remainingMs ?? 0, 5000);
    r.remainingMs = null;
  }
  addLog(room, 'Mercado reanudado.', now);
}

export function addTime(room, seconds, now = Date.now()) {
  const r = room.round;
  if (!r || r.status !== 'betting') throw new DomainError('Solo se puede dar tiempo con el mercado abierto.');
  const ms = Math.round(Number(seconds) * 1000);
  if (!Number.isFinite(ms) || ms === 0) throw new DomainError('Tiempo no válido.');
  if (r.closesAt === null) r.remainingMs = Math.max(3000, (r.remainingMs ?? 0) + ms);
  else r.closesAt = Math.max(now + 3000, r.closesAt + ms);
}

/** Avance del reloj (cada 250 ms). Devuelve los eventos para difundir. */
export function tick(room, now = Date.now(), isOnline = () => true) {
  const events = [];
  if (room.phase !== 'running' || !room.round) return events;
  const r = room.round;
  if (r.status === 'betting') {
    const timeUp = r.closesAt !== null && now >= r.closesAt;
    const allIn = room.config.autoClose && everyoneBet(room, isOnline);
    if (timeUp || allIn) {
      closeRound(room, now);
      events.push({ type: 'closed', index: r.index, reason: timeUp ? 'time' : 'all' });
    }
  } else if (r.status === 'closed' && room.config.autoReveal && now - r.closedAt >= AUTO_REVEAL_DELAY_MS) {
    const res = revealRound(room, now);
    events.push({ type: 'revealed', index: res.index });
  }
  return events;
}

/** Tras un reinicio del servidor, una partida en curso vuelve en pausa para que nadie pierda tiempo. */
export function restoreAfterRestart(room, now = Date.now()) {
  if (room.phase !== 'running') return false;
  pauseGame(room, now);
  room.autoPaused = true;
  return true;
}

export function resetGame(room) {
  room.phase = 'lobby';
  room.game = null;
  room.round = null;
  room.results = null;
  room.podiumRevealed = false;
  room.autoPaused = false;
  for (const p of Object.values(room.players)) Object.assign(p, newPlayerState(room.config));
  addLog(room, 'Partida reiniciada: todos vuelven a la sala de espera.');
}

/** Ranking del juego en vivo: patrimonio neto (fichas − préstamos del banco). */
export function liveStandings(room) {
  const list = orderedPlayers(room).map((p) => {
    const net = p.chips - p.loans;
    const answered = p.history.filter((h) => h.side !== null);
    return {
      id: p.id,
      name: p.name,
      chips: p.chips,
      loans: p.loans,
      net,
      profit: net - room.config.startChips,
      correct: answered.filter((h) => h.correct).length,
      answered: answered.length,
      rounds: p.history.length,
      grade: 0,
    };
  });
  list.sort(compareStandings);
  return assignPlaces(list, (x) => String(x.net));
}

export function buildResults(room, now = Date.now()) {
  const weights = room.config.scoring.weights;
  const standings = orderedPlayers(room).map((p) => {
    const summary = summarizePlayer(p.history, { weights });
    const net = p.chips - p.loans;
    return {
      id: p.id,
      name: p.name,
      chips: p.chips,
      loans: p.loans,
      rescues: p.rescues,
      net,
      profit: net - room.config.startChips,
      grade: summary.grade,
      correct: summary.correct,
      summary,
      history: p.history,
    };
  });
  standings.sort(compareStandings);
  assignPlaces(standings);
  assignBadges(standings);
  const rounds = (room.game?.rounds ?? []).filter(Boolean).map((r) => ({ index: r.index, statement: room.game.statements[r.index], bets: r.bets }));
  const insights = classInsights(rounds, { topics: room.game?.topics ?? [] });
  const graded = standings.filter((s) => s.summary.rounds > 0);
  return {
    generatedAt: now,
    roundsPlayed: rounds.length,
    totalRounds: room.game?.statements.length ?? 0,
    weights,
    startChips: room.config.startChips,
    topics: room.game?.topics ?? [],
    standings,
    insights,
    averages: {
      grade: graded.length ? Math.round((graded.reduce((s, x) => s + x.grade, 0) / graded.length) * 100) / 100 : null,
      accuracy: graded.length ? Math.round((graded.reduce((s, x) => s + x.summary.accuracy, 0) / graded.length) * 10000) / 10000 : null,
      calibrationGrade: graded.length ? Math.round((graded.reduce((s, x) => s + x.summary.calibrationGrade, 0) / graded.length) * 100) / 100 : null,
    },
  };
}

/** Estadística de apuestas de la ronda abierta (para el moderador; nunca se envía a estudiantes). */
export function liveBetStats(room) {
  const r = room.round;
  if (!r || !room.game) return null;
  const list = Object.entries(r.bets).map(([playerId, b]) => ({ playerId, side: b.side, stake: b.stake, confidence: confidenceOf(b.stake, b.balanceBefore), correct: null }));
  const onTrue = list.filter((b) => b.side === true);
  const onFalse = list.filter((b) => b.side === false);
  return {
    bettors: list.length,
    eligible: r.eligible.filter((id) => room.players[id]).length,
    onTrue: onTrue.length,
    onFalse: onFalse.length,
    chipsTrue: onTrue.reduce((s, b) => s + b.stake, 0),
    chipsFalse: onFalse.reduce((s, b) => s + b.stake, 0),
    meanConfidence: list.length ? list.reduce((s, b) => s + b.confidence, 0) / list.length : null,
  };
}
