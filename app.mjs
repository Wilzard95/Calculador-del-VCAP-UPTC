import { calculate, cleanState, validAnswer } from './engine.mjs';

const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
const number = (value, digits = 2) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STORAGE_KEY = 'uptc-vcap-evaluacion-v1';
let model, state, active = 0, toastTimer, pendingAction = null;

async function initialize() {
  try {
    const response = await fetch(new URL('./data/modelo.json', import.meta.url));
    if (!response.ok) throw new Error('No se encontró el modelo.');
    model = await response.json();
    let candidate = {};
    try { candidate = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { /* Un borrador dañado no impide iniciar una nueva evaluación. */ }
    state = cleanState(model, candidate);
    $('#level').innerHTML = model.levels.map(l => `<option value="${l.id}">${escape(l.label)}</option>`).join('');
    $('#modality').innerHTML = model.modalities.map(m => `<option value="${m.id}">${escape(m.label)}</option>`).join('');
    const tabLabels = ['Programa', 'Mercado', 'Estudiantes', 'Profesores'];
    $('#group-tabs').innerHTML = model.groups.map((g, i) => `<button class="group-tab" id="tab-${g.id}" role="tab" aria-controls="panel-${g.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-group="${i}"><span class="tab-code">${g.id}</span><span class="tab-copy"><b>${tabLabels[i]}</b><small id="tab-count-${g.id}">0 / ${g.questions.length}</small></span></button>`).join('');
    $('#question-panels').innerHTML = model.groups.map((group, i) => `<section id="panel-${group.id}" role="tabpanel" aria-labelledby="tab-${group.id}" tabindex="0" ${i ? 'hidden' : ''}>${group.questions.map(q => questionMarkup(group, q)).join('')}</section>`).join('');
    $('#base-table').innerHTML = model.levels.map(l => `<tr><th scope="row">${escape(l.label)}</th>${model.modalities.map(m => `<td>${money(l.bases[m.id])}</td>`).join('')}</tr>`).join('');
    $('#group-scores').innerHTML = model.groups.map(g => `<div class="group-score" title="${escape(g.label)} · peso ${g.weight} %"><b>${g.id}</b><div class="track"><span id="track-${g.id}"></span></div><small id="average-${g.id}">— / 5</small></div>`).join('');
    bindEvents();
    syncForm();
    selectGroup(0, false);
    update();
    $('#application').hidden = false;
  } catch (error) {
    $('#load-error').hidden = false;
    $('#load-error').textContent = 'No fue posible cargar el calculador. Recarga la página para volver a intentarlo. Si abriste el archivo directamente, utiliza la versión publicada o el servidor local indicado en el proyecto.';
    console.error(error);
  }
}

function questionMarkup(group, question) {
  const id = question.id;
  return `<article class="question-card" id="question-${id}"><div class="question-meta"><span class="question-code">${id}</span><span class="question-weight">Peso en x: ${number(group.weight / group.questions.length, 1)} %</span></div><fieldset><legend>${escape(question.text)}</legend><div class="options">${question.options.map((text, index) => {
    const range = model.ranges[index];
    return `<label class="option" for="${id}-option-${index + 1}"><input type="radio" name="${id}" id="${id}-option-${index + 1}" value="${index + 1}" data-question="${id}"><span class="option-copy">${escape(text)}</span><span class="option-range" aria-label="Rango de puntaje ${number(range.min, 1)} a ${number(range.max, 1)}">${number(range.min, 1)}–${number(range.max, 1)}</span></label>`;
  }).join('')}</div></fieldset><div class="slider-area locked" id="slider-area-${id}"><div class="slider-head"><label for="score-${id}" id="slider-label-${id}">Elige una respuesta para habilitar el puntaje</label><output class="score-output" id="output-${id}" for="score-${id}">—</output></div><input class="slider-range" id="score-${id}" type="range" min="1" max="5" step="0.1" value="3" disabled data-score="${id}" aria-describedby="endpoints-${id}"><div class="range-endpoints" id="endpoints-${id}"><span id="min-${id}">Mínimo</span><span id="max-${id}">Máximo</span></div></div><details class="evidence"><summary>Fuente de verificación y soporte</summary><p>${escape(question.source)}</p><label for="evidence-${id}">Anota la referencia o el criterio de valoración (opcional)</label><textarea id="evidence-${id}" data-evidence="${id}" maxlength="1500" rows="2" placeholder="Documento, fecha, indicador o justificación del puntaje…"></textarea></details></article>`;
}

function bindEvents() {
  for (const [id, property] of [['program-name', 'name'], ['level', 'level'], ['modality', 'modality'], ['procedure', 'procedure']]) {
    $(`#${id}`).addEventListener(id === 'program-name' ? 'input' : 'change', event => {
      state[property] = event.target.value;
      save(); update();
    });
  }
  $('#group-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-group]');
    if (button) selectGroup(Number(button.dataset.group));
  });
  $('#group-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (active + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
    selectGroup(index, false);
    $(`#tab-${model.groups[index].id}`).focus();
  });
  $('#question-panels').addEventListener('change', event => {
    const id = event.target.dataset.question;
    if (!id) return;
    const option = Number(event.target.value);
    const previousEvidence = state.answers[id]?.evidence || $(`#evidence-${id}`).value;
    state.answers[id] = { option, score: model.ranges[option - 1].initial, evidence: previousEvidence };
    syncQuestion(id); save(); update();
  });
  $('#question-panels').addEventListener('input', event => {
    const id = event.target.dataset.score;
    const evidenceId = event.target.dataset.evidence;
    if (id && state.answers[id]) {
      const answer = { ...state.answers[id], score: Number(event.target.value) };
      if (!validAnswer(model, answer)) return;
      state.answers[id] = answer;
      syncSliderText(id); save(); update();
    }
    if (evidenceId && state.answers[evidenceId]) {
      state.answers[evidenceId].evidence = event.target.value;
      save(); updateAudit();
    }
  });
  $('#previous-group').addEventListener('click', () => selectGroup(active - 1));
  $('#next-group').addEventListener('click', () => active < 3 ? selectGroup(active + 1) : review());
  $('#review-button').addEventListener('click', review);
  $('#download').addEventListener('click', download);
  $('#print').addEventListener('click', () => {
    if (!calculate(model, state).complete) return;
    $('#audit-details').open = true;
    window.print();
  });
  window.addEventListener('beforeprint', () => { $('#audit-details').open = true; });
  $('#reset').addEventListener('click', () => confirmAction('¿Iniciar una nueva evaluación?', 'Se borrarán el nombre, las respuestas y los soportes guardados en este navegador.', () => {
    state = cleanState(model); syncForm(); save(); update(); selectGroup(0);
    $('#program-name').focus(); toast('Evaluación reiniciada.');
  }));
  $('#neutral-example').addEventListener('click', () => {
    const action = () => {
      for (const question of model.groups.flatMap(g => g.questions)) state.answers[question.id] = { option: 3, score: 3, evidence: '' };
      syncForm(); save(); update(); selectGroup(0);
      toast('Caso neutro: x = 3,00 · factor = 1,000 · VCAP igual al valor base.');
    };
    if (Object.keys(state.answers).length) confirmAction('¿Cargar el caso neutro?', 'Se sustituirán tus respuestas por la opción 3 y un puntaje de 3,0 en las 19 preguntas. Se conservarán el nombre, el nivel y la modalidad.', action);
    else action();
  });
  $('#confirm-dialog').addEventListener('close', () => {
    const action = pendingAction;
    pendingAction = null;
    if ($('#confirm-dialog').returnValue === 'confirm') action?.();
  });
}

