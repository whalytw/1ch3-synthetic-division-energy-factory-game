const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = fs.existsSync(path.join(__dirname, '../dist/app.js')) ? '../dist/' : '../';
const M = require(root + 'math.js');
const elements = new Map();
let clicked = false, exported;
function element(id = '') {
  return { id, dataset: {}, style: {}, value: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, toggle() {} }, listeners: {}, setAttribute() {}, appendChild(e) { elements.set('#' + e.id, e); }, addEventListener(k, f) { this.listeners[k] = f; }, click() { clicked = true; } };
}
const querySelector = key => { if (!elements.has(key)) elements.set(key, element(key)); return elements.get(key); };
const record = { time: '2026-10-20T06:00:00.000Z', station: 2, seat: '7', score: 120, completed: 1, total: 1, timeouts: 0, attempts: 12, correct: 12, hints: 0, seconds: 37 };
const context = { window: { DivisionMath: M, ClassroomTouch: { bind() {} } }, document: { querySelector, querySelectorAll() { return []; }, createElement() { return element(); }, addEventListener() {} }, localStorage: { getItem(key) { return key.endsWith(':records') ? JSON.stringify([record]) : null; }, setItem() {} }, structuredClone, setInterval() {}, setTimeout() {}, clearTimeout() {}, Blob, URL: { createObjectURL(blob) { exported = blob; return 'blob:unit-test'; }, revokeObjectURL() {} }, Date, Math };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, root, 'app.js'), 'utf8'), context);
querySelector('#export-btn').listeners.click();
(async () => {
  assert.equal(clicked, true, 'export activates a download anchor');
  const bytes = new Uint8Array(await exported.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191], 'CSV includes UTF-8 BOM');
  const csv = await exported.text();
  assert.ok(csv.includes('時間（臺灣）'));
  assert.ok(csv.includes('2026/10/20'));
  assert.ok(csv.includes('14:00:00'));
  assert.ok(csv.includes('"2","7","120","1","1","0","12","12","0","37"'));
  assert.equal(csv.split('\r\n').length, 2);
  console.log('PASS: CSV download activation, UTF-8 BOM, Chinese columns, Taiwan time, and complete record values.');
})();
