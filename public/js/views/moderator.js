import { html, useEffect, useMemo, useState } from '../lib/html.js';
import { api, download, useConnection, useKeepAlive } from '../lib/connection.js';
import { roundRemaining, useTick } from '../lib/clock.js';
import { BADGES, TOPICS, chips, grade, pct, phaseLabel, signed } from '../lib/format.js';
import {
  Avatar, ConnectionBanner, Footer, Icon, Logo, Rich, RingTimer, SplitBar, Toasts, TopicPill, TruthBadge, useToasts,
} from '../components/ui.js';
import { CalibrationChart, RiskMeter, TopicBars } from '../components/charts.js';
import { BankEditor } from './bankEditor.js';

const KEY_STORE = 'statbet:modkey';
const ROOM_STORE = 'statbet:modroom';

export function ModeratorApp() {
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORE) || '');
  const logout = () => {
    localStorage.removeItem(KEY_STORE);
    setKey('');
  };
  return html`<div class="theme panel-app">
    ${key ? html`<${Panel} key=${key} modKey=${key} onLogout=${logout} />` : html`<${Login} onOk=${(k) => { localStorage.setItem(KEY_STORE, k); setKey(k); }} />`}
  </div>`;
}

function Login({ onOk }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await api('/api/moderator/check', { method: 'POST', key: value.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error || 'Clave incorrecta.');
    onOk(value.trim());
  };
  return html`<main class="notice-screen">
    <form class="card notice-card edge-brand" onSubmit=${submit}>
      <${Logo} size=${46} sub="Panel del profe" />
      <p class="soft">Ingresa la clave de moderador para administrar la bolsa.</p>
      <input class="input" type="password" autocomplete="current-password" placeholder="Clave de moderador" value=${value} onInput=${(e) => setValue(e.currentTarget.value)} />
      ${error ? html`<p class="error-text">${error}</p>` : null}
      <button class="btn primary block" disabled=${busy || !value.trim()}><${Icon} name="unlock" /> Entrar</button>
    </form>
  </main>`;
}

function Panel({ modKey, onLogout }) {
  const [toasts, toast] = useToasts();
  const [rooms, setRooms] = useState(null);
  const [watching, setWatching] = useState(() => localStorage.getItem(ROOM_STORE) || '');
  const [tab, setTab] = useState('live');
  useKeepAlive(true);

  const conn = useConnection({ role: 'moderator', key: modKey }, {
    onEvent: (ev) => {
      if (ev.type === 'closed' && ev.reason === 'all') toast('Todos apostaron: mercado cerrado.', { icon: 'lock', group: 'round' });
      if (ev.type === 'closed' && ev.reason === 'time') toast('Se acabó el tiempo: mercado cerrado.', { icon: 'clock', group: 'round' });
    },
  });
  const mod = conn.mod && conn.mod.code === watching ? conn.mod : null;

  const refreshRooms = async () => {
    const res = await conn.call('mod:listRooms');
    if (res.ok) setRooms(res.rooms);
  };

  useEffect(() => {
    if (conn.status !== 'online') return;
    refreshRooms();
    if (watching) {
      conn.call('mod:watch', { code: watching }).then((res) => {
        if (!res.ok) {
          localStorage.removeItem(ROOM_STORE);
          setWatching('');
        }
      });
    }
  }, [conn.status]);

  useEffect(() => {
    if (conn.fatal?.code === 'CLAVE_INVALIDA') onLogout();
  }, [conn.fatal]);

  const run = async (event, payload, okText) => {
    const res = await conn.call(event, payload);
    if (!res.ok) toast(res.error, { kind: 'error', ms: 5000 });
    else if (okText) toast(okText, { icon: 'check' });
    return res;
  };

  const watch = async (code) => {
    const res = await run('mod:watch', { code });
    if (res.ok) {
      localStorage.setItem(ROOM_STORE, res.code);
      setWatching(res.code);
      setTab('room');
    }
  };
  const create = async (title) => {
    const res = await run('mod:createRoom', { title });
    if (res.ok) {
      localStorage.setItem(ROOM_STORE, res.code);
      setWatching(res.code);
      setTab('room');
      refreshRooms();
    }
  };
  const leaveRoom = () => {
    localStorage.removeItem(ROOM_STORE);
    setWatching('');
    refreshRooms();
  };
  const removeRoom = async (code) => {
    if (!confirm(`¿Eliminar la sala ${code}? Se perderán sus resultados.`)) return;
    const res = await run('mod:deleteRoom', { code }, 'Sala eliminada.');
    if (res.ok) {
      if (code === watching) leaveRoom();
      else refreshRooms();
    }
  };

  let body;
  if (!watching) body = html`<${RoomPicker} rooms=${rooms} onWatch=${watch} onCreate=${create} onDelete=${removeRoom} />`;
  else if (!mod) body = html`<div class="panel-loading"><span class="spinner"></span> Cargando la sala ${watching}…</div>`;
  else body = html`<${Dashboard} mod=${mod} tab=${tab} setTab=${setTab} run=${run} call=${conn.call} modKey=${modKey} toast=${toast} />`;

  return html`
    <header class="panel-head">
      <div class="panel-head-inner">
        <${Logo} size=${34} sub="Panel del profe" />
        <div class="row wrap panel-head-tools">
          ${mod
            ? html`<span class="pill cyanish">Sala ${mod.code}</span>
                <span class=${`pill ${mod.phase === 'running' ? 'live' : mod.phase === 'paused' ? 'warn' : ''}`}>${phaseLabel(mod.phase)}</span>
                <a class="btn sm" href=${`/proyector?sala=${mod.code}`} target="_blank" rel="noopener"><${Icon} name="monitor" /> Proyector</a>
                <button class="btn sm ghost" onClick=${leaveRoom}><${Icon} name="back" /> Salas</button>`
            : null}
          <button class="icon-btn" onClick=${onLogout} title="Cerrar sesión" aria-label="Cerrar sesión"><${Icon} name="logout" size=${18} /></button>
        </div>
      </div>
    </header>
    <main class="panel-main">${body}</main>
    <${Footer} />
    <${Toasts} toasts=${toasts} />
    <${ConnectionBanner} status=${conn.status} />
  `;
}