function syncForm() {
  $('#program-name').value = state.name;
  $('#level').value = state.level;
  $('#modality').value = state.modality;
  $('#procedure').value = state.procedure;
  for (const question of model.groups.flatMap(g => g.questions)) syncQuestion(question.id);
}

function syncQuestion(id) {
  const answer = state.answers[id];
  for (const radio of document.querySelectorAll(`input[name="${id}"]`)) radio.checked = Number(radio.value) === answer?.option;
  const slider = $(`#score-${id}`);
  slider.disabled = !answer;
  $(`#slider-area-${id}`).classList.toggle('locked', !answer);
  $(`#evidence-${id}`).value = answer?.evidence || '';
  if (answer) {
    const range = model.ranges[answer.option - 1];
    // Restablecer límites antes del valor evita que el navegador lo recorte con el rango anterior.
    slider.min = 1; slider.max = 5;
    slider.min = range.min; slider.max = range.max; slider.value = answer.score;
  } else { slider.min = 1; slider.max = 5; slider.value = 3; }
  syncSliderText(id);
}

function syncSliderText(id) {
  const answer = state.answers[id];
  const slider = $(`#score-${id}`);
  $(`#slider-label-${id}`).textContent = answer ? `Puntaje de ${id} · opción ${answer.option}` : 'Elige una respuesta para habilitar el puntaje';
  $(`#output-${id}`).textContent = answer ? number(answer.score, 1) : '—';
  slider.setAttribute('aria-valuetext', answer ? `${number(answer.score, 1)} puntos` : 'Pendiente de respuesta');
  $(`#min-${id}`).textContent = answer ? `${number(model.ranges[answer.option - 1].min, 1)} · mínimo` : 'Mínimo';
  $(`#max-${id}`).textContent = answer ? `${number(model.ranges[answer.option - 1].max, 1)} · máximo` : 'Máximo';
}

