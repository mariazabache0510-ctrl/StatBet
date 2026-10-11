import { html, useEffect, useMemo, useState } from '../lib/html.js';
import { download } from '../lib/connection.js';
import { DIFFICULTY, TOPICS } from '../lib/format.js';
import { Icon, Rich, TopicPill, TruthBadge } from '../components/ui.js';

const EMPTY = { statement: '', data: '', concept: '', explanation: '', misconception: '', truth: true, difficulty: 'media', active: true };

function nextId(bank, topic) {
  const prefix = TOPICS[topic].ticker;
  let n = bank.statements.filter((s) => s.topic === topic).length + 1;
  const ids = new Set(bank.statements.map((s) => s.id));
  while (ids.has(`${prefix}-${String(n).padStart(2, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

/** Editor del banco de afirmaciones (se guarda en el almacén y tiene prioridad sobre el archivo). */
export function BankEditor({ call, toast, modKey, locked }) {
  const [bank, setBank] = useState(null);
  const [info, setInfo] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [topic, setTopic] = useState(0);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState('');

  const load = async () => {
    const res = await call('mod:getBank');
    if (res.ok) {
      setBank(structuredClone(res.bank));
      setInfo(res.info);
      setDirty(false);
    } else toast(res.error, { kind: 'error' });
  };
  useEffect(() => {
    load();
  }, []);

  const list = useMemo(() => {
    if (!bank) return [];
    const q = query.trim().toLowerCase();
    return bank.statements
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (!topic || s.topic === topic) && (!q || `${s.id} ${s.statement} ${s.concept}`.toLowerCase().includes(q)));
  }, [bank, topic, query]);

  if (!bank) return html`<section class="card"><span class="spinner"></span> Cargando banco…</section>`;

  const update = (i, patch) => {
    setBank((b) => ({ ...b, statements: b.statements.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
    setDirty(true);
  };
  const add = () => {
    const t = topic || 1;
    const s = { ...EMPTY, id: nextId(bank, t), topic: t };
    setBank((b) => ({ ...b, statements: [...b.statements, s] }));
    setOpen(bank.statements.length);
    setDirty(true);
  };
  const remove = (i) => {
    if (!confirm('¿Eliminar esta afirmación del banco?')) return;
    setBank((b) => ({ ...b, statements: b.statements.filter((_, k) => k !== i) }));
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    setErrors('');
    const res = await call('mod:saveBank', { bank });
    setBusy(false);
    if (!res.ok) return setErrors(res.error);
    setInfo(res.info);
    setDirty(false);
    toast(res.warnings?.length ? `Banco guardado con ${res.warnings.length} advertencias.` : 'Banco guardado.', { icon: 'check' });
  };
  const reset = async () => {
    if (!confirm('¿Descartar las ediciones del panel y volver al banco original del archivo?')) return;
    const res = await call('mod:resetBank');
    if (!res.ok) return toast(res.error, { kind: 'error' });
    setBank(structuredClone(res.bank));
    setInfo(res.info);
    setDirty(false);
    toast('Banco original restaurado.', { icon: 'rotate' });
  };
  const importFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.statements)) throw new Error();
      setBank({ version: 1, topics: data.topics ?? bank.topics, statements: data.statements });
      setDirty(true);
      toast(`Se cargaron ${data.statements.length} afirmaciones. Revisa y guarda.`, { icon: 'file' });
    } catch {
      toast('El archivo no es un banco JSON válido.', { kind: 'error' });
    }
  };

  const counts = [1, 2, 3, 4].map((t) => {
    const all = bank.statements.filter((s) => s.topic === t);
    const act = all.filter((s) => s.active !== false);
    return { t, total: all.length, active: act.length, trues: act.filter((s) => s.truth).length };
  });

  return html`<div class="stack">
    <section class="card stack">
      <div class="row between wrap">
        <h3 class="card-title" style="margin:0"><${Icon} name="book" /> Banco de afirmaciones</h3>
        <span class="pill">${info?.source === 'panel' ? 'Editado desde el panel' : 'Archivo original'}</span>
      </div>
      <div class="bank-counts">
        ${counts.map((c) => html`<button key=${c.t} class=${`bank-count ${TOPICS[c.t].key} ${topic === c.t ? 'on' : ''}`} onClick=${() => setTopic(topic === c.t ? 0 : c.t)}>
          <span class="tb-name"><${Icon} name=${TOPICS[c.t].icon} size=${15} />${TOPICS[c.t].short}</span>
          <b class="num">${c.active}</b><span class="tiny muted">activas · ${c.trues} V / ${c.active - c.trues} F</span>
        </button>`)}
      </div>
      <div class="row wrap">
        <input class="input sm grow" placeholder="Buscar por texto, id o concepto" value=${query} onInput=${(e) => setQuery(e.currentTarget.value)} style="min-width:200px" />
        <button class="btn sm" onClick=${add}><${Icon} name="plus" /> Nueva</button>
      </div>
      ${locked ? html`<p class="tiny muted">La partida en curso ya tiene sus afirmaciones; los cambios aplican a la próxima partida.</p>` : null}
      ${info?.warnings?.length && !dirty ? html`<details class="warn-box"><summary>${info.warnings.length} advertencias del banco</summary><ul>${info.warnings.map((w, i) => html`<li key=${i}>${w}</li>`)}</ul></details>` : null}
    </section>

    <div class="bank-list">
      ${list.map(({ s, i }) => html`<details key=${i} class=${`bank-item ${s.active === false ? 'inactive' : ''}`} open=${open === i} onToggle=${(e) => setOpen(e.currentTarget.open ? i : open === i ? null : open)}>
        <summary>
          <${TopicPill} topic=${s.topic} compact />
          <span class="grow bank-text">${s.statement || html`<i class="muted">Nueva afirmación</i>`}</span>
          <span class=${`seq-truth ${s.truth ? 't-true' : 't-false'}`}>${s.truth ? 'V' : 'F'}</span>
        </summary>
        <div class="bank-form">
          <div class="field-grid">
            <label class="field"><span>Id</span><input class="input sm" value=${s.id} maxlength="24" onInput=${(e) => update(i, { id: e.currentTarget.value })} /></label>
            <label class="field"><span>Tema</span>
              <select class="input sm" value=${s.topic} onChange=${(e) => update(i, { topic: Number(e.currentTarget.value) })}>
                ${[1, 2, 3, 4].map((t) => html`<option key=${t} value=${t}>${TOPICS[t].short}</option>`)}
              </select>
            </label>
            <label class="field"><span>Dificultad</span>
              <select class="input sm" value=${s.difficulty} onChange=${(e) => update(i, { difficulty: e.currentTarget.value })}>
                ${Object.entries(DIFFICULTY).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
              </select>
            </label>
            <div class="field"><span>Respuesta</span>
              <div class="seg">
                <button class=${s.truth ? 'on true' : ''} onClick=${() => update(i, { truth: true })}>Verdadera</button>
                <button class=${!s.truth ? 'on false' : ''} onClick=${() => update(i, { truth: false })}>Falsa</button>
              </div>
            </div>
          </div>
          <label class="field"><span>Afirmación</span><textarea class="input" maxlength="400" value=${s.statement} onInput=${(e) => update(i, { statement: e.currentTarget.value })}></textarea></label>
          <label class="field"><span>Datos de apoyo (opcional)</span><input class="input sm" maxlength="200" value=${s.data ?? ''} onInput=${(e) => update(i, { data: e.currentTarget.value })} /></label>
          <label class="field"><span>Concepto evaluado</span><input class="input sm" maxlength="80" value=${s.concept} onInput=${(e) => update(i, { concept: e.currentTarget.value })} /></label>
          <label class="field"><span>Explicación (se muestra al revelar)</span><textarea class="input" maxlength="900" value=${s.explanation} onInput=${(e) => update(i, { explanation: e.currentTarget.value })}></textarea></label>
          <label class="field"><span>Error de concepto que delata</span><textarea class="input" maxlength="300" value=${s.misconception ?? ''} onInput=${(e) => update(i, { misconception: e.currentTarget.value })}></textarea></label>
          ${s.statement ? html`<div class="bank-preview"><span class="tiny muted">Vista previa</span><p><${Rich} text=${s.statement} /></p><${TruthBadge} truth=${s.truth} /></div>` : null}
          <div class="row between wrap">
            <label class="check"><input type="checkbox" checked=${s.active !== false} onChange=${(e) => update(i, { active: e.currentTarget.checked })} /> Activa (puede salir en las partidas)</label>
            <button class="btn sm danger" onClick=${() => remove(i)}><${Icon} name="trash" /> Eliminar</button>
          </div>
        </div>
      </details>`)}
      ${list.length === 0 ? html`<p class="muted center">No hay afirmaciones con ese filtro.</p>` : null}
    </div>

    ${errors ? html`<pre class="error-box">${errors}</pre>` : null}
    <div class="bank-actions">
      <button class="btn primary" disabled=${!dirty || busy} onClick=${save}><${Icon} name="check" /> ${busy ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}</button>
      ${dirty ? html`<button class="btn ghost" onClick=${load}>Descartar</button>` : null}
      <button class="btn ghost" onClick=${() => download('/api/bank/export', modKey, 'statbet-afirmaciones.json').catch((e) => toast(e.message, { kind: 'error' }))}><${Icon} name="download" /> Exportar JSON</button>
      <label class="btn ghost"><${Icon} name="file" /> Importar JSON<input type="file" accept="application/json,.json" class="sr-only" onChange=${importFile} /></label>
      ${info?.source === 'panel' ? html`<button class="btn danger" onClick=${reset}><${Icon} name="rotate" /> Restaurar original</button>` : null}
    </div>
  </div>`;
}
