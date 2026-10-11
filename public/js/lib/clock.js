import { useEffect, useState } from './html.js';

/** Desfase entre el reloj del servidor y el del dispositivo (ms). */
let offset = 0;
let bestRtt = Infinity;

export function serverNow() {
  return Date.now() + offset;
}

/** Sincroniza con el servidor usando el ida y vuelta más corto (estilo NTP simplificado). */
export async function syncClock(socket, samples = 4) {
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const res = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      socket.emit('clock:ping', {}, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    const t1 = Date.now();
    if (!res) continue;
    const rtt = t1 - t0;
    if (rtt <= bestRtt) {
      bestRtt = rtt;
      offset = res.serverNow - (t0 + rtt / 2);
    }
  }
}

/** Milisegundos que le quedan al mercado abierto (congelado si está en pausa). */
export function roundRemaining(round) {
  if (!round || round.status !== 'betting') return 0;
  if (round.closesAt === null || round.closesAt === undefined) return Math.max(0, round.remainingMs ?? 0);
  return Math.max(0, round.closesAt - serverNow());
}

/** Re-renderiza el componente cada `ms` milisegundos. */
export function useTick(ms = 250, active = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}
