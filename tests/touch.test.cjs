const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rootPath = fs.existsSync(path.join(__dirname, '../dist/touch-input.js')) ? '../dist/' : '../';
const { bind } = require(rootPath + 'touch-input.js');
class Target {
  constructor() { this.handlers = {}; }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.handlers[type] = this.handlers[type].filter(x => x !== fn); }
  emit(type, props = {}) {
    const e = { type, target: this, cancelable: true, detail: 1, clientX: 0, clientY: 0, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...props };
    for (const fn of this.handlers[type] || []) { fn(e); if (e.stopped) break; } return e;
  }
}
function fixture(pointer = true) {
  const win = new Target(), doc = new Target(), root = new Target();
  Object.assign(win, { PointerEvent: pointer ? function () {} : undefined, performance, setTimeout, clearTimeout });
  doc.defaultView = win; root.ownerDocument = doc; root.contains = b => buttons.includes(b); root.setPointerCapture = () => {};
  const buttons = Array.from({ length: 3 }, (_, id) => ({ id, disabled: false, closest() { return this; }, getAttribute() { return null; }, classList: { add() {}, remove() {} } }));
  const counts = [0, 0, 0], contacts = [];
  const controller = bind(root, { activate(b) { counts[b.id]++; }, onContacts(c) { contacts.push(c.length); } });
  const down = (id, lane, extra = {}) => root.emit('pointerdown', { pointerId: id, pointerType: 'touch', button: 0, isPrimary: id === 1, target: buttons[lane], ...extra });
  const up = id => doc.emit('pointerup', { pointerId: id });
  const click = (id, lane, extra = {}) => root.emit('click', { pointerId: id, target: buttons[lane], ...extra });
  return { root, doc, win, buttons, counts, contacts, controller, down, up, click };
}
test('three overlapping non-primary contacts respond on down, once each', () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) f.down(i + 1, i);
  assert.deepEqual(f.counts, [1, 1, 1]); assert.equal(Math.max(...f.contacts), 3);
  f.down(1, 0); assert.deepEqual(f.counts, [1, 1, 1], 'holding does not repeat');
  for (const id of [2, 1, 3]) { f.up(id); assert.equal(f.click(id, id - 1).prevented, true); }
  assert.deepEqual(f.counts, [1, 1, 1]); assert.equal(f.contacts.at(-1), 0); f.controller.destroy();
});
test('rapid alternating taps have no shared cooldown and no duplicate click', () => {
  const f = fixture();
  for (let i = 0; i < 150; i++) { const lane = i % 3; f.down(i + 10, lane); f.up(i + 10); f.click(i + 10, lane); }
  assert.deepEqual(f.counts, [50, 50, 50]); f.controller.destroy();
});
test('mouse PointerEvents, keyboard click, click-only fallback, and disabled buttons', () => {
  const f = fixture();
  f.down(9, 0, { pointerType: 'mouse' }); f.up(9); f.click(9, 0);
  f.click(-1, 0, { detail: 0 });
  f.click(90, 2, { clientX: 500, clientY: 500 });
  f.buttons[1].disabled = true; f.down(11, 1); f.up(11); f.click(11, 1);
  f.down(12, 2, { pointerType: 'mouse', button: 2 });
  assert.deepEqual(f.counts, [2, 0, 1]); f.controller.destroy();
});
test('compatibility MouseEvent is deduplicated even if a screen transition removes the button', () => {
  const f = fixture(); f.down(1, 0); f.up(1);
  const e = f.root.emit('click', { clientX: 0, clientY: 0 });
  assert.equal(e.prevented, true); assert.deepEqual(f.counts, [1, 0, 0]); f.controller.destroy();
});
test('pointercancel, capture loss and blur release contacts without blocking the next tap', () => {
  const f = fixture(); f.down(1, 0); f.doc.emit('pointercancel', { pointerId: 1 });
  f.down(1, 0); f.doc.emit('lostpointercapture', { pointerId: 1 });
  f.down(2, 1); f.win.emit('blur');
  f.down(2, 1); f.up(2);
  assert.deepEqual(f.counts, [2, 2, 0]); assert.equal(f.contacts.at(-1), 0); f.controller.destroy();
});
test('legacy Touch Events process every changed touch without binding PointerEvents', () => {
  const f = fixture(false);
  const touches = f.buttons.map((target, identifier) => ({ target, identifier, clientX: identifier * 200, clientY: 0 }));
  assert.equal(f.root.handlers.pointerdown, undefined);
  f.root.emit('touchstart', { changedTouches: touches }); assert.deepEqual(f.counts, [1, 1, 1]);
  f.doc.emit('touchend', { changedTouches: touches });
  f.root.emit('click', { target: f.buttons[0] }); assert.deepEqual(f.counts, [1, 1, 1]);
  assert.equal(f.contacts.at(-1), 0); f.controller.destroy();
});