/* ------------------------------------------------------------------ Salas */

function RoomPicker({ rooms, onWatch, onCreate, onDelete }) {
  const [title, setTitle] = useState('La Bolsa de Hipótesis');
  return html`<div class="panel-grid two">
    <section class="card stack edge-brand">
      <h2 class="card-title"><${Icon} name="plus" /> Nueva sala</h2>
      <label class="field"><span>Título (se ve en el proyector)</span>
        <input class="input" value=${title} maxlength="60" onInput=${(e) => setTitle(e.currentTarget.value)} />
      </label>
      <button class="btn primary lg" onClick=${() => onCreate(title.trim())}><${Icon} name="coins" /> Crear sala</button>
      <p class="small muted">Cada sala tiene su código y su QR. Las salas se conservan 12 horas sin actividad.</p>
    </section>
    <section class="card stack">
      <h2 class="card-title"><${Icon} name="bank" /> Salas abiertas</h2>
      ${rooms === null
        ? html`<p class="muted"><span class="spinner"></span></p>`
        : rooms.length === 0
          ? html`<p class="soft">Todavía no hay salas. Crea la primera.</p>`
          : html`<div class="room-list">
              ${rooms.map((r) => html`<div key=${r.code} class="room-item">
                <button class="room-open" onClick=${() => onWatch(r.code)}>
                  <b class="room-code">${r.code}</b>
                  <span class="grow"><span class="room-title">${r.title}</span><span class="tiny muted">${phaseLabel(r.phase)} · ${r.players} inversores · ${new Date(r.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span></span>
                  <${Icon} name="chevron" />
                </button>
                <button class="icon-btn" onClick=${() => onDelete(r.code)} title="Eliminar sala" aria-label=${`Eliminar sala ${r.code}`}><${Icon} name="trash" size=${18} /></button>
              </div>`)}
            </div>`}
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ Tablero */

const TABS = [
  { id: 'room', label: 'Sala', icon: 'users' },
  { id: 'live', label: 'En vivo', icon: 'play' },
  { id: 'results', label: 'Resultados', icon: 'trophy' },
  { id: 'bank', label: 'Afirmaciones', icon: 'book' },
  { id: 'settings', label: 'Ajustes', icon: 'gear' },
];

function Dashboard({ mod, tab, setTab, run, call, modKey, toast }) {
  return html`<div class="stack">
    <nav class="tabs" role="tablist">
      ${TABS.map((t) => html`<button key=${t.id} role="tab" aria-selected=${tab === t.id} class=${`tab ${tab === t.id ? 'on' : ''}`} onClick=${() => setTab(t.id)}>
        <${Icon} name=${t.icon} size=${16} />${t.label}
        ${t.id === 'room' ? html`<span class="tab-badge">${mod.players}</span>` : null}
      </button>`)}
    </nav>
    ${tab === 'room' ? html`<${RoomTab} mod=${mod} run=${run} setTab=${setTab} toast=${toast} />` : null}
    ${tab === 'live' ? html`<${LiveTab} mod=${mod} run=${run} setTab=${setTab} />` : null}
    ${tab === 'results' ? html`<${ResultsTab} mod=${mod} modKey=${modKey} toast=${toast} />` : null}
    ${tab === 'bank' ? html`<${BankEditor} call=${call} toast=${toast} modKey=${modKey} locked=${mod.phase !== 'lobby'} />` : null}
    ${tab === 'settings' ? html`<${SettingsTab} mod=${mod} run=${run} />` : null}
  </div>`;
}

function plannedRounds(mod) {
  const per = mod.bankInfo?.perTopic ?? [];
  return per.reduce((s, t) => s + Math.min(mod.config.perTopic, t.active), 0);
}

function StartCard({ mod, run, setTab }) {
  const rounds = plannedRounds(mod);
  const start = async () => {
    if (mod.players === 0 && !confirm('No hay estudiantes en la sala. ¿Abrir el mercado de todas formas?')) return;
    const res = await run('mod:start', {}, 'Mercado abierto.');
    if (res.ok) setTab('live');
  };
  return html`<section class="card stack edge-brand">
    <h2 class="card-title"><${Icon} name="play" /> Abrir el mercado</h2>
    <div class="summary-grid">
      <div><b>${rounds}</b><span>afirmaciones (${mod.config.perTopic} por tema)</span></div>
      <div><b>${mod.config.betSeconds} s</b><span>por apuesta</span></div>
      <div><b>${mod.config.startChips}</b><span>fichas iniciales</span></div>
      <div><b>${Math.round(mod.config.scoring.weights.accuracy * 100)}/${Math.round(mod.config.scoring.weights.calibration * 100)}</b><span>aciertos / calibración</span></div>
    </div>
    <button class="btn primary lg block" onClick=${start} disabled=${rounds === 0}><${Icon} name="play" /> Abrir el mercado con ${mod.players} ${mod.players === 1 ? 'inversor' : 'inversores'}</button>
    <p class="tiny muted">Los estudiantes pueden seguir entrando durante la partida: se suman desde la afirmación en curso.</p>
  </section>`;
}

function RoomTab({ mod, run, setTab, toast }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    fetch(`/api/rooms/${mod.code}/join-url`).then((r) => r.json()).then((d) => d.ok && setUrl(d.url)).catch(() => {});
  }, [mod.code]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado.', { icon: 'link' });
    } catch {
      toast('No se pudo copiar; selecciónalo a mano.', { kind: 'error' });
    }
  };
  const kick = (p) => {
    if (confirm(`¿Retirar a ${p.name} de la sala?`)) run('mod:kick', { playerId: p.id }, `${p.name} fue retirado.`);
  };
  return html`<div class="panel-grid two">
    <div class="stack">
      <section class="card invite-card">
        <img src=${`/api/rooms/${mod.code}/qr.svg`} alt="QR de la sala" />
        <div class="stack" style="gap:8px">
          <span class="eyebrow">Código de la sala</span>
          <span class="invite-code">${mod.code}</span>
          <span class="small soft invite-url">${url}</span>
          <div class="row wrap">
            <button class="btn sm" onClick=${copy} disabled=${!url}><${Icon} name="link" /> Copiar enlace</button>
            <a class="btn sm" href=${`/proyector?sala=${mod.code}`} target="_blank" rel="noopener"><${Icon} name="monitor" /> Abrir proyector</a>
          </div>
        </div>
      </section>
      ${mod.phase === 'lobby'
        ? html`<${StartCard} mod=${mod} run=${run} setTab=${setTab} />`
        : html`<section class="card stack"><p class="soft">La partida está en curso.</p><button class="btn primary" onClick=${() => setTab('live')}><${Icon} name="play" /> Ir al control en vivo</button></section>`}
    </div>
    <section class="card stack">
      <div class="row between">
        <h2 class="card-title" style="margin:0"><${Icon} name="users" /> Inversores</h2>
        <span class="pill">${mod.online} en línea / ${mod.players}</span>
      </div>
      ${mod.playerList.length === 0
        ? html`<p class="soft">Aún no entra nadie. Proyecta el QR para que se unan.</p>`
        : html`<ul class="player-list">
            ${mod.playerList.map((p) => html`<li key=${p.id}>
              <${Avatar} id=${p.id} name=${p.name} size=${32} online=${p.online} />
              <span class="grow"><b class="pl-name">${p.name}</b><span class="tiny muted">${p.online ? 'en línea' : 'desconectado'}${mod.phase !== 'lobby' ? ` · ${chips(p.net)} fichas` : ''}</span></span>
              <button class="icon-btn" onClick=${() => kick(p)} title="Retirar" aria-label=${`Retirar a ${p.name}`}><${Icon} name="x" size=${16} /></button>
            </li>`)}
          </ul>`}
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ En vivo */

function LiveTab({ mod, run, setTab }) {
  const [spoiler, setSpoiler] = useState(() => localStorage.getItem('statbet:spoiler') !== '0');
  const r = mod.round;
  useTick(250, r?.status === 'betting' && mod.phase === 'running');
  const toggleSpoiler = () => {
    localStorage.setItem('statbet:spoiler', spoiler ? '0' : '1');
    setSpoiler(!spoiler);
  };

  if (mod.phase === 'lobby') return html`<${StartCard} mod=${mod} run=${run} setTab=${setTab} />`;
  if (mod.phase === 'finished') return html`<${FinishedControls} mod=${mod} run=${run} setTab=${setTab} />`;
  if (!r || !mod.current) return html`<p class="muted">Sin ronda activa.</p>`;

  const paused = mod.phase === 'paused';
  const remaining = paused ? Math.max(0, r.remainingMs ?? 0) : roundRemaining(r);
  const last = r.index + 1 >= mod.totalRounds;
  const bs = mod.betStats;
  const st = r.reveal?.stats;
  const end = () => confirm(r.status === 'revealed' ? '¿Cerrar el mercado y calcular las notas?' : 'La ronda en curso se anulará (nadie gana ni pierde). ¿Terminar la partida?') && run('mod:end', {}, 'Mercado cerrado.');

  return html`<div class="panel-grid live">
    <section class=${`card stack live-main ${r.status === 'revealed' ? (r.reveal.truth ? 'edge-cyan' : 'edge-pink') : ''}`}>
      <div class="row between wrap">
        <div class="row wrap" style="gap:6px">
          <${TopicPill} topic=${mod.current.topic} />
          <span class="pill">${r.index + 1} / ${mod.totalRounds}</span>
          <span class=${`pill ${r.status === 'betting' ? 'live' : r.status === 'closed' ? 'warn' : 'cyanish'}`}>${{ betting: 'Apuestas abiertas', closed: 'Apuestas cerradas', revealed: 'Revelada' }[r.status]}</span>
        </div>
        ${r.status === 'betting' ? html`<${RingTimer} ms=${remaining} totalMs=${Math.max(mod.config.betSeconds * 1000, remaining)} size=${58} paused=${paused} />` : null}
      </div>
      <p class="live-statement"><${Rich} text=${mod.current.statement} /></p>
      <div class="truth-row">
        ${spoiler || r.status === 'revealed'
          ? html`<${TruthBadge} truth=${mod.current.truth} /><span class="small soft">${mod.current.concept}</span>`
          : html`<span class="small muted">Respuesta oculta</span>`}
        ${r.status !== 'revealed' ? html`<button class="btn sm ghost" onClick=${toggleSpoiler}><${Icon} name="eye" /> ${spoiler ? 'Ocultar' : 'Mostrar'} respuesta</button>` : null}
      </div>

      <div class="control-row">
        ${paused
          ? html`<button class="btn primary lg" onClick=${() => run('mod:resume')}><${Icon} name="play" /> Reanudar</button>`
          : r.status === 'betting'
            ? html`
                <button class="btn primary lg" onClick=${() => run('mod:close')}><${Icon} name="lock" /> Cerrar apuestas</button>
                <button class="btn" onClick=${() => run('mod:addTime', { seconds: 15 })}><${Icon} name="plus" /> 15 s</button>
                <button class="btn" onClick=${() => run('mod:pause')}><${Icon} name="pause" /> Pausar</button>`
            : r.status === 'closed'
              ? html`<button class="btn primary lg" onClick=${() => run('mod:reveal')}><${Icon} name="eye" /> Revelar respuesta</button>
                  <button class="btn" onClick=${() => run('mod:pause')}><${Icon} name="pause" /> Pausar</button>`
              : last
                ? html`<button class="btn primary lg" onClick=${() => run('mod:next')}><${Icon} name="trophy" /> Cerrar mercado y ver resultados</button>`
                : html`<button class="btn primary lg" onClick=${() => run('mod:next')}><${Icon} name="chevron" /> Siguiente afirmación</button>
                    <button class="btn" onClick=${() => run('mod:pause')}><${Icon} name="pause" /> Pausar</button>`}
        <button class="btn danger" onClick=${end}><${Icon} name="stop" /> Terminar</button>
      </div>
      ${mod.config.autoClose ? html`<p class="tiny muted">Cierre automático activo: el mercado se cierra cuando apuestan todos los conectados.</p>` : null}
    </section>

    <section class="card stack">
      <h3 class="card-title"><${Icon} name="coins" /> ${st ? 'Resultado de la ronda' : 'Apuestas en vivo (solo tú las ves)'}</h3>
      ${st
        ? html`<${SplitBar} a=${st.chipsTrue} b=${st.chipsFalse} labelA="Verdadera" labelB="Falsa" unit="fichas" highlight=${r.reveal.truth} />
            <div class="summary-grid">
              <div><b>${st.right}/${st.bettors}</b><span>acertaron</span></div>
              <div><b>${pct(st.meanConfidence)}</b><span>seguridad media</span></div>
              <div><b>${st.confidentWrong}</b><span>fallaron muy seguros</span></div>
              <div><b>${pct(st.riskIndex)}</b><span>índice de riesgo</span></div>
            </div>`
        : bs
          ? html`<${SplitBar} a=${bs.chipsTrue} b=${bs.chipsFalse} labelA="Verdadera" labelB="Falsa" unit="fichas" />
              <div class="summary-grid">
                <div><b>${bs.bettors}/${bs.eligible}</b><span>apostaron</span></div>
                <div><b>${bs.onTrue} · ${bs.onFalse}</b><span>personas V · F</span></div>
                <div><b>${bs.meanConfidence === null ? '—' : pct(bs.meanConfidence)}</b><span>seguridad media</span></div>
                <div><b>${chips(r.pot)}</b><span>fichas en juego</span></div>
              </div>`
          : null}
      <ul class="player-list compact">
        ${mod.playerList.map((p) => html`<li key=${p.id}>
          <${Avatar} id=${p.id} name=${p.name} size=${28} online=${p.online} />
          <span class="grow pl-name">${p.name}</span>
          ${p.bet
            ? html`<span class=${`bet-chip ${p.bet.side ? 'true' : 'false'}`}>${p.bet.side ? 'V' : 'F'} ${chips(p.bet.stake)} · ${pct(p.bet.confidence)}</span>`
            : r.status === 'betting' ? html`<span class="tiny muted">pensando…</span>` : null}
          <span class="num pl-net">${chips(p.net)}</span>
        </li>`)}
      </ul>
    </section>

    <section class="card stack">
      <h3 class="card-title"><${Icon} name="book" /> Secuencia</h3>
      <ol class="sequence">
        ${(mod.statements ?? []).map((s, i) => {
          const done = mod.past.find((p) => p.index === i);
          return html`<li key=${s.id} class=${`${i === r.index ? 'current' : ''} ${done ? 'done' : ''}`}>
            <span class=${`seq-dot ${TOPICS[s.topic]?.key}`}>${i + 1}</span>
            <span class="grow seq-text">${s.statement}</span>
            ${done ? html`<span class="tiny num">${pct(done.accuracy)}</span>` : null}
            ${spoiler || done ? html`<span class=${`seq-truth ${s.truth ? 't-true' : 't-false'}`}>${s.truth ? 'V' : 'F'}</span>` : null}
          </li>`;
        })}
      </ol>
    </section>

    <section class="card stack">
      <h3 class="card-title"><${Icon} name="clock" /> Bitácora</h3>
      <ul class="log-list">
        ${[...mod.log].reverse().map((l, i) => html`<li key=${i}><span class="tiny muted num">${new Date(l.at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> ${l.text}</li>`)}
      </ul>
    </section>
  </div>`;
}

function FinishedControls({ mod, run, setTab }) {
  const reset = () => confirm('Se borrarán las apuestas y notas de esta partida (los estudiantes siguen en la sala). ¿Reiniciar?') && run('mod:reset', {}, 'Partida reiniciada.');
  return html`<div class="panel-grid two">
    <section class="card stack edge-brand">
      <h2 class="card-title"><${Icon} name="trophy" /> Mercado cerrado</h2>
      <p class="soft">En el proyector se ve ahora el reporte del salón (conceptos críticos, acierto por tema y curva de calibración). Cuando quieras, revela el podio.</p>
      ${mod.podiumRevealed
        ? html`<button class="btn" onClick=${() => run('mod:hidePodium')}><${Icon} name="bars" /> Volver al reporte del salón</button>`
        : html`<button class="btn primary lg" onClick=${() => run('mod:revealPodium')}><${Icon} name="crown" /> Revelar el podio</button>`}
      <button class="btn" onClick=${() => setTab('results')}><${Icon} name="file" /> Ver notas y exportar</button>
      <button class="btn danger" onClick=${reset}><${Icon} name="rotate" /> Reiniciar partida</button>
    </section>
    ${mod.results ? html`<${ClassSummary} results=${mod.results} />` : null}
  </div>`;
}

function ClassSummary({ results }) {
  const a = results.averages;
  const t = results.insights.totals;
  return html`<section class="card stack">
    <h3 class="card-title"><${Icon} name="gauge" /> Resumen del curso</h3>
    <div class="summary-grid">
      <div><b>${grade(a.grade, 2)}</b><span>nota promedio</span></div>
      <div><b>${pct(a.accuracy)}</b><span>acierto promedio</span></div>
      <div><b>${grade(a.calibrationGrade, 2)}</b><span>calibración promedio</span></div>
      <div><b>${t.bias === null ? '—' : signed(Math.round(t.bias * 100))} pts</b><span>${t.bias > 0 ? 'sobreconfianza' : 'sesgo de confianza'}</span></div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ Resultados */

function ResultsTab({ mod, modKey, toast }) {
  const res = mod.results;
  const [sort, setSort] = useState('place');
  const get = (kind, name) => download(`/api/rooms/${mod.code}/export/${kind}`, modKey, name).catch((e) => toast(e.message, { kind: 'error' }));
  const standings = useMemo(() => {
    if (!res) return [];
    const list = [...res.standings];
    if (sort === 'grade') list.sort((a, b) => b.grade - a.grade || a.place - b.place);
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return list;
  }, [res, sort]);

  const exports = html`<section class="card stack">
    <h3 class="card-title"><${Icon} name="download" /> Exportar</h3>
    <div class="export-grid">
      <button class="btn" onClick=${() => get('informe.xlsx', 'statbet-informe.xlsx')}><${Icon} name="file" /> Informe Excel</button>
      <a class="btn" href=${`/informe?sala=${mod.code}`} target="_blank" rel="noopener"><${Icon} name="book" /> Informe imprimible / PDF</a>
      <button class="btn" onClick=${() => get('estudiantes.csv', 'statbet-estudiantes.csv')}><${Icon} name="users" /> Notas (CSV)</button>
      <button class="btn" onClick=${() => get('afirmaciones.csv', 'statbet-afirmaciones.csv')}><${Icon} name="bars" /> Afirmaciones (CSV)</button>
      <button class="btn" onClick=${() => get('apuestas.csv', 'statbet-apuestas.csv')}><${Icon} name="coins" /> Apuestas (CSV)</button>
    </div>
    ${mod.phase !== 'finished' ? html`<p class="tiny muted">La partida sigue en curso: las exportaciones salen parciales (solo rondas reveladas).</p>` : null}
  </section>`;

  if (mod.phase === 'lobby') return html`<section class="card"><p class="soft">Los resultados aparecen cuando empiece la partida.</p></section>`;

  if (!res) {
    return html`<div class="stack">
      <section class="card stack">
        <h3 class="card-title"><${Icon} name="trendUp" /> Ranking en vivo</h3>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>#</th><th>Inversor</th><th class="r">Patrimonio</th><th class="r">Aciertos</th></tr></thead>
          <tbody>${[...mod.playerList].sort((a, b) => (a.place ?? 999) - (b.place ?? 999)).map((p) => html`<tr key=${p.id}>
            <td>${p.place ?? '—'}</td><td>${p.name}</td><td class="r num">${chips(p.net)}</td><td class="r num">${p.correct}/${p.answered}</td>
          </tr>`)}</tbody>
        </table></div>
        <p class="tiny muted">Las notas se calculan al cerrar el mercado.</p>
      </section>
      ${exports}
    </div>`;
  }

  const ins = res.insights;
  return html`<div class="stack">
    <div class="panel-grid two">
      <${ClassSummary} results=${res} />
      ${exports}
    </div>
    <section class="card stack">
      <div class="row between wrap">
        <h3 class="card-title" style="margin:0"><${Icon} name="trophy" /> Notas (${grade(res.weights.accuracy * 100, 0)} % aciertos + ${grade(res.weights.calibration * 100, 0)} % calibración)</h3>
        <div class="seg">
          ${[['place', 'Patrimonio'], ['grade', 'Nota'], ['name', 'Nombre']].map(([k, l]) => html`<button key=${k} class=${sort === k ? 'on' : ''} onClick=${() => setSort(k)}>${l}</button>`)}
        </div>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>#</th><th>Inversor</th><th class="r">Patrimonio</th><th class="r">Aciertos</th><th class="r">Nota aciertos</th><th class="r">Calibración</th><th class="r">Nota</th><th>Errores de concepto</th><th>Insignias</th>
        </tr></thead>
        <tbody>${standings.map((s) => html`<tr key=${s.id}>
          <td>${s.place}</td>
          <td><b>${s.name}</b>${s.rescues ? html`<span class="tiny muted"> · ${s.rescues} rescate${s.rescues > 1 ? 's' : ''}</span>` : null}</td>
          <td class="r num">${chips(s.net)} <span class=${s.profit >= 0 ? 't-win' : 't-loss'}>${signed(s.profit)}</span></td>
          <td class="r num">${s.summary.correct}/${s.summary.rounds}</td>
          <td class="r num">${grade(s.summary.accuracyGrade)}</td>
          <td class="r num">${grade(s.summary.calibrationGrade)}</td>
          <td class="r"><span class=${`grade-chip ${s.grade >= 4 ? 'hi' : s.grade >= 3 ? 'mid' : 'lo'}`}>${grade(s.grade)}</span></td>
          <td class="num">${s.summary.quadrants.misconception}</td>
          <td><span class="badge-icons">${s.badges.map((b) => html`<span key=${b} title=${BADGES[b]?.label}><${Icon} name=${BADGES[b]?.icon ?? 'star'} size=${15} /></span>`)}</span></td>
        </tr>`)}</tbody>
      </table></div>
    </section>
    <div class="panel-grid two">
      <section class="card stack">
        <h3 class="card-title"><${Icon} name="alert" /> Conceptos críticos (seguros y equivocados)</h3>
        ${ins.critical.length === 0
          ? html`<p class="soft">No hubo errores con alta seguridad.</p>`
          : ins.critical.slice(0, 6).map((c) => html`<article key=${c.index} class="crit-row">
              <div class="row wrap" style="gap:6px"><${TopicPill} topic=${c.topic} /><${TruthBadge} truth=${c.truth} /><span class="tiny muted">Afirmación ${c.index + 1}</span></div>
              <b>${c.concept}</b>
              <p class="small soft">«<${Rich} text=${c.statement} />»</p>
              <div class="row small wrap"><${RiskMeter} value=${c.riskIndex} /><span>Riesgo ${pct(c.riskIndex)} · ${c.confidentWrong} de ${c.bettors} fallaron muy seguros · acierto ${pct(c.accuracy)}</span></div>
              ${c.misconception ? html`<p class="tiny muted">Error típico: ${c.misconception}</p>` : null}
            </article>`)}
      </section>
      <div class="stack">
        <section class="card stack"><h3 class="card-title"><${Icon} name="bars" /> Acierto vs. seguridad por tema</h3><${TopicBars} byTopic=${ins.byTopic} /></section>
        <section class="card stack"><h3 class="card-title"><${Icon} name="gauge" /> Curva de calibración</h3><${CalibrationChart} curve=${ins.curve} height=${240} /></section>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ Ajustes */

function NumberField({ label, value, min, max, step = 1, disabled, onCommit, suffix }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (Number.isFinite(n) && n !== value) onCommit(Math.min(max, Math.max(min, Math.round(n))));
    else setV(String(value));
  };
  return html`<label class="field">
    <span>${label}</span>
    <div class="row"><input class="input sm" type="number" inputmode="numeric" min=${min} max=${max} step=${step} value=${v} disabled=${disabled}
      onInput=${(e) => setV(e.currentTarget.value)} onBlur=${commit} onKeyDown=${(e) => e.key === 'Enter' && e.currentTarget.blur()} />${suffix ? html`<span class="small muted nowrap">${suffix}</span>` : null}</div>
  </label>`;
}

function Toggle({ label, hint, checked, onChange, disabled }) {
  return html`<label class=${`toggle ${disabled ? 'disabled' : ''}`}>
    <input type="checkbox" checked=${checked} disabled=${disabled} onChange=${(e) => onChange(e.currentTarget.checked)} />
    <span class="toggle-ui" aria-hidden="true"></span>
    <span class="grow"><b>${label}</b>${hint ? html`<span class="tiny muted">${hint}</span>` : null}</span>
  </label>`;
}

function SettingsTab({ mod, run }) {
  const c = mod.config;
  const lobby = mod.phase === 'lobby';
  const patch = (p) => run('mod:updateConfig', { patch: p });
  const [wa, setWa] = useState(c.scoring.weights.accuracy);
  const [title, setTitle] = useState(c.title);
  useEffect(() => setWa(c.scoring.weights.accuracy), [c.scoring.weights.accuracy]);
  useEffect(() => setTitle(c.title), [c.title]);
  const maxPer = Math.max(1, Math.min(7, ...(mod.bankInfo?.perTopic ?? []).map((t) => t.active || 1)));

  return html`<div class="panel-grid two">
    <section class="card stack">
      <h3 class="card-title"><${Icon} name="gear" /> Partida</h3>
      ${!lobby ? html`<p class="small warn-text"><${Icon} name="lock" /> Con la partida en curso solo se pueden cambiar el tiempo, los automatismos, el ranking y los pesos de la nota.</p>` : null}
      <label class="field"><span>Título</span>
        <input class="input sm" value=${title} maxlength="60" onInput=${(e) => setTitle(e.currentTarget.value)} onBlur=${() => title.trim() && title !== c.title && patch({ title })} />
      </label>
      <div class="field-grid">
        <${NumberField} label="Afirmaciones por tema" value=${c.perTopic} min=${1} max=${maxPer} disabled=${!lobby} onCommit=${(v) => patch({ perTopic: v })} suffix=${`× 4 = ${plannedRounds(mod)}`} />
        <${NumberField} label="Segundos para apostar" value=${c.betSeconds} min=${10} max=${300} onCommit=${(v) => patch({ betSeconds: v })} suffix="s" />
        <${NumberField} label="Fichas iniciales" value=${c.startChips} min=${10} max=${10000} disabled=${!lobby} onCommit=${(v) => patch({ startChips: v })} />
        <${NumberField} label="Apuesta mínima" value=${c.minBet} min=${1} max=${c.startChips} disabled=${!lobby} onCommit=${(v) => patch({ minBet: v })} />
        <${NumberField} label="Rescate del banco" value=${c.rescueChips} min=${0} max=${10000} disabled=${!lobby} onCommit=${(v) => patch({ rescueChips: v })} suffix="fichas" />
      </div>
      <${Toggle} label="Orden aleatorio" hint="Elige afirmaciones al azar del banco (si no, las primeras de cada tema)." checked=${c.randomPick} disabled=${!lobby} onChange=${(v) => patch({ randomPick: v })} />
      <${Toggle} label="Cierre automático" hint="Cierra las apuestas cuando todos los conectados ya apostaron." checked=${c.autoClose} onChange=${(v) => patch({ autoClose: v })} />
      <${Toggle} label="Revelar automáticamente" hint="Revela la respuesta 2,5 s después del cierre." checked=${c.autoReveal} onChange=${(v) => patch({ autoReveal: v })} />
      <${Toggle} label="Mostrar ranking en el proyector" hint="Cinta de cotizaciones con el patrimonio durante la partida." checked=${c.showLeaderboard} onChange=${(v) => patch({ showLeaderboard: v })} />
    </section>
    <section class="card stack edge-cyan">
      <h3 class="card-title"><${Icon} name="scales" /> Fórmula de la nota</h3>
      <div class="weight-box">
        <div class="row between"><span>Aciertos <b class="num">${Math.round(wa * 100)} %</b></span><span>Calibración <b class="num">${Math.round((1 - wa) * 100)} %</b></span></div>
        <input type="range" class="slider" min="0.3" max="0.9" step="0.05" value=${wa} style=${`--pct:${((wa - 0.3) / 0.6) * 100}%;--fill-from:var(--pink)`}
          onInput=${(e) => setWa(Number(e.currentTarget.value))}
          onChange=${(e) => { const a = Number(e.currentTarget.value); patch({ scoring: { weights: { accuracy: a, calibration: Math.round((1 - a) * 100) / 100 } } }); }} />
      </div>
      <p class="small soft">Nota (0–5) = ${grade(wa, 2)} × aciertos + ${grade(1 - wa, 2)} × calibración. La calibración usa la regla de Brier sobre la seguridad declarada (fichas apostadas / fichas disponibles): no se puede «engañar» apostando siempre todo ni siempre lo mínimo.</p>
      ${mod.phase === 'finished' ? html`<p class="tiny muted">Las notas finales se recalculan al cambiar los pesos.</p>` : null}
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Escenario (12 afirmaciones)</th><th class="r">Aciertos</th><th class="r">Calib.</th><th class="r">Nota</th></tr></thead>
        <tbody>${(mod.scenarios ?? []).map((s) => html`<tr key=${s.label}><td>${s.label}</td><td class="r num">${grade(s.accuracyGrade)}</td><td class="r num">${grade(s.calibrationGrade)}</td><td class="r"><b class="num">${grade(s.grade)}</b></td></tr>`)}</tbody>
      </table></div>
    </section>
  </div>`;
}
