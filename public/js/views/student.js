import { html, useEffect, useMemo, useRef, useState } from '../lib/html.js';
import { api, deviceId, useConnection } from '../lib/connection.js';
import { roundRemaining, useTick } from '../lib/clock.js';
import { isMuted, setMuted, sfx, unlockAudio, vibrate } from '../lib/sound.js';
import { BADGES, DIFFICULTY, QUADRANTS, TOPICS, chips, confidenceLabel, dec, grade, ordinal, pct, probability, quadrantOf, signed } from '../lib/format.js';
import {
  AnimatedNumber, Chip, ChipStack, Coin3D, Confetti, ConnectionBanner, Footer, Icon, Logo, Rich,
  RingTimer, SoundToggle, SplitBar, Toasts, TopicPill, TruthBadge, useToasts,
} from '../components/ui.js';

const SESSION_KEY = 'statbet:session';

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}
const saveSession = (s) => (s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY));

export function StudentApp() {
  const urlCode = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
  const [session, setSession] = useState(() => {
    const s = loadSession();
    return s && (!urlCode || s.code === urlCode) ? s : null;
  });

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const onJoined = (s) => {
    saveSession(s);
    if (urlCode) history.replaceState(null, '', '/');
    setSession(s);
  };
  const onExit = () => {
    saveSession(null);
    setSession(null);
  };

  return html`<div class="theme student">
    ${session ? html`<${Game} key=${session.token} session=${session} onExit=${onExit} />` : html`<${Join} initialCode=${urlCode || loadSession()?.code || ''} onJoined=${onJoined} />`}
  </div>`;
}

/* ------------------------------------------------------------------ Ingreso */

function Join({ initialCode, onJoined }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(() => localStorage.getItem('statbet:name') || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    unlockAudio();
    const c = code.trim().toUpperCase();
    if (c.length < 4) return setError('Escribe el código de la sala que aparece en el proyector.');
    if (name.trim().length < 2) return setError('Escribe tu nombre (mínimo 2 letras).');
    setBusy(true);
    setError('');
    const res = await api(`/api/rooms/${encodeURIComponent(c)}/join`, { method: 'POST', body: { name: name.trim(), device: deviceId() } });
    setBusy(false);
    if (!res.ok) return setError(res.error || 'No se pudo entrar a la sala.');
    localStorage.setItem('statbet:name', name.trim());
    sfx.chips(5);
    onJoined({ code: res.code, token: res.token, playerId: res.playerId, name: res.name });
  };

  return html`<main class="s-wrap">
    <section class="join-hero">
      <${Logo} size=${44} sub="La Bolsa de Hipótesis" />
      <${Coin3D} size=${118} value="100" />
      <h1>Apuesta a lo que <span class="grad-text">sabes</span></h1>
      <p>Empiezas con 100 fichas. Decide si cada afirmación es verdadera o falsa y apuesta según tu seguridad.</p>
      <div class="topic-strip">
        ${Object.keys(TOPICS).map((t) => html`<${TopicPill} key=${t} topic=${Number(t)} />`)}
      </div>
    </section>
    <form class="card edge-brand stack" onSubmit=${submit} novalidate>
      <label class="field">
        <span>Código de la sala</span>
        <input class="input code" value=${code} maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text"
          placeholder="ABC123" onInput=${(e) => setCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      </label>
      <label class="field">
        <span>Tu nombre (como aparecerá en el ranking)</span>
        <input class="input" value=${name} maxlength="24" autocomplete="name" placeholder="Nombre y apellido" onInput=${(e) => setName(e.currentTarget.value)} />
      </label>
      ${error ? html`<p class="error-text" role="alert">${error}</p>` : null}
      <button class="btn primary lg block" disabled=${busy}>
        ${busy ? html`<span class="spinner"></span> Entrando…` : html`<${Icon} name="coins" /> Entrar a la bolsa`}
      </button>
    </form>
    <${Footer} />
  </main>`;
}

/* ------------------------------------------------------------------ Juego */