function selectGroup(index, scroll = true) {
  active = Math.max(0, Math.min(3, index));
  const group = model.groups[active];
  model.groups.forEach((g, i) => {
    const tab = $(`#tab-${g.id}`);
    tab.setAttribute('aria-selected', i === active);
    tab.tabIndex = i === active ? 0 : -1;
    $(`#panel-${g.id}`).hidden = i !== active;
  });
  $('#group-caption').textContent = `VARIABLE ${number(active + 1, 0).padStart(2, '0')} DE 04`;
  $('#group-title').textContent = group.label;
  $('#group-description').textContent = group.description;
  $('#group-weight').textContent = `${group.weight} %`;
  $('#new-program-note').hidden = !(state.procedure === 'nuevo' && group.id === 'E');
  $('#previous-group').disabled = active === 0;
  $('#next-group').textContent = active === 3 ? 'Ver resultado ↗' : 'Siguiente variable →';
  $('#section-position').textContent = `${active + 1} de 4`;
  if (scroll) $('#group-tabs').scrollIntoView({ behavior: 'auto', block: 'start' });
}

function update() {
  const result = calculate(model, state);
  $('#base-inline').textContent = money(result.base);
  $('#summary-base').textContent = money(result.base);
  $('#result-program').textContent = state.name.trim() || 'Programa sin nombre';
  $('#completion-label').textContent = `${result.answered} / ${result.total}`;
  $('#completion-progress').value = result.answered;
  $('#result-state').textContent = result.complete ? 'Completado' : 'En proceso';
  $('#result-state').classList.toggle('ready', result.complete);
  $('#result-value').textContent = result.complete ? money(result.value) : '—';
  $('#summary-score').innerHTML = `${result.complete ? number(result.score, 4) : '—'} <small>/ 5</small>`;
  $('#summary-factor').textContent = result.complete ? `${number(result.factor, 5)}×` : '—';
  $('#result-message').classList.toggle('adjusted', result.complete);
  $('#result-message').textContent = result.complete
    ? Math.abs(result.change) < 1e-8 ? 'Punto neutro: el valor del crédito es igual a la base institucional.'
      : `${number(Math.abs(result.change), 2)} % ${result.change < 0 ? 'de descuento' : 'de incremento'} sobre el valor base institucional.`
    : `Faltan ${result.total - result.answered} preguntas para calcular el valor del crédito.`;
  $('#score-marker').hidden = !result.complete;
  $('#score-marker').style.left = result.complete ? `${(result.score - 1) / 4 * 100}%` : '50%';
  for (const group of result.groups) {
    $(`#tab-count-${group.id}`).textContent = `${group.answered} / ${group.total}${group.answered === group.total ? ' ✓' : ''}`;
    $(`#tab-${group.id}`).classList.toggle('complete', group.answered === group.total);
    $(`#average-${group.id}`).textContent = group.average === null ? `${group.answered}/${group.total}` : number(group.average, 2);
    $(`#track-${group.id}`).style.width = group.average === null ? '0%' : `${group.average / 5 * 100}%`;
  }
  $('#new-program-note').hidden = !(state.procedure === 'nuevo' && model.groups[active].id === 'E');
  $('#download').disabled = !result.complete;
  $('#print').disabled = !result.complete;
  $('#report-identity').textContent = `${state.name.trim() || 'Programa sin nombre'} · ${model.levels.find(l => l.id === state.level).label} · ${model.modalities.find(m => m.id === state.modality).label} · ${state.procedure === 'nuevo' ? 'Creación (proyecciones)' : 'Programa existente'} · Base ${model.baseYear}`;
  $('#report-summary').textContent = result.complete ? `${money(result.base)} × ${number(result.factor, 5)} = ${money(result.value)} COP por crédito. Puntaje x = ${number(result.score, 4)}. El cálculo utiliza la precisión completa; el valor final se redondea al peso.` : `${result.answered} de ${result.total} preguntas respondidas. El valor final se habilita al completar la evaluación.`;
  updateAudit();
}

