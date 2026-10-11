import { DEFAULT_SCORING, normalizeWeights } from '../scoring/scoring.js';

export const PHASES = ['lobby', 'running', 'paused', 'finished'];

export function defaultConfig() {
  return {
    title: 'La Bolsa de Hipótesis',
    perTopic: 3,
    randomPick: false,
    betSeconds: 45,
    startChips: 100,
    minBet: 5,
    rescueChips: 30,
    autoClose: true,
    autoReveal: false,
    showLeaderboard: true,
    scoring: { weights: { ...DEFAULT_SCORING.weights } },
  };
}

export function createRoom(code, now = Date.now()) {
  return {
    code,
    createdAt: now,
    updatedAt: now,
    version: 0,
    phase: 'lobby',
    config: defaultConfig(),
    players: {},
    game: null,
    round: null,
    results: null,
    podiumRevealed: false,
    autoPaused: false,
    log: [],
  };
}

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Aplica un parche de configuración validando cada campo. Lo que define la partida solo cambia en el lobby. */
export function applyConfigPatch(room, patch = {}) {
  const c = room.config;
  const lobby = room.phase === 'lobby';
  if (typeof patch.title === 'string') c.title = patch.title.trim().slice(0, 60) || c.title;
  if (lobby) {
    if (patch.perTopic !== undefined) c.perTopic = clampInt(patch.perTopic, 1, 7, c.perTopic);
    if (typeof patch.randomPick === 'boolean') c.randomPick = patch.randomPick;
    if (patch.startChips !== undefined) c.startChips = clampInt(patch.startChips, 10, 10_000, c.startChips);
    if (patch.minBet !== undefined) c.minBet = clampInt(patch.minBet, 1, 1000, c.minBet);
    if (patch.rescueChips !== undefined) c.rescueChips = clampInt(patch.rescueChips, 0, 10_000, c.rescueChips);
    c.minBet = Math.min(c.minBet, c.startChips);
  }
  if (patch.betSeconds !== undefined) c.betSeconds = clampInt(patch.betSeconds, 10, 300, c.betSeconds);
  if (typeof patch.autoClose === 'boolean') c.autoClose = patch.autoClose;
  if (typeof patch.autoReveal === 'boolean') c.autoReveal = patch.autoReveal;
  if (typeof patch.showLeaderboard === 'boolean') c.showLeaderboard = patch.showLeaderboard;
  if (patch.scoring?.weights) c.scoring.weights = normalizeWeights({ ...c.scoring.weights, ...patch.scoring.weights });
  return c;
}

export function addLog(room, text, now = Date.now()) {
  room.log.push({ at: now, text });
  if (room.log.length > 80) room.log.splice(0, room.log.length - 80);
}

/** Jugadores en orden de llegada. */
export function orderedPlayers(room) {
  return Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}
