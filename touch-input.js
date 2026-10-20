/* Immediate, independent contacts for classroom touch displays. No dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClassroomTouch = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function bind(root, { activate, selector = 'button[data-key],button[data-action]', onContacts = () => {} }) {
    const doc = root.ownerDocument, win = doc.defaultView;
    const active = new Map(), recent = [], removers = [], flashes = new Map();
    const now = () => win.performance.now();
    function listen(node, type, fn, options) {
      node.addEventListener(type, fn, options);
      removers.push(() => node.removeEventListener(type, fn, options));
    }
    function buttonAt(target) {
      const button = target?.closest?.(selector);
      return button && root.contains(button) ? button : null;
    }
    function notify() { onContacts([...active.values()].map(p => ({ id: p.id, type: p.type, button: p.button }))); }
    function prune() {
      for (let i = recent.length - 1; i >= 0; i--) if (!active.has(recent[i].id) && now() - recent[i].ended > 1200) recent.splice(i, 1);
    }
    function flash(button) {
      win.clearTimeout(flashes.get(button));
      button.classList.add('touch-pressed');
      flashes.set(button, win.setTimeout(() => {
        flashes.delete(button);
        if (![...active.values()].some(p => p.button === button)) button.classList.remove('touch-pressed');
      }, 90));
    }
    function begin(id, type, target, x, y, event) {
      const button = buttonAt(target);
      if (!button || active.has(id)) return;
      if (event.cancelable) event.preventDefault();
      prune();
      const contact = { id, type, button, x, y, ended: Infinity };
      active.set(id, contact); recent.push(contact);
      // Capture on the persistent surface, not a button that a screen transition removes.
      if (event.pointerId !== undefined) { try { root.setPointerCapture(event.pointerId); } catch { /* Synthetic events / older engines. */ } }
      notify();
      if (!button.disabled && button.getAttribute('aria-disabled') !== 'true') { flash(button); activate(button, event); }
    }
    function end(id) {
      const contact = active.get(id); if (!contact) return;
      contact.ended = now(); active.delete(id);
      if (!flashes.has(contact.button) && ![...active.values()].some(p => p.button === contact.button)) contact.button.classList.remove('touch-pressed');
      notify();
    }
    function reset() { for (const id of [...active.keys()]) end(id); }
    if (win.PointerEvent) {
      listen(root, 'pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // isPrimary must NOT filter touch or pen contacts: other students are non-primary.
        begin(e.pointerId, e.pointerType || 'mouse', e.target, e.clientX, e.clientY, e);
      }, { passive: false });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(doc, type, e => end(e.pointerId), true);
    } else {
      // Bind Touch Events only on engines without Pointer Events, never both streams.
      listen(root, 'touchstart', e => {
        for (const t of e.changedTouches) begin('touch-' + t.identifier, 'touch', t.target, t.clientX, t.clientY, e);
      }, { passive: false });
      for (const type of ['touchend', 'touchcancel']) listen(doc, type, e => { for (const t of e.changedTouches) end('touch-' + t.identifier); }, true);
    }
    listen(root, 'click', e => {
      prune();
      const button = buttonAt(e.target);
      // Cancellation of pointerdown alone does not reliably suppress a later click.
      // Deduplicate the matching contact only; never impose a global cooldown.
      let duplicate = -1;
      if (typeof e.pointerId === 'number' && e.pointerId >= 0) duplicate = recent.findLastIndex(p => p.id === e.pointerId);
      if (duplicate < 0 && e.detail > 0) duplicate = recent.findLastIndex(p =>
        p.button === button || (Math.abs(p.x - e.clientX) <= 24 && Math.abs(p.y - e.clientY) <= 24));
      if (duplicate >= 0) {
        recent.splice(duplicate, 1); e.preventDefault(); e.stopImmediatePropagation(); return;
      }
      // Keyboard/assistive technology and devices that send only click still work.
      if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      flash(button); activate(button, e);
    }, true);
    listen(win, 'blur', reset);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });
    return { reset, destroy() {
      reset(); removers.forEach(remove => remove());
      for (const [button, timer] of flashes) { win.clearTimeout(timer); button.classList.remove('touch-pressed'); }
      flashes.clear(); recent.length = 0;
    } };
  }
  return { bind };
});
