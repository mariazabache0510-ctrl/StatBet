import { Server } from 'socket.io';
import { safeEqual } from '../../lib/ids.js';
import { DomainError } from '../../lib/errors.js';
import { log } from '../../lib/logger.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { applyConfigPatch, addLog } from '../rooms/roomModel.js';
import { findPlayerByToken, removePlayer } from '../rooms/playerService.js';
import * as engine from '../market/marketEngine.js';
import { moderatorView, playerView, publicView } from './views.js';

/**
 * Capa de tiempo real. Traduce mensajes de Socket.IO en llamadas al motor y difunde
 * el estado resultante a cada audiencia:
 *   pub:<SALA>          proyector + todos los jugadores (estado público)
 *   player:<SALA>:<ID>  estado personal de cada jugador (fichas, apuesta, historial)
 *   mod:<SALA>          moderadores
 */
export function createRealtime(httpServer, { manager, bankService, config }) {
  const io = new Server(httpServer, {
    cors: { origin: false },
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 1e6,
  });

  const pending = new Map();
  const ctx = (room) => ({ bank: bankService.get(), bankInfo: bankService.info(), isOnline: manager.onlineChecker(room.code) });

  function broadcastNow(room) {
    pending.delete(room.code);
    if (!manager.get(room.code)) return;
    const now = Date.now();
    const c = ctx(room);
    io.to(`pub:${room.code}`).emit('state:public', publicView(room, { ...c, now }));
    const players = io.sockets.adapter.rooms;
    for (const id of Object.keys(room.players)) {
      const channel = `player:${room.code}:${id}`;
      if (players.has(channel)) io.to(channel).emit('state:me', playerView(room, id));
    }
    io.to(`mod:${room.code}`).emit('state:mod', moderatorView(room, { ...c, now }));
  }

  /** Agrupa cambios muy seguidos (ráfaga de apuestas) en una sola difusión. */
  function scheduleBroadcast(room) {
    if (pending.has(room.code)) return;
    pending.set(room.code, setTimeout(() => broadcastNow(room), config.broadcastThrottleMs));
  }

  manager.on('changed', scheduleBroadcast);
  manager.on('presence', scheduleBroadcast);
  manager.on('removed', (code) => {
    io.to(`pub:${code}`).emit('session:ended', { reason: 'closed' });
  });

  function emitEvent(code, target, event) {
    const channel = target === 'pub' ? `pub:${code}` : target;
    io.to(channel).emit('game:event', event);
    if (target === 'pub') io.to(`mod:${code}`).emit('game:event', event);
  }

  function handle(socket, event, fn, { limiter } = {}) {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limiter && !limiter()) return reply({ ok: false, error: 'Vas muy rápido. Espera un segundo.' });
      try {
        const result = await fn(payload ?? {});
        reply({ ok: true, ...(result && typeof result === 'object' ? result : {}) });
      } catch (err) {
        if (err instanceof DomainError) return reply({ ok: false, error: err.message });
        log.error(`Error en ${event}:`, err);
        reply({ ok: false, error: 'Error interno del servidor.' });
      }
    });
  }

  function announceOpen(code, res) {
    emitEvent(code, 'pub', { type: 'opened', index: res.index });
    for (const r of res.rescued ?? []) emitEvent(code, `player:${code}:${r.playerId}`, { type: 'rescued', amount: r.amount });
  }

  // ---------- Autenticación del handshake ----------
  io.use((socket, next) => {
    const auth = socket.handshake.auth || {};
    if (auth.role === 'moderator') {
      if (!safeEqual(auth.key, config.moderatorKey)) return next(new Error('CLAVE_INVALIDA'));
      socket.data.role = 'moderator';
      return next();
    }
    const room = manager.get(auth.code);
    if (!room) return next(new Error('SALA_NO_EXISTE'));
    if (auth.role === 'projector') {
      socket.data = { role: 'projector', code: room.code };
      return next();
    }
    if (auth.role === 'player') {
      const player = findPlayerByToken(room, auth.token);
      if (!player) return next(new Error('SESION_INVALIDA'));
      socket.data = { role: 'player', code: room.code, playerId: player.id };
      return next();
    }
    return next(new Error('ROL_INVALIDO'));
  });

  io.on('connection', (socket) => {
    socket.on('clock:ping', (_payload, ack) => typeof ack === 'function' && ack({ serverNow: Date.now() }));
    const { role } = socket.data;
    if (role === 'player') onPlayer(socket);
    else if (role === 'projector') onProjector(socket);
    else if (role === 'moderator') onModerator(socket);
  });

  // ---------- Proyector ----------
  function onProjector(socket) {
    const room = manager.get(socket.data.code);
    socket.join(`pub:${room.code}`);
    socket.emit('state:public', publicView(room, { ...ctx(room), now: Date.now() }));
  }

  // ---------- Jugador ----------
  function onPlayer(socket) {
    const { code, playerId } = socket.data;
    const limiter = createRateLimiter({ capacity: 12, refillPerSec: 6 });
    socket.join(`pub:${code}`);
    socket.join(`player:${code}:${playerId}`);
    manager.connect(code, playerId);
    const room = manager.get(code);
    socket.emit('state:public', publicView(room, { ...ctx(room), now: Date.now() }));
    socket.emit('state:me', playerView(room, playerId));

    handle(socket, 'player:bet', ({ round, side, stake }) => {
      const res = manager.mutate(code, (r) => engine.placeBet(r, playerId, { round, side, stake }));
      const r = manager.get(code);
      emitEvent(code, 'pub', { type: 'bet', bettors: Object.keys(r.round.bets).length, stake: Math.round(Number(stake)), changed: res.changed });
      return { allIn: res.allIn };
    }, { limiter });

    handle(socket, 'player:leave', () => {
      const r = manager.get(code);
      if (r && r.phase === 'lobby') manager.mutate(code, (rr) => removePlayer(rr, playerId));
      socket.disconnect(true);
    });

    socket.on('disconnect', () => manager.disconnect(code, playerId));
  }

  // ---------- Moderador ----------
  function onModerator(socket) {
    let watching = null;
    const watch = (code) => {
      if (watching) socket.leave(`mod:${watching}`);
      watching = code;
      socket.join(`mod:${code}`);
      const room = manager.get(code);
      socket.emit('state:mod', moderatorView(room, { ...ctx(room), now: Date.now() }));
    };
    const current = () => {
      if (!watching || !manager.get(watching)) throw new DomainError('Selecciona una sala.');
      return watching;
    };
    const roomSummary = (r) => ({ code: r.code, title: r.config.title, phase: r.phase, players: Object.keys(r.players).length, createdAt: r.createdAt });

    handle(socket, 'mod:listRooms', () => ({ rooms: manager.list().map(roomSummary) }));
    handle(socket, 'mod:createRoom', ({ title }) => {
      const room = manager.create();
      if (title) manager.mutate(room.code, (r) => applyConfigPatch(r, { title }));
      watch(room.code);
      return { code: room.code };
    });
    handle(socket, 'mod:watch', ({ code }) => {
      const room = manager.require(code);
      watch(room.code);
      return { code: room.code };
    });
    handle(socket, 'mod:deleteRoom', async ({ code }) => {
      await manager.remove(code);
      if (watching === code) watching = null;
    });

    const act = (event, fn) => handle(socket, event, (payload) => manager.mutate(current(), (room) => fn(room, payload)));

    act('mod:updateConfig', (room, { patch }) => {
      applyConfigPatch(room, patch);
      if (room.phase === 'finished' && patch?.scoring) room.results = engine.buildResults(room);
    });
    act('mod:kick', (room, { playerId }) => {
      const p = removePlayer(room, playerId);
      io.to(`player:${room.code}:${playerId}`).emit('session:ended', { reason: 'kicked' });
      io.in(`player:${room.code}:${playerId}`).disconnectSockets(true);
      addLog(room, `${p.name} fue retirado de la sala.`);
    });
    act('mod:start', (room) => {
      const res = engine.startGame(room, bankService.get());
      emitEvent(room.code, 'pub', { type: 'started' });
      announceOpen(room.code, res);
    });
    act('mod:close', (room) => {
      const res = engine.closeRound(room);
      emitEvent(room.code, 'pub', { type: 'closed', index: res.index, reason: 'moderator' });
    });
    act('mod:reveal', (room) => {
      const res = engine.revealRound(room);
      emitEvent(room.code, 'pub', { type: 'revealed', index: res.index });
    });
    act('mod:next', (room) => {
      const res = engine.nextRound(room);
      if (res.finished) emitEvent(room.code, 'pub', { type: 'finished' });
      else announceOpen(room.code, res);
    });
    act('mod:pause', (room) => {
      engine.pauseGame(room);
      emitEvent(room.code, 'pub', { type: 'paused' });
    });
    act('mod:resume', (room) => {
      engine.resumeGame(room);
      emitEvent(room.code, 'pub', { type: 'resumed' });
    });
    act('mod:addTime', (room, { seconds }) => {
      engine.addTime(room, seconds);
      emitEvent(room.code, 'pub', { type: 'time', seconds });
    });
    act('mod:end', (room) => {
      engine.finishGame(room, Date.now(), 'moderator');
      emitEvent(room.code, 'pub', { type: 'finished' });
    });
    act('mod:revealPodium', (room) => {
      if (room.phase !== 'finished') throw new DomainError('Primero cierra el mercado.');
      room.podiumRevealed = true;
      emitEvent(room.code, 'pub', { type: 'podium' });
    });
    act('mod:hidePodium', (room) => {
      room.podiumRevealed = false;
    });
    act('mod:reset', (room) => {
      engine.resetGame(room);
      emitEvent(room.code, 'pub', { type: 'reset' });
    });

    handle(socket, 'mod:getBank', () => ({ bank: bankService.get(), info: bankService.info() }));
    handle(socket, 'mod:saveBank', async ({ bank }) => {
      const res = await bankService.save(bank);
      for (const r of manager.list()) manager.touch(r);
      return { warnings: res.warnings, info: bankService.info() };
    });
    handle(socket, 'mod:resetBank', async () => {
      await bankService.resetToFile();
      for (const r of manager.list()) manager.touch(r);
      return { bank: bankService.get(), info: bankService.info() };
    });
  }

  // ---------- Reloj: cierres por tiempo y revelación automática ----------
  const ticker = setInterval(() => {
    const now = Date.now();
    for (const room of manager.list()) {
      if (room.phase !== 'running') continue;
      const events = engine.tick(room, now, manager.onlineChecker(room.code));
      if (events.length) {
        manager.touch(room);
        for (const ev of events) emitEvent(room.code, 'pub', ev);
      } else if (now - (room.lastAliveAt || 0) > 5000) {
        room.lastAliveAt = now;
        manager.scheduleSave(room);
      }
    }
  }, 250);

  return {
    io,
    close() {
      clearInterval(ticker);
      for (const t of pending.values()) clearTimeout(t);
      io.close();
    },
  };
}
