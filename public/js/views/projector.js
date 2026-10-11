import { html, useEffect, useRef, useState } from '../lib/html.js';
import { useConnection, useKeepAlive } from '../lib/connection.js';
import { roundRemaining, useTick } from '../lib/clock.js';
import { isMuted, setMuted, sfx, unlockAudio } from '../lib/sound.js';
import { BADGES, DIFFICULTY, TOPICS, chips, ordinal, pct, signed } from '../lib/format.js';
import {
  Avatar, ConfidenceHistogram, Confetti, ConnectionBanner, Icon, Logo, Rich, RingTimer,
  SoundToggle, SplitBar, TopicPill, TruthBadge,
} from '../components/ui.js';
import { CalibrationChart, RiskMeter, TopicBars } from '../components/charts.js';
import { createMarketScene } from '../components/market3d.js';

export function ProjectorApp() {
  const code = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
  if (!code) return html`<${PickRoom} />`;
  return html`<${Stage} code=${code} />`;
}

function PickRoom() {
  const [code, setCode] = useState('');
  const go = (e) => {
    e.preventDefault();
    if (code.trim()) location.search = `?sala=${encodeURIComponent(code.trim().toUpperCase())}`;
  };
  return html`<div class="theme notice-screen">
    <form class="card notice-card" onSubmit=${go}>
      <${Logo} size=${44} sub="Proyector" />
      <p class="soft">Escribe el código de la sala para proyectar la bolsa.</p>
      <input class="input code" value=${code} maxlength="6" placeholder="ABC123" onInput=${(e) => setCode(e.currentTarget.value.toUpperCase())} />
      <button class="btn primary block"><${Icon} name="monitor" /> Proyectar</button>
    </form>
  </div>`;
}

const perBettor = (players) => (players <= 30 ? 3 : 2);