function Game({ session, onExit }) {
  const [toasts, toast] = useToasts();
  const [muted, setMute] = useState(isMuted());
  const [confetti, setConfetti] = useState(0);
  const conn = useConnection(
    { role: 'player', code: session.code, token: session.token },
    {
      onEvent: (ev) => {
        if (ev.type === 'opened') {
          sfx.open();
          vibrate(60);
        } else if (ev.type === 'closed') {
          sfx.close();
        } else if (ev.type === 'rescued') {
          sfx.chips(6);
          toast(`El banco te prestó ${ev.amount} fichas para seguir jugando. Cuentan como deuda en el ranking, no en tu nota.`, { icon: 'bank', ms: 6500, kind: 'pink' });
        } else if (ev.type === 'paused') {
          sfx.neutral();
        } else if (ev.type === 'time') {
          toast(`El profe agregó ${ev.seconds} segundos.`, { icon: 'clock', group: 'time' });
        } else if (ev.type === 'reset') {
          toast('El profe reinició la partida.', { icon: 'rotate' });
        }
      },
    },
  );
  const pub = conn.public;
  const me = conn.me;

  const toggleMute = () => {
    setMuted(!muted);
    setMute(!muted);
  };

  if (conn.fatal) {
    return html`<${Notice} icon="alert" title="Sesión terminada" text=${conn.fatal.message}>
      <button class="btn primary block" onClick=${onExit}>Volver a entrar</button>
    </${Notice}>`;
  }
  if (!pub || !me) {
    return html`<${Notice} icon="coins" title="Conectando con la bolsa…" text="Un momento, estamos recuperando tus fichas." spinner />`;
  }

  const leave = async () => {
    await conn.call('player:leave');
    onExit();
  };

  let body;
  if (pub.phase === 'lobby') body = html`<${Lobby} pub=${pub} me=${me} onLeave=${leave} />`;
  else if (pub.phase === 'finished') body = html`<${Final} pub=${pub} me=${me} onConfetti=${() => setConfetti((n) => n + 1)} onExit=${onExit} />`;
  else body = html`<${Market} pub=${pub} me=${me} call=${conn.call} toast=${toast} />`;

  return html`
    ${pub.phase !== 'lobby' ? html`<${WalletHeader} pub=${pub} me=${me} muted=${muted} onMute=${toggleMute} />` : null}
    ${body}
    ${pub.phase === 'paused' ? html`<${PauseOverlay} auto=${pub.autoPaused} />` : null}
    <${Toasts} toasts=${toasts} />
    <${ConnectionBanner} status=${conn.status} />
    ${confetti ? html`<${Confetti} fire=${confetti} />` : null}
  `;
}

function Notice({ icon, title, text, spinner = false, children }) {
  return html`<main class="notice-screen">
    <div class="card notice-card">
      <span class="notice-icon">${spinner ? html`<span class="spinner" style="width:30px;height:30px"></span>` : html`<${Icon} name=${icon} />`}</span>
      <h2>${title}</h2>
      ${text ? html`<p class="soft">${text}</p>` : null}
      ${children}
    </div>
  </main>`;
}

function WalletHeader({ pub, me, muted, onMute }) {
  const total = pub.totalRounds || 0;
  const current = pub.round?.index ?? -1;
  const byRound = new Map(me.history.map((h) => [h.round, h]));
  const hidePlace = pub.phase === 'finished' && !pub.podiumRevealed;
  return html`<header class="s-head">
    <div class="s-head-inner">
      <div class="wallet">
        <${Chip} tone=${me.chips >= pub.config.startChips ? 'cyan' : 'pink'} size=${38} />
        <div class="wallet-amount">
          <b><${AnimatedNumber} value=${me.chips} /></b>
          <small>${me.loans ? `fichas · deuda ${chips(me.loans)}` : `fichas · ${me.name}`}</small>
        </div>
      </div>
      ${me.place && !hidePlace
        ? html`<div class="rank-badge"><b class="num">${ordinal(me.place)}</b><small>de ${me.totalPlayers}</small></div>`
        : null}
      <${SoundToggle} muted=${muted} onToggle=${onMute} />
    </div>
    ${total
      ? html`<div class="progress-dots" aria-label=${`Afirmación ${current + 1} de ${total}`}>
          ${Array.from({ length: total }, (_, i) => {
            const h = byRound.get(i);
            const cls = h ? `done ${h.side === null ? 'none' : h.correct ? 'win' : 'loss'}` : i === current && pub.phase !== 'finished' ? 'current' : '';
            return html`<span key=${i} class=${cls}></span>`;
          })}
        </div>`
      : null}
  </header>`;
}

