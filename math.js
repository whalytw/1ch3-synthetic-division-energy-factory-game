(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DivisionMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rand(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  function synthetic(coefficients, c) {
    const bottom = [coefficients[0]], products = [null];
    for (let i = 1; i < coefficients.length; i++) {
      products.push(bottom[i - 1] * c);
      bottom.push(coefficients[i] + products[i]);
    }
    return { bottom, products, quotient: bottom.slice(0, -1), remainder: bottom[bottom.length - 1] };
  }
  function polynomial(a, html = true) {
    const terms = [];
    a.forEach((v, i) => {
      if (!v) return;
      const p = a.length - 1 - i;
      const n = Math.abs(v);
      const factor = p ? ((n === 1 ? '' : String(n)) + 'x' + (p > 1 ? (html ? '<sup>' + p + '</sup>' : '^' + p) : '')) : String(n);
      terms.push((terms.length ? (v < 0 ? ' − ' : ' + ') : (v < 0 ? '−' : '')) + factor);
    });
    return terms.join('') || '0';
  }
  const divisor = c => c === 0 ? 'x' : 'x ' + (c < 0 ? '+ ' : '− ') + Math.abs(c);
  const power = p => p === 0 ? '常數' : p === 1 ? 'x' : 'x<sup>' + p + '</sup>';
  function makeTasks(a, c) {
    const s = synthetic(a, c), n = a.length - 1;
    const tasks = [{ kind: 'root', i: 0, value: c, stage: 0 }];
    a.forEach((value, i) => tasks.push({ kind: 'coefficient', i, value, stage: 1 }));
    tasks.push({ kind: 'bottom', i: 0, value: s.bottom[0], stage: 2 });
    for (let i = 1; i <= n; i++) {
      tasks.push({ kind: 'product', i, value: s.products[i], stage: 2 });
      tasks.push({ kind: 'bottom', i, value: s.bottom[i], stage: 2 });
    }
    s.quotient.forEach((value, i) => tasks.push({ kind: 'quotient', i, value, stage: 3 }));
    tasks.push({ kind: 'remainder', i: 0, value: s.remainder, stage: 3 });
    return tasks;
  }
  function generate(degree, cfg) {
    const maxA = Math.min(cfg.coefficientMax || 6, degree === 2 ? 4 : 9);
    const rootMax = Math.min(cfg.rootMax || 3, degree === 2 ? 2 : 5);
    const roots = Array.from({ length: rootMax * 2 + 1 }, (_, i) => i - rootMax).filter(v => v || cfg.includeZero);
    for (let attempt = 0; attempt < 700; attempt++) {
      const c = attempt > 600 ? (Math.random() < .5 ? -1 : 1) : roots[rand(0, roots.length - 1)];
      const leading = cfg.leadingOne ? 1 : [1, 2, 3, -1, -2, -3][rand(0, 5)];
      const a = [leading, ...Array.from({ length: degree }, () => rand(-maxA, maxA))];
      if (Math.random() * 100 < cfg.missingRate) a[rand(1, degree - 1)] = 0;
      const s = synthetic(a, c);
      if (Math.max(...s.bottom.map(Math.abs), ...s.products.slice(1).map(Math.abs)) <= 150) return { a, c, degree, ...s };
    }
    const a = [1, ...Array(degree).fill(0)]; a[degree] = 1;
    return { a, c: 1, degree, ...synthetic(a, 1) };
  }
  function makeRound(cfg) {
    const questions = [], seen = new Set();
    cfg.counts.forEach((count, level) => {
      for (let i = 0; i < count; i++) {
        let q, key, retry = 0;
        do { q = generate(level + 2, cfg); key = q.a.join(',') + ':' + q.c; retry++; } while (seen.has(key) && retry < 100);
        seen.add(key); questions.push(q);
      }
    });
    return cfg.shuffle ? shuffle(questions) : questions;
  }
  function instruction(t, q, guided) {
    const n = q.degree;
    if (t.kind === 'root') return ['設定綜合除法使用的數', guided ? '令除式等於 0，解出 x 的值。' : '先判斷右上角應填入的數。'];
    if (t.kind === 'coefficient') return ['填入' + power(n - t.i) + '項係數', '依降冪排列；沒有出現的項，係數填 0。'];
    if (t.kind === 'product') return ['相乘：填入第 ' + (t.i + 1) + ' 欄乘積', guided ? '左下方的數 × 右上角的數。' : '完成目前亮起的乘積格。'];
    if (t.kind === 'bottom') return t.i === 0 ? ['帶下首項係數', '第一欄直接帶下，不需要相乘。'] : ['相加：填入第 ' + (t.i + 1) + ' 欄結果', guided ? '同一欄的係數 ＋ 乘積。' : '完成目前亮起的底列格。'];
    if (t.kind === 'quotient') return ['整理商式：填入' + power(n - 1 - t.i) + '項係數', '商式比被除式少一次，底列最後一格留給餘式。'];
    return ['填入餘式，完成驗收', '底列最後一個數就是餘式。'];
  }
  function hint(t, q) {
    const v = x => x < 0 ? '(' + '−' + Math.abs(x) + ')' : String(x);
    if (t.kind === 'root') return '令 ' + divisor(q.c) + ' = 0，得到 x = ' + v(q.c) + '。';
    if (t.kind === 'coefficient') return t.value === 0 ? '這個次方的項沒有出現，要補入 0。' : '這一項的係數是 ' + v(t.value) + '，請連同正負號一起填入。';
    if (t.kind === 'product') return v(q.bottom[t.i - 1]) + ' × ' + v(q.c) + ' = ' + v(t.value);
    if (t.kind === 'bottom') return t.i === 0 ? '把首項係數 ' + v(t.value) + ' 直接帶下。' : v(q.a[t.i]) + ' + ' + v(q.products[t.i]) + ' = ' + v(t.value);
    if (t.kind === 'quotient') return '商式的這個係數對應底列第 ' + (t.i + 1) + ' 格：' + v(t.value) + '。';
    return '底列最後一格是 ' + v(t.value) + '，這就是餘式。';
  }
  function points(mistakes, hints, remaining, seconds) {
    const base = Math.max(20, 100 - mistakes * 3);
    const bonus = seconds > 0 ? Math.floor(20 * Math.max(0, Math.min(1, remaining / seconds))) : 0;
    return Math.round(base * Math.pow(.8, hints)) + bonus;
  }
  return { synthetic, polynomial, divisor, power, makeTasks, generate, makeRound, instruction, hint, points };
});