function Stage({ code }) {
  const [muted, setMute] = useState(isMuted());
  const [confetti, setConfetti] = useState(0);
  const [pulse, setPulse] = useState(0);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const syncRef = useRef({ key: null, revealed: false });
  const [has3d, setHas3d] = useState(true);
  useKeepAlive(true);

  const conn = useConnection({ role: 'projector', code }, {
    onEvent: (ev) => {
      if (ev.type === 'bet') {
        sfx.chip();
        setPulse((n) => n + 1);
      } else if (ev.type === 'opened') sfx.open();
      else if (ev.type === 'closed') sfx.close();
      else if (ev.type === 'revealed') sfx.reveal();
      else if (ev.type === 'podium') {
        sfx.fanfare();
        setTimeout(() => setConfetti((n) => n + 1), 3200);
      }
    },
  });
  const pub = conn.public;

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const scene = createMarketScene(canvasRef.current);
    sceneRef.current = scene;
    setHas3d(!!scene);
    return () => scene?.dispose();
  }, []);

  // Sincroniza la mesa 3D con el estado público (idempotente: sirve también al recargar).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !pub) return;
    const s = syncRef.current;
    const first = s.key === null;
    if (pub.phase === 'lobby') {
      if (s.key !== 'lobby') {
        scene.clear({ animate: !first });
        s.key = 'lobby';
      }
      scene.setMode('lobby');
      scene.setPot(pub.players, { colors: ['pink', 'cyan'], instant: first });
      return;
    }
    if (pub.phase === 'finished') {
      if (pub.podiumRevealed) {
        if (s.key !== 'podium') {
          s.key = 'podium';
          scene.setMode('podium');
          scene.setPodium(pub.final?.podium ?? []);
        }
      } else if (s.key !== 'finished') {
        s.key = 'finished';
        scene.setMode('finished');
      }
      return;
    }
    const r = pub.round;
    if (!r) return;
    const key = `r${r.index}`;
    let fresh = first;
    if (s.key !== key) {
      if (!first) scene.clear();
      s.key = key;
      s.revealed = false;
      fresh = first || r.status === 'revealed';
    }
    const per = perBettor(pub.players);
    if (r.status === 'revealed' && r.reveal?.stats) {
      scene.setMode('revealed');
      if (!s.revealed) {
        s.revealed = true;
        const st = r.reveal.stats;
        scene.setPot(st.bettors * per, { instant: fresh });
        scene.reveal({ truth: r.reveal.truth, onTrue: st.onTrue, onFalse: st.onFalse, instant: fresh });
      }
    } else {
      scene.setMode(r.status === 'closed' ? 'closed' : 'betting');
      scene.setPot(r.bettors * per, { instant: fresh });
    }
  }, [pub]);

  const toggleMute = () => {
    unlockAudio();
    setMuted(!muted);
    setMute(!muted);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  let content = null;
  if (conn.fatal) {
    content = html`<div class="stage-center"><div class="card notice-card"><span class="notice-icon"><${Icon} name="alert" /></span><h2>${conn.fatal.message}</h2><p class="soft">Revisa el código de la sala en el panel del moderador.</p></div></div>`;
  } else if (!pub) {
    content = html`<div class="stage-center"><div class="card notice-card"><span class="notice-icon"><span class="spinner" style="width:30px;height:30px"></span></span><h2>Conectando con la sala ${code}…</h2></div></div>`;
  } else if (pub.phase === 'lobby') {
    content = html`<${LobbyStage} pub=${pub} />`;
  } else if (pub.phase === 'finished') {
    content = pub.podiumRevealed ? html`<${PodiumStage} pub=${pub} scene=${sceneRef.current} />` : html`<${InsightsStage} pub=${pub} />`;
  } else {
    content = html`<${MarketStage} pub=${pub} scene=${sceneRef.current} pulse=${pulse} />`;
  }

  return html`<div class=${`stage ${has3d ? '' : 'no3d'}`}>
    <div class="stage-canvas"><canvas ref=${canvasRef}></canvas></div>
    <div class="stage-ui">
      <header class="stage-top">
        <div class="row" style="gap:16px">
          <${Logo} size=${40} />
          ${pub ? html`<span class="stage-title">${pub.title}</span>` : null}
        </div>
        ${pub && pub.totalRounds ? html`<${RoundTrack} pub=${pub} />` : html`<span></span>`}
        <div class="row stage-tools">
          ${pub && pub.phase !== 'lobby'
            ? html`<span class="join-chip"><${Icon} name="link" size=${16} /> Código <b>${pub.code}</b></span>`
            : null}
          ${pub ? html`<span class="pill"><${Icon} name="users" /> ${pub.online}/${pub.players}</span>` : null}
          <${SoundToggle} muted=${muted} onToggle=${toggleMute} />
          <button class="icon-btn" onClick=${fullscreen} aria-label="Pantalla completa" title="Pantalla completa"><${Icon} name="expand" size=${20} /></button>
        </div>
      </header>
      <main class="stage-main">${content}</main>
      ${pub && (pub.phase === 'running' || pub.phase === 'paused') && pub.leaderboard?.length ? html`<${Ticker} board=${pub.leaderboard} start=${pub.config.startChips} />` : null}
    </div>
    ${pub?.phase === 'paused'
      ? html`<div class="stage-pause"><div class="pause-card"><span class="pause-icon"><${Icon} name="pause" /></span><h2>Mercado en pausa</h2><p class="soft">${pub.autoPaused ? 'El servidor se reinició; la partida está a salvo.' : 'El reloj está detenido.'}</p></div></div>`
      : null}
    <${ConnectionBanner} status=${conn.status} />
    ${confetti ? html`<${Confetti} fire=${confetti} />` : null}
  </div>`;
}

function RoundTrack({ pub }) {
  const past = new Map(pub.past.map((p) => [p.index, p]));
  const current = pub.round?.index ?? -1;
  return html`<div class="round-track" aria-label="Avance de la partida">
    ${Array.from({ length: pub.totalRounds }, (_, i) => {
      const p = past.get(i);
      const isCurrent = i === current && pub.phase !== 'finished';
      const topic = p?.topic ?? (isCurrent ? pub.round.statement.topic : null);
      const meta = topic ? TOPICS[topic] : null;
      return html`<span key=${i} class=${`rt-cell ${meta ? meta.key : ''} ${p ? 'done' : ''} ${isCurrent ? 'current' : ''}`} title=${p ? `${i + 1}: ${pct(p.accuracy)} acertó` : `${i + 1}`}>
        <b>${i + 1}</b>
        ${p && p.accuracy !== null ? html`<i class="rt-acc" style=${`--acc:${Math.round(p.accuracy * 100)}%`}></i>` : null}
      </span>`;
    })}
  </div>`;
}

/* ------------------------------------------------------------------ Sala de espera */