function PauseOverlay({ auto }) {
  return html`<div class="pause-overlay" role="alertdialog" aria-live="assertive">
    <div class="pause-card">
      <span class="pause-icon"><${Icon} name="pause" /></span>
      <h2>Mercado en pausa</h2>
      <p class="soft">${auto ? 'El servidor se reinició y la partida quedó a salvo. El profe la reanudará en un momento.' : 'El profe detuvo el reloj. Tus fichas y tu apuesta siguen guardadas.'}</p>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ Sala de espera */

function Lobby({ pub, me, onLeave }) {
  const w = pub.config.weights;
  return html`<main class="s-wrap">
    <header class="row between" style="padding-top:4px">
      <${Logo} size=${34} />
      <span class="pill live">Sala ${pub.code}</span>
    </header>
    <section class="card edge-brand final-hero">
      <${Coin3D} size=${110} value=${String(pub.config.startChips)} />
      <p class="eyebrow">Tu billetera</p>
      <h2 class="display" style="font-size:2rem">${chips(me.chips)} fichas</h2>
      <p class="soft">Hola, <b>${me.name}</b>. Espera a que el profe abra el mercado.</p>
      <div class="row" style="justify-content:center">
        <span class="spinner"></span><span class="small muted">${pub.players} ${pub.players === 1 ? 'inversor conectado' : 'inversores en la sala'}</span>
      </div>
    </section>

    <section class="card stack">
      <h3 class="card-title"><${Icon} name="book" /> Cómo se juega</h3>
      <div class="rules">
        <div class="rule"><span class="rule-n">1</span><p>Lee la afirmación y decide si es <b class="t-true">Verdadera</b> o <b class="t-false">Falsa</b>.</p></div>
        <div class="rule"><span class="rule-n">2</span><p>Apuesta <b>según tu seguridad</b>: mucho si tienes certeza, poco si dudas. Mínimo ${pub.config.minBet} fichas.</p></div>
        <div class="rule"><span class="rule-n">3</span><p>Si aciertas <b class="t-win">ganas</b> lo apostado; si fallas lo <b class="t-loss">pierdes</b>.</p></div>
        <div class="rule"><span class="rule-n">4</span><p>Si te quedas sin fichas, el <b>banco te presta ${pub.config.rescueChips}</b>. Es deuda en el ranking, pero no baja tu nota.</p></div>
      </div>
    </section>

    <section class="card stack edge-cyan">
      <h3 class="card-title"><${Icon} name="gauge" /> Tu nota: ¿sabes lo que sabes?</h3>
      <div class="formula-line">
        <span>Nota =</span><b>${Math.round(w.accuracy * 100)} %</b><span>aciertos +</span><b>${Math.round(w.calibration * 100)} %</b><span>calibración</span>
      </div>
      <p class="small soft">La calibración mide si tu confianza coincide con lo que sabes. Apostar todo y fallar delata un <b class="t-loss">error de concepto</b>; acertar apostando poco muestra que aún <b class="t-true">dudas</b>. Lo que más paga es ser honesto con tu seguridad.</p>
      <div class="quad-grid">
        ${['mastery', 'doubt', 'prudence', 'misconception'].map((q) => html`<div key=${q} class=${`quad ${q}`}>
          <strong>${QUADRANTS[q].label}</strong><span>${QUADRANTS[q].hint}</span>
        </div>`)}
      </div>
    </section>

    <button class="btn ghost block" onClick=${onLeave}><${Icon} name="logout" /> Salir de la sala</button>
    <${Footer} />
  </main>`;
}

/* ------------------------------------------------------------------ Mercado */

function Market({ pub, me, call, toast }) {
  const round = pub.round;
  const status = round?.status;
  useTick(250, status === 'betting' && pub.phase === 'running');
  const remaining = pub.phase === 'paused' ? Math.max(0, round?.remainingMs ?? 0) : roundRemaining(round);

  const lastSecond = useRef(null);
  useEffect(() => {
    if (status !== 'betting' || pub.phase !== 'running') return;
    const s = Math.ceil(remaining / 1000);
    if (s !== lastSecond.current && s <= 5 && s > 0) sfx.tick();
    lastSecond.current = s;
  });

  const entry = round ? me.history.find((h) => h.round === round.index) : null;
  const fxKey = useRef('');
  useEffect(() => {
    if (status !== 'revealed' || !entry) return;
    const key = `${round.index}`;
    if (fxKey.current === key) return;
    fxKey.current = key;
    if (entry.side === null) sfx.neutral();
    else if (entry.correct) {
      sfx.win();
      vibrate([40, 40, 80]);
    } else {
      sfx.lose();
      vibrate(220);
    }
  }, [status, entry, round?.index]);

  if (!round) {
    return html`<${Notice} icon="hourglass" title="Preparando el mercado…" spinner />`;
  }

  const totalMs = Math.max(pub.config.betSeconds * 1000, remaining);
  return html`<main class="s-wrap">
    <${StatementFlip} round=${round} total=${pub.totalRounds} remaining=${remaining} totalMs=${totalMs} paused=${pub.phase === 'paused'} entry=${entry} />
    ${status === 'betting'
      ? me.eligible
        ? html`<${BetZone} key=${round.index} round=${round} me=${me} config=${pub.config} call=${call} toast=${toast} />`
        : html`<div class="card placed-card"><${Icon} name="hourglass" size=${30} /><h3>Entras en la próxima afirmación</h3><p class="soft small">Llegaste con esta ronda en curso; observa y prepárate.</p></div>`
      : null}
    ${status === 'closed' ? html`<${ClosedCard} round=${round} me=${me} />` : null}
    ${status === 'revealed' ? html`<${RevealDetails} round=${round} entry=${entry} />` : null}
    <${Footer} />
  </main>`;
}

function StatementMeta({ round, total, remaining, totalMs, paused, showTimer }) {
  const s = round.statement;
  return html`<div class="statement-meta">
    <div class="row wrap" style="gap:6px">
      <${TopicPill} topic=${s.topic} />
      <span class="pill">${round.index + 1} / ${total}</span>
      ${s.difficulty ? html`<span class="pill">${DIFFICULTY[s.difficulty] ?? s.difficulty}</span>` : null}
    </div>
    ${showTimer ? html`<${RingTimer} ms=${remaining} totalMs=${totalMs} size=${54} paused=${paused} />` : null}
  </div>`;
}

function StatementFlip({ round, total, remaining, totalMs, paused, entry }) {
  const s = round.statement;
  const revealed = round.status === 'revealed' && round.reveal;
  const tone = TOPICS[s.topic]?.key ?? 't1';
  return html`<div class=${`flip ${revealed ? 'flipped' : ''}`}>
    <div class="flip-inner">
      <article class=${`card statement-card flip-face ${tone}`} aria-hidden=${revealed ? 'true' : 'false'}>
        <${StatementMeta} round=${round} total=${total} remaining=${remaining} totalMs=${totalMs} paused=${paused} showTimer=${round.status === 'betting'} />
        <p class="statement-text"><${Rich} text=${s.statement} /></p>
        ${s.data ? html`<p class="data-box"><${Icon} name="info" /><${Rich} text=${s.data} /></p>` : null}
        ${round.status === 'closed' ? html`<div class="row"><span class="pill warn"><${Icon} name="lock" /> Mercado cerrado</span><span class="small muted">Esperando la revelación…</span></div>` : null}
      </article>
      ${revealed
        ? html`<article class=${`card statement-card flip-face flip-back ${round.reveal.truth ? 'edge-cyan' : 'edge-pink'}`}>
            <${StatementMeta} round=${round} total=${total} />
            <div class="row between wrap">
              <${TruthBadge} truth=${round.reveal.truth} big />
              ${entry && entry.side !== null
                ? html`<span class=${`result-delta ${entry.correct ? 'win' : 'loss'}`}>${signed(entry.delta)}</span>`
                : null}
            </div>
            <p class="statement-text"><${Rich} text=${s.statement} /></p>
            <${MyOutcome} entry=${entry} />
          </article>`
        : null}
    </div>
  </div>`;
}

function MyOutcome({ entry }) {
  if (!entry) return html`<p class="small muted">No participaste en esta ronda.</p>`;
  if (entry.side === null) {
    return html`<div class="row wrap"><span class="quadrant-tag">${QUADRANTS.none.label}</span><span class="small muted">Sin apuesta: tus fichas quedan igual.</span></div>`;
  }
  const q = quadrantOf(entry);
  const meta = QUADRANTS[q];
  return html`<div class="stack" style="gap:8px">
    <div class="row wrap">
      <span class=${`quadrant-tag ${meta.tone}`}><${Icon} name=${q === 'misconception' ? 'alert' : q === 'mastery' ? 'star' : q === 'doubt' ? 'info' : 'shield'} size=${14} />${meta.label}</span>
      <span class="small soft">Apostaste <b>${chips(entry.stake)}</b> a <b class=${entry.side ? 't-true' : 't-false'}>${entry.side ? 'Verdadero' : 'Falso'}</b> · confianza ${pct(entry.confidence)}</span>
    </div>
    <p class="small muted">${meta.hint}</p>
  </div>`;
}

/* ---------- Apuesta ---------- */

const QUICK = [
  { f: 0.1, label: '10 %' },
  { f: 0.25, label: '25 %' },
  { f: 0.5, label: '50 %' },
  { f: 1, label: 'Todo', allin: true },
];

function BetZone({ round, me, config, call, toast }) {
  const balance = me.chips;
  const min = Math.min(config.minBet, balance);
  const placed = me.bet && me.bet.round === round.index ? me.bet : null;
  const [editing, setEditing] = useState(!placed);
  const [side, setSide] = useState(placed ? placed.side : null);
  const [stake, setStake] = useState(() => (placed ? placed.stake : Math.max(min, Math.round(balance * 0.25))));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStake((v) => Math.min(balance, Math.max(min, v)));
  }, [balance, min]);

  if (balance <= 0) {
    return html`<div class="card placed-card"><${Icon} name="bank" size=${30} /><h3>Sin fichas en esta ronda</h3><p class="soft small">El banco te prestará fichas al abrir la próxima afirmación.</p></div>`;
  }

  if (placed && !editing) {
    return html`<${PlacedCard} bet=${placed} round=${round} onEdit=${() => setEditing(true)} />`;
  }

  const c = balance ? stake / balance : 0;
  const pctFill = balance > min ? ((stake - min) / (balance - min)) * 100 : 100;
  const fill = side === true ? 'var(--cyan)' : side === false ? 'var(--pink)' : 'var(--violet)';
  const choose = (v) => {
    sfx.tap();
    setSide(v);
  };
  const setAmount = (v) => {
    const n = Math.min(balance, Math.max(min, Math.round(v)));
    if (n !== stake) sfx.chip();
    setStake(n);
  };
  const step = Math.max(1, Math.round(balance / 20));

  const confirm = async () => {
    if (side === null) return;
    setBusy(true);
    const res = await call('player:bet', { round: round.index, side, stake });
    setBusy(false);
    if (!res.ok) return toast(res.error, { kind: 'error' });
    sfx.bet();
    vibrate(30);
    setEditing(false);
    if (res.allIn) toast('¡All-in! Apostaste todas tus fichas.', { icon: 'bolt', kind: 'pink' });
  };

  return html`<section class="card bet-panel">
    <div class="side-pick" role="radiogroup" aria-label="Tu respuesta">
      <button class=${`side-btn true ${side === true ? 'on' : ''}`} role="radio" aria-checked=${side === true} onClick=${() => choose(true)}>
        <${Icon} name="check" />Verdadera<small>Creo que es cierta</small>
      </button>
      <button class=${`side-btn false ${side === false ? 'on' : ''}`} role="radio" aria-checked=${side === false} onClick=${() => choose(false)}>
        <${Icon} name="x" />Falsa<small>Creo que es falsa</small>
      </button>
    </div>

    <div class="stake-box">
      <div class="stake-top">
        <div class="stake-value">
          <${ChipStack} count=${Math.max(1, Math.round(c * 10))} tone=${side === false ? 'pink' : side === true ? 'cyan' : 'violet'} size=${34} max=${10} />
          <div><b>${chips(stake)}</b><small>de ${chips(balance)} fichas</small></div>
        </div>
        <div class="stake-step">
          <button class="icon-btn" aria-label="Apostar menos" onClick=${() => setAmount(stake - step)} disabled=${stake <= min}><${Icon} name="minus" /></button>
          <button class="icon-btn" aria-label="Apostar más" onClick=${() => setAmount(stake + step)} disabled=${stake >= balance}><${Icon} name="plus" /></button>
        </div>
      </div>
      <input type="range" class="slider" min=${min} max=${balance} step="1" value=${stake} disabled=${balance <= min}
        style=${`--pct:${pctFill}%;--fill-from:${fill}`} aria-label="Fichas a apostar"
        onInput=${(e) => setAmount(Number(e.currentTarget.value))} />
      <div class="quick-stakes">
        ${QUICK.map((q) => {
          const v = Math.max(min, Math.round(balance * q.f));
          return html`<button key=${q.label} class=${`${q.allin ? 'allin' : ''} ${stake === v ? 'on' : ''}`} onClick=${() => setAmount(v)}>${q.label}</button>`;
        })}
      </div>
      <div class="conf-meter">
        <div class="conf-label"><span>Seguridad: <b>${confidenceLabel(c)}</b></span><span>«Estoy ${pct(probability(c))} seguro»</span></div>
      </div>
      <div class="outcome-row">
        <div><span class="tiny muted">Si aciertas</span><b class="t-win">+${chips(stake)}</b><span class="tiny muted">quedas con ${chips(balance + stake)}</span></div>
        <div><span class="tiny muted">Si fallas</span><b class="t-loss">−${chips(stake)}</b><span class="tiny muted">quedas con ${chips(balance - stake)}</span></div>
      </div>
    </div>

    <button class=${`btn lg block ${side === true ? 'cyan' : side === false ? 'pink' : 'primary'}`} disabled=${side === null || busy} onClick=${confirm}>
      ${busy
        ? html`<span class="spinner"></span> Registrando…`
        : side === null
          ? 'Elige Verdadera o Falsa'
          : html`<${Icon} name="coins" /> Apostar ${chips(stake)} a ${side ? 'Verdadera' : 'Falsa'}`}
    </button>
    ${placed ? html`<button class="btn ghost sm" onClick=${() => setEditing(false)}>Mantener mi apuesta anterior</button>` : null}
  </section>`;
}

function PlacedCard({ bet, round, onEdit }) {
  return html`<section class=${`card placed-card ${bet.side ? 'edge-cyan' : 'edge-pink'}`}>
    <${ChipStack} count=${Math.max(2, Math.round(bet.confidence * 12))} tone=${bet.side ? 'cyan' : 'pink'} size=${50} />
    <p class="eyebrow">Apuesta registrada</p>
    <h3><span class="num">${chips(bet.stake)}</span> fichas a <span class=${bet.side ? 't-true' : 't-false'}>${bet.side ? 'Verdadera' : 'Falsa'}</span></h3>
    <p class="small soft">Seguridad ${pct(bet.confidence)} · «Estoy ${pct(probability(bet.confidence))} seguro»</p>
    <div class="row small muted" style="justify-content:center"><${Icon} name="users" /> ${round.bettors} de ${round.eligible} ya apostaron</div>
    <button class="btn sm" onClick=${onEdit}><${Icon} name="rotate" /> Cambiar mi apuesta</button>
  </section>`;
}

function ClosedCard({ round, me }) {
  const bet = me.bet && me.bet.round === round.index ? me.bet : null;
  return html`<section class="card placed-card">
    ${bet
      ? html`<${ChipStack} count=${Math.max(2, Math.round(bet.confidence * 12))} tone=${bet.side ? 'cyan' : 'pink'} size=${46} />
          <h3>${chips(bet.stake)} fichas a <span class=${bet.side ? 't-true' : 't-false'}>${bet.side ? 'Verdadera' : 'Falsa'}</span></h3>`
      : html`<${Icon} name="lock" size=${30} /><h3>No alcanzaste a apostar</h3>`}
    <p class="soft small">Se cerraron las apuestas. Mira el proyector: la respuesta está por revelarse.</p>
    <span class="spinner"></span>
  </section>`;
}

function RevealDetails({ round, entry }) {
  const r = round.reveal;
  const st = r.stats;
  return html`
    <section class="card stack">
      <h3 class="card-title"><${Icon} name="bulb" /> ${r.concept || 'Explicación'}</h3>
      <div class="explain"><p><${Rich} text=${r.explanation} /></p></div>
      ${r.misconception
        ? html`<div class="explain misc"><div class="row"><${Icon} name="alert" /><b>Error frecuente</b></div><p><${Rich} text=${r.misconception} /></p></div>`
        : null}
    </section>
    ${st
      ? html`<section class="card stack">
          <h3 class="card-title"><${Icon} name="users" /> Así apostó el salón</h3>
          <${SplitBar} a=${st.onTrue} b=${st.onFalse} labelA="Verdadera" labelB="Falsa" highlight=${r.truth} />
          <div class="kpis">
            <div class="kpi"><b>${st.right}/${st.bettors}</b><span>acertaron</span></div>
            <div class="kpi"><b>${pct(st.meanConfidence)}</b><span>seguridad media</span></div>
          </div>
          ${entry && entry.side !== null && !entry.correct && entry.confidence >= 0.5
            ? html`<p class="small soft">No estás solo: ${st.confidentWrong} ${st.confidentWrong === 1 ? 'persona apostó' : 'personas apostaron'} fuerte y falló. Es justo el concepto que vale la pena repasar.</p>`
            : null}
        </section>`
      : null}
    <p class="center small muted">Esperando la siguiente afirmación…</p>
  `;
}

/* ------------------------------------------------------------------ Resultados */

function Final({ pub, me, onConfetti, onExit }) {
  const f = me.final;
  const fired = useRef(false);
  useEffect(() => {
    if (!f || fired.current) return;
    fired.current = true;
    sfx.fanfare();
    onConfetti();
  }, [f]);

  const reviewed = useMemo(() => [...me.history].sort((a, b) => a.round - b.round), [me.history]);

  if (!f) return html`<${Notice} icon="hourglass" title="Cerrando el mercado…" text="Estamos calculando tu nota." spinner />`;

  const s = f.summary;
  const w = f.weights;
  const bias = s.confidenceBias;
  const verdict = bias === null
    ? 'No alcanzaste a apostar, así que no hay calibración que medir.'
    : bias > 0.08
      ? 'Tendiste a la sobreconfianza: apostaste como si supieras más de lo que acertaste.'
      : bias < -0.08
        ? 'Fuiste más prudente de lo necesario: sabías más de lo que apostaste.'
        : 'Tu confianza estuvo bien calibrada: apostaste en proporción a lo que sabías.';
  const showPlace = pub.podiumRevealed;

  return html`<main class="s-wrap">
    <section class="card edge-brand final-hero">
      <p class="eyebrow">Mercado cerrado</p>
      <div class="grade-ring" style=${`--g:${(f.grade / 5) * 100}`}>
        <div><b class="num">${grade(f.grade)}</b><small>Nota / 5,0</small></div>
      </div>
      <h2>${f.grade >= 4 ? '¡Sabes lo que sabes!' : f.grade >= 3 ? 'Buen mercado' : 'Hay conceptos por repasar'}</h2>
      <p class="soft small">${verdict}</p>
      <div class="formula-line" style="justify-content:center">
        <span>${dec(w.accuracy, 1)} ×</span><b>${grade(s.accuracyGrade)}</b><span>aciertos +</span><span>${dec(w.calibration, 1)} ×</span><b>${grade(s.calibrationGrade)}</b><span>calibración</span>
      </div>
    </section>

    <section class="kpis">
      <div class="kpi"><b>${s.correct}/${s.rounds}</b><span>afirmaciones acertadas</span></div>
      <div class="kpi"><b>${chips(f.net)}</b><span>patrimonio · <span class=${f.profit >= 0 ? 't-win' : 't-loss'}>${signed(f.profit)}</span></span></div>
      <div class="kpi"><b>${showPlace ? `${ordinal(f.place)} de ${f.of}` : '—'}</b><span>${showPlace ? 'puesto en la bolsa' : 'el puesto se revela en el proyector'}</span></div>
      <div class="kpi"><b>${s.bestStreak}</b><span>mejor racha de aciertos</span></div>
      <div class="kpi"><b>${s.meanConfidenceRight === null ? '—' : pct(s.meanConfidenceRight)}</b><span>seguridad cuando acertaste</span></div>
      <div class="kpi"><b>${s.meanConfidenceWrong === null ? '—' : pct(s.meanConfidenceWrong)}</b><span>seguridad cuando fallaste</span></div>
    </section>

    ${f.badges.length
      ? html`<section class="card stack">
          <h3 class="card-title"><${Icon} name="trophy" /> Insignias</h3>
          <div class="badge-row">
            ${f.badges.map((b) => html`<div key=${b} class="badge-item">
              <span class="b-icon"><${Icon} name=${BADGES[b]?.icon ?? 'star'} /></span>
              <div><b>${BADGES[b]?.label ?? b}</b><small>${BADGES[b]?.desc ?? ''}</small></div>
            </div>`)}
          </div>
        </section>`
      : null}

    <section class="card stack">
      <h3 class="card-title"><${Icon} name="gauge" /> Tu mapa de confianza</h3>
      <div class="quad-axis"><span>Apuesta baja</span><span>Apuesta alta</span></div>
      <div class="quad-grid">
        ${['doubt', 'mastery', 'prudence', 'misconception'].map((q) => html`<div key=${q} class=${`quad ${q}`}>
          <b class="num">${s.quadrants[q]}</b><strong>${QUADRANTS[q].label}</strong><span>${QUADRANTS[q].hint}</span>
        </div>`)}
      </div>
      ${s.quadrants.none ? html`<p class="tiny muted">${s.quadrants.none} ${s.quadrants.none === 1 ? 'ronda' : 'rondas'} sin apuesta.</p>` : null}
    </section>

    <section class="card stack">
      <h3 class="card-title"><${Icon} name="book" /> Repaso de tus apuestas</h3>
      <div class="history-list">
        ${reviewed.map((h) => {
          const q = quadrantOf(h);
          const tone = h.side === null ? 'none' : h.correct ? 'win' : 'loss';
          return html`<details key=${h.round} class="history-item">
            <summary>
              <span class=${`h-mark ${tone}`}><${Icon} name=${tone === 'win' ? 'check' : tone === 'loss' ? 'x' : 'minus'} /></span>
              <span class="h-text">${h.round + 1}. ${h.statement}</span>
              <span class=${`h-delta ${tone === 'win' ? 't-win' : tone === 'loss' ? 't-loss' : 'muted'}`}>${signed(h.delta)}</span>
            </summary>
            <div class="h-body">
              <div class="row wrap">
                <${TopicPill} topic=${h.topic} />
                <${TruthBadge} truth=${h.truth} />
                <span class=${`quadrant-tag ${QUADRANTS[q].tone}`}>${QUADRANTS[q].label}</span>
              </div>
              <p class="small soft"><${Rich} text=${h.statement} /></p>
              ${h.side !== null
                ? html`<p class="small">Apostaste <b>${chips(h.stake)}</b> de ${chips(h.balanceBefore)} a <b class=${h.side ? 't-true' : 't-false'}>${h.side ? 'Verdadera' : 'Falsa'}</b> (seguridad ${pct(h.confidence)}).</p>`
                : html`<p class="small muted">No apostaste en esta ronda.</p>`}
              <div class="explain"><p><b>${h.concept}. </b><${Rich} text=${h.explanation} /></p></div>
            </div>
          </details>`;
        })}
      </div>
    </section>

    <button class="btn ghost block" onClick=${onExit}><${Icon} name="logout" /> Salir</button>
    <${Footer} />
  </main>`;
}
