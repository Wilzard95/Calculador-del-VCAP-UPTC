// El cálculo se conserva sin redondeos intermedios. Solo el VCAP final se redondea al peso.
export function validAnswer(model, answer) {
  if (!answer || !Number.isInteger(answer.option) || answer.option < 1 || answer.option > 5) return false;
  const range = model.ranges[answer.option - 1];
  return typeof answer.score === 'number' && Number.isFinite(answer.score)
    && answer.score >= range.min && answer.score <= range.max
    && Math.abs(answer.score * 10 - Math.round(answer.score * 10)) < 1e-7;
}

export function adjustment(score) {
  if (!Number.isFinite(score) || score < 1 || score > 5) throw new RangeError('El puntaje debe estar entre 1 y 5.');
  return score <= 3 ? 0.8 + 0.1 * (score - 1) : 1 + 0.75 * (score - 3);
}

export function calculate(model, state) {
  const base = model.levels.find(level => level.id === state.level)?.bases[state.modality] ?? null;
  let weightedUnits = 0;
  const groups = model.groups.map(group => {
    const answers = group.questions.map(q => state.answers?.[q.id]).filter(a => validAnswer(model, a));
    const complete = answers.length === group.questions.length;
    const scoreTenths = answers.reduce((sum, a) => sum + Math.round(a.score * 10), 0);
    // Pesos por pregunta expresados en milésimas: 40, 40, 75 y 60.
    const units = scoreTenths * (group.weight * 10 / group.questions.length);
    weightedUnits += units;
    return { id: group.id, answered: answers.length, total: group.questions.length,
      average: complete ? scoreTenths / (10 * group.questions.length) : null,
      contribution: complete ? units / 10000 : null };
  });
  const answered = groups.reduce((sum, group) => sum + group.answered, 0);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const complete = answered === total && base !== null;
  if (!complete) return { base, groups, answered, total, complete, score: null, factor: null, value: null, change: null };
  const score = weightedUnits / 10000;
  // Fracciones equivalentes a g(x), evitando redondear x o g(x) antes del producto.
  const numerator = weightedUnits <= 30000 ? 70000 + weightedUnits : 3 * weightedUnits - 50000;
  const denominator = weightedUnits <= 30000 ? 100000 : 40000;
  const factor = numerator / denominator;
  return { base, groups, answered, total, complete, score, factor,
    value: Math.round(base * numerator / denominator), change: (factor - 1) * 100 };
}

export function cleanState(model, candidate = {}) {
  const state = {
    version: model.version,
    name: typeof candidate.name === 'string' ? candidate.name.slice(0, 180) : '',
    level: model.levels.some(l => l.id === candidate.level) ? candidate.level : 'especializacion',
    modality: model.modalities.some(m => m.id === candidate.modality) ? candidate.modality : 'presencial',
    procedure: candidate.procedure === 'nuevo' ? 'nuevo' : 'existente',
    answers: {},
  };
  for (const question of model.groups.flatMap(g => g.questions)) {
    const answer = candidate.answers?.[question.id];
    if (validAnswer(model, answer)) state.answers[question.id] = {
      option: answer.option, score: answer.score,
      evidence: typeof answer.evidence === 'string' ? answer.evidence.slice(0, 1500) : '',
    };
  }
  return state;
}