function LobbyStage({ pub }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    fetch(`/api/rooms/${pub.code}/join-url`).then((r) => r.json()).then((d) => d.ok && setUrl(d.url)).catch(() => {});
  }, [pub.code]);
  const shown = url.replace(/^https?:\/\//, '').replace(/\?sala=.*/, '');
  return html`<div class="lobby-stage">
    <section class="lobby-left">
      <p class="eyebrow">Análisis Cuantitativo de Datos</p>
      <h1 class="lobby-title">La Bolsa de <span class="grad-text">Hipótesis</span></h1>
      <p class="lobby-sub">Cada inversor empieza con <b>${pub.config.startChips} fichas</b>. Apuesta a Verdadero o Falso según tu seguridad: la nota premia <b>saber lo que sabes</b>.</p>
      <div class="topic-strip" style="justify-content:flex-start">
        ${(pub.topics.length ? pub.topics : Object.keys(TOPICS).map((id) => ({ id: Number(id) }))).map((t) => html`<${TopicPill} key=${t.id} topic=${t.id} name=${t.name} />`)}
      </div>
      <div class="lobby-qr card edge-brand">
        <img src=${`/api/rooms/${pub.code}/qr.svg`} alt="Código QR para entrar a la sala" />
        <div class="stack" style="gap:6px">
          <span class="eyebrow">Entra desde tu celular</span>
          <span class="lobby-code">${pub.code}</span>
          ${shown ? html`<span class="lobby-url">${shown}</span>` : null}
        </div>
      </div>
    </section>
    <section class="lobby-right card">
      <div class="row between">
        <h3 class="card-title" style="margin:0"><${Icon} name="users" /> Inversores</h3>
        <span class="lobby-count num">${pub.players}</span>
      </div>
      ${pub.roster.length === 0
        ? html`<p class="soft">Esperando a los primeros inversores… cada uno deja caer su ficha en la mesa.</p>`
        : html`<div class="roster">
            ${pub.roster.map((p) => html`<span key=${p.id} class=${`roster-item ${p.online ? '' : 'off'}`}><${Avatar} id=${p.id} name=${p.name} size=${30} online=${p.online} /><span>${p.name}</span></span>`)}
          </div>`}
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ Mercado */

function MarketStage({ pub, scene, pulse }) {
  const r = pub.round;
  useTick(250, r?.status === 'betting' && pub.phase === 'running');
  if (!r) return null;
  const s = r.statement;
  const remaining = pub.phase === 'paused' ? Math.max(0, r.remainingMs ?? 0) : roundRemaining(r);
  const totalMs = Math.max(pub.config.betSeconds * 1000, remaining);
  const revealed = r.status === 'revealed' && r.reveal;
  return html`<div class=${`market-stage ${revealed ? 'is-revealed' : ''}`}>
    <section data-anchor-bound="top" class=${`stage-statement card ${TOPICS[s.topic]?.key ?? ''} ${revealed ? (r.reveal.truth ? 'edge-cyan' : 'edge-pink') : 'edge-brand'}`}>
      <div class="row between wrap">
        <div class="row wrap" style="gap:8px">
          <${TopicPill} topic=${s.topic} />
          <span class="pill">Afirmación ${r.index + 1} de ${pub.totalRounds}</span>
          ${s.difficulty ? html`<span class="pill">${DIFFICULTY[s.difficulty] ?? s.difficulty}</span>` : null}
        </div>
        ${revealed ? html`<${TruthBadge} truth=${r.reveal.truth} big />` : null}
      </div>
      <p class="stage-statement-text"><${Rich} text=${s.statement} /></p>
      ${s.data ? html`<p class="data-box"><${Icon} name="info" /><${Rich} text=${s.data} /></p>` : null}
    </section>

    ${revealed
      ? html`<${RevealPanels} r=${r} scene=${scene} />`
      : html`<div class="market-side left">
            <div class="card stat-card">
              <span class="eyebrow">Ya apostaron</span>
              <div class="big-count"><b class="num">${r.bettors}</b><span>/ ${r.eligible}</span></div>
              <div class="mini-progress"><span style=${`width:${r.eligible ? (r.bettors / r.eligible) * 100 : 0}%`}></span></div>
              <div class=${`pot-line ${pulse ? 'bump' : ''}`} key=${pulse}><${Icon} name="coins" /> En la bolsa <b class="num">${chips(r.pot)}</b> fichas</div>
              <p class="tiny muted">El reparto Verdadero / Falso se mantiene en secreto hasta revelar.</p>
            </div>
          </div>
          <div class="market-side right">
            ${r.status === 'betting'
              ? html`<div class="card timer-card"><${RingTimer} ms=${remaining} totalMs=${totalMs} size=${150} paused=${pub.phase === 'paused'} /><span class="eyebrow">para apostar</span></div>`
              : html`<div class="card timer-card closed"><span class="lock-badge"><${Icon} name="lock" size=${40} /></span><h3>Apuestas cerradas</h3><p class="soft small">¿Verdadera o falsa? La respuesta está por revelarse…</p></div>`}
          </div>`}
  </div>`;
}

function Anchored({ scene, where, children, cls = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!scene || !ref.current) return undefined;
    const el = ref.current;
    scene.anchor(el, where);
    return () => scene.unanchor(el);
  }, [scene, where]);
  return html`<div ref=${ref} class=${`anchor ${scene ? '' : 'static'} ${cls}`}>${children}</div>`;
}

function RevealPanels({ r, scene }) {
  const rv = r.reveal;
  const st = rv.stats;
  return html`
    <div class="anchors">
      <${Anchored} scene=${scene} where="true" cls=${`zone-tag true ${rv.truth ? 'win' : 'lose'}`}>
        <span class="zt-side">Verdadera</span>
        <b class="num">${st.onTrue}</b><span>${st.onTrue === 1 ? 'inversor' : 'inversores'} · ${chips(st.chipsTrue)} fichas</span>
        ${rv.truth ? html`<span class="zt-flag">Gana ×2</span>` : null}
      </${Anchored}>
      <${Anchored} scene=${scene} where="false" cls=${`zone-tag false ${rv.truth ? 'lose' : 'win'}`}>
        <span class="zt-side">Falsa</span>
        <b class="num">${st.onFalse}</b><span>${st.onFalse === 1 ? 'inversor' : 'inversores'} · ${chips(st.chipsFalse)} fichas</span>
        ${!rv.truth ? html`<span class="zt-flag">Gana ×2</span>` : null}
      </${Anchored}>
    </div>
    <div class="market-side left">
      <div class="card stat-card" data-anchor-bound="left">
        <span class="eyebrow">Así apostó el salón</span>
        <${SplitBar} a=${st.onTrue} b=${st.onFalse} labelA="Verdadera" labelB="Falsa" highlight=${rv.truth} />
        <div class="reveal-kpis">
          <div><b class="num">${st.right}/${st.bettors}</b><span>acertaron</span></div>
          <div><b class="num">${pct(st.meanConfidence)}</b><span>seguridad media</span></div>
          <div class=${st.confidentWrong ? 'alert' : ''}><b class="num">${st.confidentWrong}</b><span>fallaron muy seguros</span></div>
        </div>
        <div>
          <span class="tiny muted">Seguridad de cada apuesta (verde acertó, coral falló)</span>
          <${ConfidenceHistogram} histogram=${st.histogram} />
        </div>
      </div>
    </div>
    <div class="market-side right">
      <div class="card explain-card" data-anchor-bound="right">
        <h3 class="card-title"><${Icon} name="bulb" /> ${rv.concept}</h3>
        <p class="explain-text"><${Rich} text=${rv.explanation} /></p>
        ${rv.misconception ? html`<div class="explain misc"><div class="row"><${Icon} name="alert" /><b>Error frecuente</b></div><p><${Rich} text=${rv.misconception} /></p></div>` : null}
        ${rv.winners?.length
          ? html`<div class="winners"><span class="eyebrow">Mejores jugadas</span>
              ${rv.winners.map((w) => html`<span key=${w.playerId} class="winner"><${Avatar} id=${w.playerId} name=${w.name} size=${26} /><span>${w.name}</span><b class="t-win num">${signed(w.delta)}</b></span>`)}
            </div>`
          : null}
      </div>
    </div>
  `;
}

function Ticker({ board, start }) {
  const items = board.map((p) => html`<span class="tk-item" key=${p.id}>
    <b>${ordinal(p.place)}</b> ${p.name} <span class="num">${chips(p.net)}</span>
    <span class=${p.net - start >= 0 ? 't-win' : 't-loss'}><${Icon} name=${p.net - start >= 0 ? 'caretUp' : 'caretDown'} size=${12} />${chips(Math.abs(p.net - start))}</span>
  </span>`);
  return html`<footer class="ticker" aria-label="Ranking por patrimonio">
    <span class="tk-label"><${Icon} name="trendUp" size=${16} /> BOLSA</span>
    <div class="tk-viewport"><div class="tk-track">${items}${items}</div></div>
  </footer>`;
}

/* ------------------------------------------------------------------ Cierre */

function InsightsStage({ pub }) {
  const f = pub.final;
  if (!f) return null;
  const t = f.totals;
  return html`<div class="insights-stage">
    <header class="insights-head">
      <p class="eyebrow">Mercado cerrado · ${f.roundsPlayed} afirmaciones</p>
      <h1>¿El salón <span class="grad-text">sabe lo que sabe</span>?</h1>
      <div class="row wrap" style="justify-content:center;gap:10px">
        <span class="pill cyanish">Acierto ${pct(t.accuracy)}</span>
        <span class="pill pinkish">Seguridad declarada ${pct(t.meanProbability)}</span>
        <span class=${`pill ${t.bias > 0.05 ? 'warn' : ''}`}>${t.bias === null ? '—' : t.bias > 0.05 ? 'Sobreconfianza' : t.bias < -0.05 ? 'Prudencia' : 'Bien calibrado'}</span>
      </div>
    </header>
    <section class="card insights-critical">
      <h3 class="card-title"><${Icon} name="alert" /> Donde apostamos seguros y fallamos</h3>
      ${f.critical.length === 0
        ? html`<p class="soft">Nadie falló con alta seguridad. ¡Excelente calibración!</p>`
        : f.critical.map((c, i) => html`<article key=${c.index} class="critical-item">
            <span class="ci-rank">${i + 1}</span>
            <div class="stack" style="gap:6px">
              <div class="row wrap" style="gap:8px"><${TopicPill} topic=${c.topic} /><${TruthBadge} truth=${c.truth} /></div>
              <b class="ci-concept">${c.concept}</b>
              <p class="small soft ci-text">«<${Rich} text=${c.statement} />»</p>
              <div class="row small"><${RiskMeter} value=${c.riskIndex} /><span>${c.confidentWrong} de ${c.bettors} fallaron muy seguros</span></div>
            </div>
          </article>`)}
    </section>
    <section class="card">
      <h3 class="card-title"><${Icon} name="bars" /> Acierto por tema</h3>
      <${TopicBars} byTopic=${f.byTopic} />
      <p class="tiny muted" style="margin-top:8px">La barra es el acierto; la marca blanca, la seguridad promedio con la que se apostó.</p>
    </section>
    <section class="card">
      <h3 class="card-title"><${Icon} name="gauge" /> Curva de calibración</h3>
      <${CalibrationChart} curve=${f.curve} height=${250} />
    </section>
  </div>`;
}

function PodiumStage({ pub, scene }) {
  const f = pub.final;
  if (!f) return null;
  const [p1, p2, p3, ...rest] = f.podium;
  const tag = (p, where, place) => (p
    ? html`<${Anchored} scene=${scene} where=${where} cls=${`podium-tag place-${place}`}>
        <span class="pt-place">${ordinal(place)}</span>
        <${Avatar} id=${p.id} name=${p.name} size=${place === 1 ? 54 : 44} />
        <b class="pt-name">${p.name}</b>
        <span class="pt-net num">${chips(p.net)} fichas</span>
        ${p.badges?.length ? html`<span class="pt-badges">${p.badges.slice(0, 3).map((b) => html`<span key=${b} title=${BADGES[b]?.label}><${Icon} name=${BADGES[b]?.icon ?? 'star'} size=${16} /></span>`)}</span>` : null}
      </${Anchored}>`
    : null);
  return html`<div class="podium-stage">
    <h1 class="podium-title" data-anchor-bound="top">Lobos de la <span class="grad-text">Bolsa</span></h1>
    <div class="anchors podium-anchors">
      ${tag(p2, 'p2', 2)}${tag(p1, 'p1', 1)}${tag(p3, 'p3', 3)}
    </div>
    <div class="podium-foot">
      ${f.oracles.length
        ? html`<div class="card oracle-card edge-cyan">
            <span class="b-icon"><${Icon} name="eye" size=${26} /></span>
            <div><span class="eyebrow">Oráculo del mercado · mejor calibración</span><b>${f.oracles.join(' · ')}</b></div>
          </div>`
        : null}
      ${rest.length
        ? html`<div class="card rest-card">${rest.map((p) => html`<span key=${p.id} class="rest-item"><b>${ordinal(p.place)}</b><${Avatar} id=${p.id} name=${p.name} size=${28} />${p.name}<span class="num muted">${chips(p.net)}</span></span>`)}</div>`
        : null}
    </div>
  </div>`;
}
