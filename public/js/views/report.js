import { html, useEffect, useState } from '../lib/html.js';
import { api } from '../lib/connection.js';
import { BADGES, QUADRANTS, TOPICS, chips, dec, grade, pct, signed } from '../lib/format.js';
import { Icon, Logo, Rich } from '../components/ui.js';
import { CalibrationChart, RiskMeter, TopicBars } from '../components/charts.js';

export function ReportApp() {
  const code = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
  const [key, setKey] = useState(() => localStorage.getItem('statbet:modkey') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!code || !key) return;
    api(`/api/rooms/${code}/export/informe.json`, { key }).then((res) => {
      if (res.ok) setData(res);
      else if (res.status === 401) {
        localStorage.removeItem('statbet:modkey');
        setKey('');
        setError('La clave guardada ya no es válida.');
      } else setError(res.error || 'No se pudo cargar el informe.');
    });
  }, [code, key]);

  if (!code) return html`<div class="theme notice-screen"><div class="card notice-card"><h2>Falta el código de la sala</h2><p class="soft">Abre el informe desde el panel del moderador.</p></div></div>`;
  if (!key) {
    return html`<div class="theme notice-screen">
      <form class="card notice-card" onSubmit=${(e) => { e.preventDefault(); localStorage.setItem('statbet:modkey', input.trim()); setError(''); setKey(input.trim()); }}>
        <${Logo} size=${40} sub="Informe" />
        ${error ? html`<p class="error-text">${error}</p>` : null}
        <input class="input" type="password" placeholder="Clave de moderador" value=${input} onInput=${(e) => setInput(e.currentTarget.value)} />
        <button class="btn primary block">Ver informe</button>
      </form>
    </div>`;
  }
  if (error) return html`<div class="theme notice-screen"><div class="card notice-card"><span class="notice-icon"><${Icon} name="alert" /></span><h2>${error}</h2></div></div>`;
  if (!data) return html`<div class="theme notice-screen"><span class="spinner"></span></div>`;
  return html`<${Report} data=${data} />`;
}

