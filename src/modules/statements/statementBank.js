import fs from 'node:fs/promises';

export const TOPIC_IDS = [1, 2, 3, 4];
export const DIFFICULTIES = ['facil', 'media', 'dificil'];

const DEFAULT_TOPICS = [
  { id: 1, name: 'Estimación', title: 'Intervalos de confianza', ticker: 'EST' },
  { id: 2, name: 'Prueba de hipótesis', title: 'Valor p, errores y decisiones', ticker: 'HIP' },
  { id: 3, name: 'Regresión lineal', title: 'Rectas, R² y predicción', ticker: 'REG' },
  { id: 4, name: 'ANOVA', title: 'Comparar varias medias', ticker: 'ANV' },
];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Valida y normaliza un banco. Nunca lanza: devuelve errores (bloquean el guardado)
 * y advertencias (se muestran, pero el banco es usable).
 */
export function validateBank(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['El banco debe ser un objeto JSON.'], warnings };

  const topicsIn = Array.isArray(raw.topics) ? raw.topics : [];
  const topics = DEFAULT_TOPICS.map((def) => {
    const t = topicsIn.find((x) => Number(x?.id) === def.id) ?? {};
    return {
      id: def.id,
      name: str(t.name, 40) || def.name,
      title: str(t.title, 60) || def.title,
      ticker: (str(t.ticker, 4) || def.ticker).toUpperCase(),
    };
  });

  const list = Array.isArray(raw.statements) ? raw.statements : null;
  if (!list) return { ok: false, errors: ['Falta la lista "statements".'], warnings };

  const seen = new Set();
  const statements = [];
  list.forEach((s, i) => {
    const where = `Afirmación ${i + 1}${s?.id ? ` (${s.id})` : ''}`;
    if (!s || typeof s !== 'object') {
      errors.push(`${where}: no es un objeto.`);
      return;
    }
    const id = str(s.id, 24);
    if (!id) errors.push(`${where}: falta "id".`);
    else if (seen.has(id)) errors.push(`${where}: el id "${id}" está repetido.`);
    seen.add(id);
    const topic = Number(s.topic);
    if (!TOPIC_IDS.includes(topic)) errors.push(`${where}: "topic" debe ser 1, 2, 3 o 4.`);
    if (typeof s.truth !== 'boolean') errors.push(`${where}: "truth" debe ser true (verdadera) o false (falsa).`);
    const statement = str(s.statement, 400);
    if (statement.length < 10) errors.push(`${where}: el texto de la afirmación es muy corto.`);
    const explanation = str(s.explanation, 900);
    if (!explanation) errors.push(`${where}: falta la explicación.`);
    const concept = str(s.concept, 80);
    if (!concept) warnings.push(`${where}: sin "concept"; el reporte la agrupará como «Sin concepto».`);
    const misconception = str(s.misconception, 300);
    if (!misconception) warnings.push(`${where}: sin "misconception" (error de concepto que delata).`);
    statements.push({
      id,
      topic,
      truth: s.truth,
      difficulty: DIFFICULTIES.includes(s.difficulty) ? s.difficulty : 'media',
      statement,
      data: str(s.data, 200) || null,
      concept: concept || 'Sin concepto',
      explanation,
      misconception: misconception || null,
      example: s.example === true,
      active: s.active !== false,
    });
  });

  for (const t of TOPIC_IDS) {
    const active = statements.filter((s) => s.topic === t && s.active);
    if (active.length === 0) warnings.push(`El tema ${t} no tiene afirmaciones activas.`);
    const trues = active.filter((s) => s.truth).length;
    if (active.length >= 4 && (trues === 0 || trues === active.length)) {
      warnings.push(`En el tema ${t} todas las afirmaciones activas son ${trues ? 'verdaderas' : 'falsas'}; conviene mezclar.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, bank: { version: 1, topics, statements } };
}

export async function loadBankFromFile(file) {
  const text = await fs.readFile(file, 'utf8');
  const res = validateBank(JSON.parse(text));
  if (!res.ok) throw new Error(`Banco inválido (${file}):\n- ${res.errors.join('\n- ')}`);
  return res;
}

/**
 * Elige las afirmaciones de una partida: las primeras `perTopic` activas de cada tema
 * (o al azar si `random`), intercaladas por tema para que las rondas roten.
 */
export function pickStatements(bank, { perTopic = 3, random = false, rand = Math.random } = {}) {
  const byTopic = TOPIC_IDS.map((t) => {
    let pool = bank.statements.filter((s) => s.topic === t && s.active);
    if (random) {
      pool = [...pool];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    return pool.slice(0, perTopic);
  });
  const out = [];
  const max = Math.max(0, ...byTopic.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const list of byTopic) if (list[i]) out.push(list[i]);
  return out;
}