function updateAudit() {
  $('#audit-body').innerHTML = model.groups.map(group => group.questions.map(question => {
    const answer = state.answers[question.id];
    const weight = group.weight / group.questions.length;
    return `<tr><th scope="row">${question.id}</th><td><b>${escape(question.title)}</b><br>${answer ? `Opción ${answer.option}. ${escape(question.options[answer.option - 1])}` : 'Sin responder'}${answer?.evidence ? `<span class="evidence-text">Soporte: ${escape(answer.evidence)}</span>` : ''}</td><td>${answer ? number(answer.score, 1) : '—'}</td><td>${number(weight, 1)} %</td><td>${answer ? number(answer.score * weight / 100, 4) : '—'}</td></tr>`;
  }).join('')).join('');
}

function review() {
  const result = calculate(model, state);
  if (!result.complete) {
    const groupIndex = model.groups.findIndex(g => g.questions.some(q => !validAnswer(model, state.answers[q.id])));
    selectGroup(groupIndex, false);
    const question = model.groups[groupIndex].questions.find(q => !validAnswer(model, state.answers[q.id]));
    $(`#question-${question.id}`).scrollIntoView({ behavior: 'auto', block: 'center' });
    $(`#${question.id}-option-1`).focus({ preventScroll: true });
    toast(`Completa las ${result.total - result.answered} preguntas pendientes. La primera es ${question.id}.`);
    return;
  }
  $('#audit-details').open = true;
  $('#desglose').scrollIntoView({ behavior: 'auto', block: 'start' });
}

function download() {
  const result = calculate(model, state);
  if (!result.complete) return;
  const report = {
    title: 'Calculador del VCAP UPTC', modelVersion: model.version, baseYear: model.baseYear,
    exportedAt: new Date().toISOString(), currency: model.currency,
    program: { name: state.name, level: state.level, modality: state.modality, procedure: state.procedure },
    result,
    matrix: model.groups.flatMap(group => group.questions.map(q => ({
      question: q.id, text: q.text, variable: group.id, variableWeight: group.weight,
      option: state.answers[q.id].option, response: q.options[state.answers[q.id].option - 1],
      range: model.ranges[state.answers[q.id].option - 1], score: state.answers[q.id].score,
      questionWeight: group.weight / group.questions.length,
      contribution: state.answers[q.id].score * group.weight / (100 * group.questions.length),
      suggestedSource: q.source, evidence: state.answers[q.id].evidence,
    }))),
    sources: model.sources,
    note: 'Estimación técnica; requiere validación institucional. Base 2026, sin actualización IAEP posterior.',
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `VCAP-${state.level}-${state.modality}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Evaluación descargada con las 19 respuestas y el detalle del cálculo.');
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $('#save-status').textContent = 'Tus respuestas se guardan solo en este navegador.';
  } catch {
    $('#save-status').textContent = 'El navegador no permite guardar el borrador. Descarga la evaluación antes de cerrar.';
  }
}

function confirmAction(title, description, action) {
  pendingAction = action;
  $('#dialog-title').textContent = title;
  $('#dialog-description').textContent = description;
  $('#confirm-dialog').returnValue = 'cancel';
  $('#confirm-dialog').showModal();
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5500);
}

initialize();