function Report({ data }) {
  const { room, results: res, partial } = data;
  const ins = res.insights;
  const a = res.averages;
  const t = ins.totals;
  const quadTotal = Object.values(ins.quadrants).reduce((s, n) => s + n, 0) || 1;
  const date = new Date(res.generatedAt).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
  const topicName = (id) => res.topics.find((x) => x.id === id)?.name ?? TOPICS[id]?.short;

  return html`<div class="report">
    <div class="report-bar no-print">
      <span class="small">Vista previa del informe · usa «Imprimir» y elige «Guardar como PDF».</span>
      <button class="btn primary sm" onClick=${() => window.print()}><${Icon} name="download" /> Imprimir / PDF</button>
    </div>
    <article class="report-page">
      <header class="report-head">
        <${Logo} size=${42} sub="Informe de la partida" />
        <div class="report-meta">
          <b>${room.title}</b>
          <span>Sala ${room.code} · ${date}</span>
          ${partial ? html`<span class="report-flag">Parcial: la partida no ha terminado</span>` : null}
        </div>
      </header>

      <section class="report-kpis">
        <div><b>${res.standings.length}</b><span>estudiantes</span></div>
        <div><b>${res.roundsPlayed}/${res.totalRounds}</b><span>afirmaciones jugadas</span></div>
        <div><b>${grade(a.grade, 2)}</b><span>nota promedio (0–5)</span></div>
        <div><b>${pct(a.accuracy)}</b><span>acierto promedio</span></div>
        <div><b>${grade(a.calibrationGrade, 2)}</b><span>calibración promedio</span></div>
        <div><b>${t.bias === null ? '—' : `${signed(Math.round(t.bias * 100))} pts`}</b><span>${t.bias > 0.05 ? 'sobreconfianza del curso' : t.bias < -0.05 ? 'prudencia del curso' : 'sesgo de confianza'}</span></div>
      </section>

      <section class="report-section">
        <h2>1. Conceptos críticos: donde el curso apostó con más seguridad y falló</h2>
        <p class="report-note">Ordenados por <b>índice de riesgo</b>: la seguridad promedio perdida por apuesta (cuenta 0 para quien acertó). Un índice alto indica un error de concepto extendido, no una simple duda.</p>
        ${ins.critical.length === 0
          ? html`<p>No hubo errores con alta seguridad en esta partida.</p>`
          : html`<ol class="critical-list">
              ${ins.critical.slice(0, 6).map((c) => html`<li key=${c.index}>
                <div class="cl-head">
                  <span class=${`report-topic ${TOPICS[c.topic]?.key}`}>${topicName(c.topic)}</span>
                  <b>${c.concept}</b>
                  <span class="cl-risk"><${RiskMeter} value=${c.riskIndex} /> ${pct(c.riskIndex)}</span>
                </div>
                <p class="cl-statement">«<${Rich} text=${c.statement} />» <b class=${c.truth ? 'r-true' : 'r-false'}>${c.truth ? 'Verdadera' : 'Falsa'}</b></p>
                <p class="cl-stats">Acierto ${pct(c.accuracy)} · ${c.confidentWrong} de ${c.bettors} fallaron con seguridad ≥ 50 % · seguridad media de quienes fallaron ${c.meanConfidenceWrong === null ? '—' : pct(c.meanConfidenceWrong)}</p>
                ${c.misconception ? html`<p class="cl-misc"><b>Error de concepto:</b> ${c.misconception}</p>` : null}
                <p class="cl-exp"><b>Explicación:</b> <${Rich} text=${c.explanation} /></p>
              </li>`)}
            </ol>`}
      </section>

      <section class="report-section report-two">
        <div>
          <h2>2. Acierto vs. seguridad por tema</h2>
          <${TopicBars} byTopic=${ins.byTopic} />
          <table class="report-table" style="margin-top:12px">
            <thead><tr><th>Tema</th><th class="r">Apuestas</th><th class="r">Acierto</th><th class="r">Seguridad</th><th class="r">Sesgo</th><th class="r">Seguros y errados</th></tr></thead>
            <tbody>${ins.byTopic.map((b) => html`<tr key=${b.topic}>
              <td>${b.name}</td><td class="r">${b.bets}</td><td class="r">${pct(b.accuracy)}</td><td class="r">${pct(b.meanProbability)}</td>
              <td class="r">${b.bias === null ? '—' : `${signed(Math.round(b.bias * 100))} pts`}</td><td class="r">${b.confidentWrong}</td>
            </tr>`)}</tbody>
          </table>
        </div>
        <div>
          <h2>3. Curva de calibración del curso</h2>
          <${CalibrationChart} curve=${ins.curve} height=${250} light />
          <div class="quad-bars">
            ${['mastery', 'doubt', 'prudence', 'misconception'].map((q) => html`<div key=${q} class=${`qb ${q}`}>
              <span>${QUADRANTS[q].label}</span>
              <span class="qb-track"><span style=${`width:${(ins.quadrants[q] / quadTotal) * 100}%`}></span></span>
              <b>${pct(ins.quadrants[q] / quadTotal)}</b>
            </div>`)}
          </div>
        </div>
      </section>

      <section class="report-section">
        <h2>4. Notas de los estudiantes</h2>
        <p class="report-note">Nota = ${dec(res.weights.accuracy, 2)} × nota de aciertos + ${dec(res.weights.calibration, 2)} × nota de calibración (regla de Brier sobre la seguridad declarada). El patrimonio solo define el ranking del juego; no entra en la nota.</p>
        <table class="report-table">
          <thead><tr><th>#</th><th>Estudiante</th><th class="r">Aciertos</th><th class="r">N. aciertos</th><th class="r">N. calibración</th><th class="r">Nota</th><th class="r">Dominio</th><th class="r">Duda</th><th class="r">Prudencia</th><th class="r">Err. concepto</th><th class="r">Patrimonio</th><th>Insignias</th></tr></thead>
          <tbody>${[...res.standings].sort((x, y) => x.name.localeCompare(y.name, 'es')).map((s, i) => html`<tr key=${s.id}>
            <td>${i + 1}</td><td>${s.name}</td><td class="r">${s.summary.correct}/${s.summary.rounds}</td>
            <td class="r">${grade(s.summary.accuracyGrade)}</td><td class="r">${grade(s.summary.calibrationGrade)}</td><td class="r"><b>${grade(s.grade)}</b></td>
            <td class="r">${s.summary.quadrants.mastery}</td><td class="r">${s.summary.quadrants.doubt}</td><td class="r">${s.summary.quadrants.prudence}</td><td class="r">${s.summary.quadrants.misconception}</td>
            <td class="r">${chips(s.net)}</td><td>${s.badges.map((b) => BADGES[b]?.label).join(', ')}</td>
          </tr>`)}</tbody>
        </table>
      </section>

      <section class="report-section">
        <h2>5. Detalle por afirmación</h2>
        <table class="report-table">
          <thead><tr><th>#</th><th>Tema</th><th>Afirmación</th><th>Resp.</th><th class="r">Apostaron</th><th class="r">V / F</th><th class="r">Acierto</th><th class="r">Seguridad</th><th class="r">Riesgo</th></tr></thead>
          <tbody>${ins.perStatement.map((s) => html`<tr key=${s.index}>
            <td>${s.index + 1}</td><td>${TOPICS[s.topic]?.ticker}</td><td class="wrap-cell"><${Rich} text=${s.statement} /></td><td>${s.truth ? 'V' : 'F'}</td>
            <td class="r">${s.bettors}/${s.eligible}</td><td class="r">${s.onTrue} / ${s.onFalse}</td><td class="r">${pct(s.accuracy)}</td><td class="r">${pct(s.meanConfidence)}</td><td class="r">${pct(s.riskIndex)}</td>
          </tr>`)}</tbody>
        </table>
      </section>

      <footer class="report-foot">StatBet · La Bolsa de Hipótesis · Análisis Cuantitativo de Datos</footer>
    </article>
  </div>`;
}
