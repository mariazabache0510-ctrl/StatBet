import { orderedPlayers } from '../rooms/roomModel.js';
import { liveBetStats, liveStandings } from '../market/marketEngine.js';
import { confidenceOf, scenarioGrades } from '../scoring/scoring.js';

/**
 * Vistas filtradas por rol. Regla de oro: la verdad, la explicación y la distribución de
 * apuestas de una afirmación solo salen del servidor cuando esa ronda ya fue revelada.
 */

function publicStatement(s) {
  return { id: s.id, topic: s.topic, statement: s.statement, data: s.data, difficulty: s.difficulty };
}

function revealPayload(room, index) {
  const s = room.game.statements[index];
  const done = room.game.rounds[index];
  return {
    truth: s.truth,
    concept: s.concept,
    explanation: s.explanation,
    misconception: s.misconception,
    stats: done?.stats ?? null,
    winners: done?.winners ?? [],
  };
}

function roundPublic(room) {
  const r = room.round;
  if (!r || !room.game) return null;
  const s = room.game.statements[r.index];
  const bets = Object.values(r.bets);
  return {
    index: r.index,
    status: r.status,
    openedAt: r.openedAt,
    closesAt: r.closesAt,
    remainingMs: r.remainingMs,
    closedAt: r.closedAt,
    statement: publicStatement(s),
    bettors: bets.length,
    eligible: r.eligible.filter((id) => room.players[id]).length,
    pot: bets.reduce((sum, b) => sum + b.stake, 0),
    reveal: r.status === 'revealed' ? revealPayload(room, r.index) : null,
  };
}

function pastRounds(room) {
  if (!room.game) return [];
  return room.game.rounds.filter(Boolean).map((done) => {
    const s = room.game.statements[done.index];
    return { index: done.index, topic: s.topic, truth: s.truth, accuracy: done.stats.accuracy, bettors: done.stats.bettors };
  });
}

function configPublic(c) {
  return {
    betSeconds: c.betSeconds,
    startChips: c.startChips,
    minBet: c.minBet,
    rescueChips: c.rescueChips,
    perTopic: c.perTopic,
    showLeaderboard: c.showLeaderboard,
    weights: c.scoring.weights,
  };
}

/** Lo que ven el proyector y todos los celulares. */
export function publicView(room, { now = Date.now(), isOnline = () => false, bank } = {}) {
  const players = orderedPlayers(room);
  const finished = room.phase === 'finished';
  const showBoard = finished || room.config.showLeaderboard;
  const results = room.results;
  return {
    code: room.code,
    title: room.config.title,
    phase: room.phase,
    version: room.version,
    serverNow: now,
    autoPaused: room.autoPaused,
    config: configPublic(room.config),
    topics: room.game?.topics ?? bank?.topics ?? [],
    totalRounds: room.game?.statements.length ?? null,
    players: players.length,
    online: players.filter((p) => isOnline(p.id)).length,
    roster: players.map((p) => ({ id: p.id, name: p.name, online: isOnline(p.id) })),
    round: roundPublic(room),
    past: pastRounds(room),
    leaderboard: showBoard && room.game ? liveStandings(room).slice(0, 10).map(({ id, name, net, chips, place, profit }) => ({ id, name, net, chips, place, profit })) : null,
    podiumRevealed: room.podiumRevealed,
    final: finished && results
      ? {
          roundsPlayed: results.roundsPlayed,
          podium: results.standings.slice(0, 5).map((s) => ({ id: s.id, name: s.name, place: s.place, net: s.net, profit: s.profit, badges: s.badges })),
          oracles: results.standings.filter((s) => s.badges.includes('oracle')).map((s) => s.name),
          critical: results.insights.critical.slice(0, 3).map((c) => ({
            index: c.index,
            topic: c.topic,
            statement: c.statement,
            truth: c.truth,
            concept: c.concept,
            misconception: c.misconception,
            riskIndex: c.riskIndex,
            confidentWrong: c.confidentWrong,
            wrong: c.wrong,
            bettors: c.bettors,
          })),
          byTopic: results.insights.byTopic,
          totals: results.insights.totals,
          curve: results.insights.curve,
        }
      : null,
  };
}

/** Lo que solo ve cada estudiante sobre sí mismo. */
export function playerView(room, playerId) {
  const p = room.players[playerId];
  if (!p) return null;
  const r = room.round;
  const standings = room.game ? liveStandings(room) : [];
  const me = standings.find((s) => s.id === playerId);
  const bet = r && r.status !== 'void' ? r.bets[playerId] : null;
  const final = room.phase === 'finished' && room.results ? room.results.standings.find((s) => s.id === playerId) : null;
  return {
    id: p.id,
    name: p.name,
    chips: p.chips,
    loans: p.loans,
    rescues: p.rescues,
    net: p.chips - p.loans,
    place: me?.place ?? null,
    totalPlayers: standings.length,
    eligible: r ? r.eligible.includes(playerId) : false,
    bet: bet ? { round: r.index, side: bet.side, stake: bet.stake, balanceBefore: bet.balanceBefore, confidence: confidenceOf(bet.stake, bet.balanceBefore) } : null,
    history: p.history.map((h) => {
      const s = room.game?.statements[h.round];
      return { ...h, statement: s?.statement, truth: s?.truth, concept: s?.concept, explanation: s?.explanation, misconception: s?.misconception };
    }),
    final: final
      ? {
          place: final.place,
          of: room.results.standings.length,
          net: final.net,
          profit: final.profit,
          grade: final.grade,
          summary: final.summary,
          badges: final.badges,
          weights: room.results.weights,
        }
      : null,
  };
}

/** Todo, para el panel del moderador. */
export function moderatorView(room, { now = Date.now(), isOnline = () => false, bankInfo } = {}) {
  const r = room.round;
  const statement = r && room.game ? room.game.statements[r.index] : null;
  const standings = room.game ? liveStandings(room) : [];
  const byId = new Map(standings.map((s) => [s.id, s]));
  return {
    ...publicView(room, { now, isOnline }),
    config: room.config,
    bankInfo,
    statements: room.game?.statements.map((s) => ({ id: s.id, topic: s.topic, statement: s.statement, truth: s.truth, concept: s.concept })) ?? null,
    current: statement ? { ...publicStatement(statement), truth: statement.truth, concept: statement.concept, explanation: statement.explanation } : null,
    betStats: r?.status === 'betting' || r?.status === 'closed' ? liveBetStats(room) : null,
    playerList: orderedPlayers(room).map((p) => {
      const bet = r?.bets[p.id];
      const s = byId.get(p.id);
      return {
        id: p.id,
        name: p.name,
        online: isOnline(p.id),
        chips: p.chips,
        loans: p.loans,
        net: p.chips - p.loans,
        place: s?.place ?? null,
        correct: s?.correct ?? 0,
        answered: s?.answered ?? 0,
        bet: bet ? { side: bet.side, stake: bet.stake, confidence: confidenceOf(bet.stake, bet.balanceBefore) } : null,
      };
    }),
    results: room.results,
    scenarios: scenarioGrades(room.config.scoring.weights).map(({ label, accuracyGrade, calibrationGrade, grade }) => ({ label, accuracyGrade, calibrationGrade, grade })),
    log: room.log.slice(-30),
  };
}
