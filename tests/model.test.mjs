import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculate, adjustment, cleanState, validAnswer } from '../engine.mjs';

const model = JSON.parse(await readFile(new URL('../data/modelo.json', import.meta.url), 'utf8'));
const allQuestions = model.groups.flatMap(g => g.questions);
function scenario(option, score, level = 'especializacion', modality = 'presencial') {
  return { level, modality, answers: Object.fromEntries(allQuestions.map(q => [q.id, { option, score }])) };
}

test('el instrumento mantiene 19 preguntas, 5 opciones y pesos que suman 100 %', () => {
  assert.deepEqual(model.groups.map(g => [g.id, g.weight, g.questions.length]), [['CP', 20, 5], ['C', 20, 5], ['E', 30, 4], ['P', 30, 5]]);
  assert.equal(new Set(allQuestions.map(q => q.id)).size, 19);
  for (const q of allQuestions) { assert.equal(q.options.length, 5); assert.ok(q.text && q.source); }
  assert.equal(model.groups.reduce((s, g) => s + g.weight, 0), 100);
});

test('las 9 bases corresponden a la figura 10 del modelo financiero', () => {
  assert.deepEqual(model.levels.map(l => Object.values(l.bases)), [[450000, 382500, 315000], [630000, 535500, 441000], [900000, 765000, 630000]]);
  for (const level of model.levels) for (const modality of model.modalities) {
    const result = calculate(model, scenario(3, 3, level.id, modality.id));
    assert.equal(result.score, 3); assert.equal(result.factor, 1);
    assert.equal(result.value, level.bases[modality.id]);
  }
});

test('g(x) cumple los extremos, el punto neutro y la continuidad', () => {
  assert.equal(adjustment(1), 0.8); assert.equal(adjustment(3), 1); assert.equal(adjustment(5), 2.5);
  assert.ok(Math.abs(adjustment(3 - 1e-8) - adjustment(3 + 1e-8)) < 1e-7);
  assert.throws(() => adjustment(0)); assert.throws(() => adjustment(NaN)); assert.throws(() => adjustment(5.01));
  const low = calculate(model, scenario(1, 1));
  const high = calculate(model, scenario(5, 5));
  assert.equal(low.value, 360000); assert.equal(high.value, 1125000);
  assert.equal(low.factor, 0.8); assert.equal(high.factor, 2.5);
});

test('todos los extremos de cada rango son válidos y se rechazan puntajes ajenos a su respuesta', () => {
  assert.deepEqual(model.ranges.map(r => [r.min, r.max]), [[1, 1.7], [1.8, 2.4], [2.5, 3.2], [3.3, 3.8], [3.9, 5]]);
  for (const [i, range] of model.ranges.entries()) {
    for (const score of [range.min, range.max, range.initial]) assert.ok(validAnswer(model, { option: i + 1, score }));
    assert.equal(validAnswer(model, { option: i + 1, score: range.min - 0.1 }), false);
    assert.equal(validAnswer(model, { option: i + 1, score: range.max + 0.1 }), false);
  }
  for (const a of [{option: 0, score: 1}, {option: 6, score: 5}, {option: 3, score: 2.55}, {option: 3, score: '3'}, {option: 3, score: NaN}]) assert.equal(validAnswer(model, a), false);
});

test('los pesos por pregunta son 4 %, 4 %, 7,5 % y 6 % sin renormalizar respuestas pendientes', () => {
  const state = scenario(3, 3);
  state.answers.E1 = { option: 5, score: 5 };
  state.answers.P1 = { option: 1, score: 1 };
  state.answers.CP1 = { option: 4, score: 3.8 };
  const result = calculate(model, state);
  // 3 + 2*0,075 - 2*0,06 + 0,8*0,04 = 3,062.
  assert.equal(result.score, 3.062); assert.equal(result.factor, 1.0465); assert.equal(result.value, 470925);
  delete state.answers.C2;
  const partial = calculate(model, state);
  assert.equal(partial.complete, false); assert.equal(partial.answered, 18); assert.equal(partial.score, null); assert.equal(partial.value, null);
});

test('se calcula el factor con precisión completa y solo se redondea el valor final', () => {
  const state = scenario(3, 3, 'maestria', 'hibrida');
  state.answers.E1 = { option: 4, score: 3.3 };
  const r = calculate(model, state);
  assert.equal(r.score, 3.0225); assert.equal(r.factor, 1.016875); assert.equal(r.value, 544537);
});

test('los borradores inválidos no permiten calcular ni inyectar una base diferente', () => {
  const clean = cleanState(model, { name: 'X'.repeat(500), level: 'falso', modality: 'falsa', base: 1,
    answers: { CP1: { option: 1, score: 5 }, CP2: { option: 2, score: 2.4 }, FAKE: { option: 5, score: 5 } } });
  assert.equal(clean.name.length, 180); assert.equal(clean.level, 'especializacion'); assert.equal(clean.modality, 'presencial');
  assert.deepEqual(Object.keys(clean.answers), ['CP2']);
  assert.equal(calculate(model, clean).base, 450000); assert.equal(calculate(model, clean).complete, false);
  assert.equal(calculate(model, scenario(3, 3, 'falso')).value, null);
});
