const assert = require('node:assert/strict');
const fs = require('node:fs');
const M = require(fs.existsSync(require('node:path').join(__dirname, '../dist/math.js')) ? '../dist/math.js' : '../math.js');
const evaluate = (a, x) => a.reduce((s, v, i) => s + v * x ** (a.length - 1 - i), 0);
function verify(a, c) {
  const s = M.synthetic(a, c);
  const reconstruction = Array(a.length).fill(0);
  s.quotient.forEach((v, i) => { reconstruction[i] += v; reconstruction[i + 1] -= c * v; });
  reconstruction[reconstruction.length - 1] += s.remainder;
  assert.deepEqual(reconstruction, a, 'division identity must reconstruct every coefficient');
  assert.equal(s.remainder, evaluate(a, c), 'remainder theorem independently checks the remainder');
  for (const x of [-3, 0, 2, 5]) assert.equal(evaluate(a, x), (x - c) * evaluate(s.quotient, x) + s.remainder);
  const tasks = M.makeTasks(a, c);
  assert.equal(tasks.length, 4 * (a.length - 1) + 4);
  assert.deepEqual(tasks.filter(t => t.kind === 'coefficient').map(t => t.value), a);
  assert.deepEqual(tasks.filter(t => t.kind === 'quotient').map(t => t.value), s.quotient);
  assert.equal(tasks.at(-1).value, s.remainder);
}
verify([1, 0, -4, 1], 2);
verify([2, 3, 4, -1], -1);
verify([-1, 0, 0, 0, -3], 0);
verify([1, 0, -4], 2);
verify([3, 0, -2], -2);
let generated = 0;
for (const degree of [2, 3, 4]) for (const rootMax of [1, 3, 5]) for (const includeZero of [true, false]) for (let i = 0; i < 150; i++) {
  const q = M.generate(degree, { coefficientMax: 9, rootMax, includeZero, missingRate: 50 });
  verify(q.a, q.c); generated++;
  assert.notEqual(q.a[0], 0);
  if (!includeZero) assert.notEqual(q.c, 0);
  assert.ok(Math.max(...q.bottom.map(Math.abs), ...q.products.slice(1).map(Math.abs)) <= 150);
}
for (let i = 0; i < 100; i++) {
  const q = M.generate(4, { coefficientMax: 6, rootMax: 3, missingRate: 100, leadingOne: true });
  assert.equal(q.a[0], 1); assert.ok(q.a.slice(1, -1).includes(0));
}
assert.equal(M.polynomial([1, 0, -4, 1], false), 'x^3 − 4x + 1');
assert.equal(M.polynomial([0, 0], false), '0');
assert.equal(M.polynomial([-1, 1], false), '−x + 1');
assert.equal(M.divisor(-2), 'x + 2');
assert.equal(M.divisor(0), 'x');
assert.equal(M.points(0, 0, 0, 0), 100);
assert.equal(M.points(0, 1, 0, 0), 80);
assert.equal(M.points(100, 0, 0, 0), 20);
const round = M.makeRound({ counts: [2, 3, 1], coefficientMax: 6, rootMax: 3, missingRate: 50 });
assert.deepEqual(round.map(q => q.degree), [2, 2, 3, 3, 3, 4]);
assert.equal(new Set(round.map(q => q.a.join(',') + ':' + q.c)).size, 6);
console.log(`PASS: ${generated} generated divisions, coefficient identities, remainder theorem, task structure, bounds, missing terms, formatting, scoring, and round composition.`);
