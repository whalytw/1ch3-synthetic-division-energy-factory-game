(() => {
  'use strict';
  const M = window.DivisionMath;
  const DEFAULTS = { counts: [1, 1, 1], seconds: 240, hints: 2, coefficientMax: 6, rootMax: 3, missingRate: 50, leadingOne: false, includeZero: false, guided: true, shuffle: false, seatMin: 1, seatMax: 30 };
  const KEY = 'division-energy-factory-v1';
  function readStored(key, fallback) { try { const v = localStorage.getItem(KEY + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
  function writeStored(key, value) { try { localStorage.setItem(KEY + key, JSON.stringify(value)); return true; } catch { toast('瀏覽器無法儲存資料，本次仍可正常遊玩。'); return false; } }
  function normalized(v) {
    const c = { ...DEFAULTS, ...v };
    c.counts = Array.isArray(c.counts) && c.counts.length === 3 ? c.counts.map(x => Math.max(0, Math.min(10, Math.round(Number(x) || 0)))) : DEFAULTS.counts.slice();
    if (!c.counts.some(Boolean)) c.counts = DEFAULTS.counts.slice();
    for (const [k, min, max] of [['seconds', 0, 600], ['hints', 0, 3], ['coefficientMax', 3, 9], ['rootMax', 1, 5], ['missingRate', 0, 100], ['seatMin', 1, 99], ['seatMax', 1, 99]]) c[k] = Math.max(min, Math.min(max, Number.isFinite(+c[k]) ? Math.round(+c[k]) : DEFAULTS[k]));
    if (c.seatMax < c.seatMin) c.seatMax = c.seatMin;
    return c;
  }
  let settings = normalized(readStored(':settings', DEFAULTS));
  let records = readStored(':records', []); if (!Array.isArray(records)) records = [];
  let sound = false, audio, pausedAt = 0, keyboardLane = 0, toastTimer;
  const lanes = Array.from({ length: 3 }, (_, id) => ({ id, state: 'ready', seat: '', score: 0 }));
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const dom = $('#lanes');
  const escape = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = n => String(n).replace('-', '−');
  const duration = n => { const seconds = Math.ceil(n); return seconds < 60 ? seconds + '秒' : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); };
  const laneEl = id => $('#lane-' + id);
  function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2700); }
  function beep(kind) {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.connect(g); g.connect(audio.destination); o.type = 'sine';
      const t = audio.currentTime;
      o.frequency.setValueAtTime(kind === 'wrong' ? 170 : kind === 'win' ? 660 : 440, t);
      o.frequency.exponentialRampToValueAtTime(kind === 'wrong' ? 100 : kind === 'win' ? 1050 : 740, t + .09);
      g.gain.setValueAtTime(.045, t); g.gain.exponentialRampToValueAtTime(.001, t + .16); o.start(); o.stop(t + .17);
    } catch { /* Sound is optional on touch displays. */ }
  }
  function seatOptions(current = '') {
    let html = '<option value="">不填座號</option>';
    for (let i = settings.seatMin; i <= settings.seatMax; i++) html += '<option value="' + i + '"' + (String(current) === String(i) ? ' selected' : '') + '>' + i + ' 號</option>';
    return html;
  }
  function header(l) {
    const label = l.state === 'ready' ? '等待工程師' : (l.demo ? '示範練習' : (l.seat ? l.seat + ' 號' : '工程師'));
    return '<div class="lane-header"><div class="lane-name"><span class="lane-number">0' + (l.id + 1) + '</span>發電站</div><div class="lane-status"><span>' + label + '</span>' + (l.state !== 'ready' ? '<b>' + l.score + ' 分</b>' : '') + '</div></div>';
  }
  function render(l) {
    const el = laneEl(l.id);
    if (l.state === 'playing' && el.dataset.state === 'playing') {
      $('.work-area', el).innerHTML = work(l);
      updateEntry(l);
      const hint = $('[data-action="hint"]', el);
      hint.disabled = l.hintsUsed >= l.cfg.hints || l.hintedSteps.has(l.step);
      hint.textContent = '✦ 求救卡 ' + (l.cfg.hints - l.hintsUsed);
      $('.step-count', el).textContent = '完成 ' + l.step + ' / ' + l.tasks.length + ' 格';
      $('.mistake-count', el).textContent = '本題答錯 ' + l.mistakes + ' 次';
      return;
    }
    el.dataset.state = l.state;
    el.innerHTML = header(l) + (l.state === 'ready' ? ready(l) : l.state === 'playing' ? playing(l) : l.state === 'review' ? review(l) : done(l));
  }
  function ready(l) {
    return '<div class="lane-body ready-body"><p class="eyebrow">POWER STATION / 0' + (l.id + 1) + '</p><div class="station-visual" aria-hidden="true"><div class="station-ring"><div class="energy-core">ϟ</div></div><span class="floating-tag tag-one">x − a</span><span class="floating-tag tag-two">q(x) + r</span></div><div><h2 class="station-label">你的發電站，準備就緒</h2><p class="ready-description">每完成一格，讓能源向前流動。<br>親手完成整張綜合除法表！</p></div><div class="mission-pills"><span>' + settings.counts.reduce((a, b) => a + b, 0) + ' 題任務</span><span>' + (settings.seconds ? '每題 ' + settings.seconds + ' 秒' : '不限時練習') + '</span><span>每題 ' + settings.hints + ' 張求救卡</span></div><div class="ready-controls"><label class="seat-select-row">工程師座號<select class="seat-select" aria-label="第 ' + (l.id + 1) + ' 區座號">' + seatOptions(l.seat) + '</select></label><button data-action="start" class="start-button">啟動發電站 <span aria-hidden="true">→</span></button><button data-action="demo" class="demo-button">先試一題・不限時示範</button></div><p class="tiny-note">自己開始、自己闖關，完成後即可換人。</p></div>';
  }
  function getTaskIndex(l, kind, i) { return l.tasks.findIndex(t => t.kind === kind && t.i === i); }
  function cell(l, kind, i, extra = '') {
    const idx = getTaskIndex(l, kind, i), active = idx === l.step, filled = idx < l.step;
    const t = l.tasks[idx];
    const classes = 'cell ' + extra + (active ? ' active' : filled ? ' filled' : ' locked');
    const labels = { root: '代入數', coefficient: '係數', product: '乘積', bottom: '底列結果', quotient: '商式係數', remainder: '餘式' };
    return '<button class="' + classes + '" data-task="' + idx + '" aria-label="' + labels[kind] + ' 第' + (i + 1) + '格' + (filled ? '，' + num(t.value) : active ? '，目前填寫' : '，尚未填寫') + '"' + (!active ? ' disabled' : '') + '>' + (filled ? num(t.value) : '<span class="placeholder">' + (active ? '?' : '·') + '</span>') + '</button>';
  }
  function table(l) {
    const n = l.q.degree, cols = n + 1;
    let s = '<div class="table-wrap"><div class="synth-table" style="--cols:' + cols + ';--degree:' + n + '"><span class="row-name">係數</span>';
    for (let i = 0; i <= n; i++) s += cell(l, 'coefficient', i);
    s += cell(l, 'root', 0, 'root-cell') + '<span class="row-name">乘積</span><span class="pass-arrow">↓</span>';
    for (let i = 1; i <= n; i++) s += cell(l, 'product', i);
    s += '<span class="root-spacer"></span><div class="sum-rule"></div><span class="row-name">結果</span>';
    for (let i = 0; i <= n; i++) s += cell(l, 'bottom', i, 'bottom-cell' + (i === n ? ' remainder-cell' : ''));
    s += '<span></span><span class="answer-group-label">商式係數</span><span class="remainder-label">餘式</span><span></span></div></div>';
    return s;
  }
  function output(l) {
    let s = '<div class="result-area"><span class="result-label">商式<br>係數</span><div class="quotient-inputs" style="--degree:' + l.q.degree + '">';
    for (let i = 0; i < l.q.degree; i++) s += '<div class="output-item">' + cell(l, 'quotient', i, 'output-cell') + '<small>' + M.power(l.q.degree - 1 - i) + '項</small></div>';
    return s + '</div><div class="remainder-output output-item">' + cell(l, 'remainder', 0, 'output-cell') + '<small>餘式</small></div></div>';
  }
  function remaining(l) { return l.cfg.seconds ? Math.max(0, (l.deadline - (pausedAt || Date.now())) / 1000) : 0; }
  function playing(l) {
    let keypad = '';
    for (const [text, value, cls] of [['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['⌫', 'back', 'utility'], ['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['＋/−', 'sign', 'utility'], ['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['清除', 'clear', 'utility'], ['0', '0', 'zero'], ['確認 ↵', 'enter', 'confirm']]) keypad += '<button data-key="' + value + '" class="' + cls + '"' + (value === 'enter' && (!l.buffer || l.buffer === '-') ? ' disabled' : '') + '>' + text + '</button>';
    return '<div class="lane-body playing-body"><div class="work-area">' + work(l) + '</div><div class="answer-controls"><div class="entry-display' + (!l.buffer ? ' empty' : '') + '" aria-label="目前輸入" aria-live="polite">' + (l.buffer ? num(l.buffer) : '輸入數字') + '</div><button data-action="hint" class="hint-button"' + (l.hintsUsed >= l.cfg.hints || l.hintedSteps.has(l.step) ? ' disabled' : '') + '>✦ 求救卡 ' + (l.cfg.hints - l.hintsUsed) + '</button></div><div class="keypad" aria-label="第' + (l.id + 1) + '區數字鍵盤">' + keypad + '</div><div class="mini-footer"><span class="step-count">完成 ' + l.step + ' / ' + l.tasks.length + ' 格</span><span class="mistake-count">本題答錯 ' + l.mistakes + ' 次</span><button class="text-button" style="padding:0;font-size:inherit" data-action="leave">結束本區</button></div></div>';
  }
  function work(l) {
    const t = l.tasks[l.step], ins = M.instruction(t, l.q, l.cfg.guided), current = t.stage;
    const text = l.feedback ? l.feedback.title : ins[0];
    const sub = l.feedback ? l.feedback.sub : ins[1];
    return '<div class="question-line"><span><span class="stars">' + '★'.repeat(l.q.degree - 1) + '</span> 第 ' + (l.question + 1) + ' / ' + l.questions.length + ' 題</span><span class="pause-badge">' + (pausedAt ? '已暫停' : '') + '</span><b class="timer' + (l.cfg.seconds && remaining(l) < 30 ? ' urgent' : '') + '">' + (l.cfg.seconds ? duration(remaining(l)) : '不限時') + '</b></div><div class="question-card"><p class="question-label">完成下列綜合除法，求商式與餘式</p><div class="equation">(' + M.polynomial(l.q.a) + ') <span class="divisor-tag">÷ (' + M.divisor(l.q.c) + ')</span></div></div><div class="stage-track">' + ['代入數', '係數排列', '帶下・乘・加', '商式與餘式'].map((x, i) => '<span class="' + (i === current ? 'current' : i < current ? 'done' : '') + '">' + x + '</span>').join('') + '</div>' + (current === 3 ? '<div class="completed-table-mini">' + reviewTable(l.q) + '</div>' + output(l) : table(l)) + '<div class="energy-meter"><span style="width:' + (100 * l.step / l.tasks.length) + '%"></span></div><div class="operation-box ' + (l.feedback ? l.feedback.type : '') + '" aria-live="polite"><div class="operation-title">' + text + '</div><div class="operation-sub">' + sub + '</div></div>';
  }

  function reviewTable(q) {
    let s = '<div class="review-table" style="--cols:' + (q.degree + 1) + '">';
    s += q.a.map(v => '<span>' + num(v) + '</span>').join('') + '<span class="review-root">' + num(q.c) + '</span><span>↓</span>';
    s += q.products.slice(1).map(v => '<span>' + num(v) + '</span>').join('') + '<span></span>';
    s += q.bottom.map(v => '<span class="review-bottom">' + num(v) + '</span>').join('') + '<span></span></div>';
    return s;
  }
  function review(l) {
    const timeout = l.timedOut;
    return '<div class="lane-body question-complete ' + (!timeout ? 'celebrate' : '') + '"><div class="completion-icon' + (timeout ? ' timeout' : '') + '">' + (timeout ? '◷' : 'ϟ') + '</div><div><p class="eyebrow">' + (timeout ? 'CHECK THE CIRCUIT' : 'MISSION COMPLETE') + '</p><h2>' + (timeout ? '時間到，一起看解答' : '能源接通！') + '</h2></div><div class="score-gain">+' + l.gain + '<small>本題得分</small></div>' + reviewTable(l.q) + '<div class="solution-card"><p class="solution-title">本題驗收結果</p><div class="solution-math">q(x) = ' + M.polynomial(l.q.quotient) + '<br>r = ' + num(l.q.remainder) + '</div><p class="identity">' + M.polynomial(l.q.a) + '<br>= (' + M.divisor(l.q.c) + ')(' + M.polynomial(l.q.quotient) + ') ' + (l.q.remainder < 0 ? '− ' + Math.abs(l.q.remainder) : '+ ' + l.q.remainder) + '</p></div><p class="result-caption">' + (timeout ? '本題未完成，不計分；下一題可以重新挑戰。' : '答錯 ' + l.mistakes + ' 次 · 使用 ' + l.hintsUsed + ' 張求救卡') + '</p><button class="start-button wide" data-action="next">' + (l.question + 1 < l.questions.length ? '下一題，繼續發電 →' : '查看本回合成果 →') + '</button></div>';
  }
  function done(l) {
    const all = l.questions.length, solved = l.finishedQuestions, accuracy = l.attempts ? Math.round(100 * l.correct / l.attempts) : 0;
    return '<div class="lane-body question-complete celebrate"><div class="completion-icon">✓</div><div><p class="eyebrow">' + (l.demo ? 'PRACTICE COMPLETE' : 'SHIFT COMPLETE') + '</p><h2>' + (l.demo ? '示範練習完成' : '本回合發電完成') + '</h2><p class="result-caption">' + (l.seat ? l.seat + ' 號工程師' : '工程師') + ' · ' + (l.id + 1) + ' 號發電站</p></div><div class="score-gain">' + l.score + '<small>總得分</small></div><div class="round-stats"><div class="stat-box"><b>' + solved + '/' + all + '</b><span>完成題數</span></div><div class="stat-box"><b>' + accuracy + '%</b><span>輸入正確率</span></div><div class="stat-box"><b>' + l.totalHints + '</b><span>使用求救卡</span></div></div><p class="result-caption">' + (l.demo ? '正式闖關也會由你完成所有欄位。' : '每完成一格，都是一次進步。') + '<br>本區已完成，可以直接換下一位同學。</p><div class="end-controls"><button data-action="new-player" class="start-button">換下一位工程師 →</button><button data-action="again" class="secondary">同一位再挑戰一次</button></div></div>';
  }
  function initQuestion(l) {
    l.q = l.questions[l.question]; l.tasks = M.makeTasks(l.q.a, l.q.c); l.step = 0; l.buffer = ''; l.feedback = null; l.hintsUsed = 0; l.hintedSteps = new Set(); l.mistakes = 0; l.state = 'playing'; l.deadline = (pausedAt || Date.now()) + l.cfg.seconds * 1000; l.questionStarted = Date.now(); render(l);
  }
  function start(l, demo = false, preserveSeat = false) {
    if (!preserveSeat) l.seat = $('.seat-select', laneEl(l.id))?.value || l.seat || '';
    l.cfg = structuredClone(settings); l.demo = demo;
    if (demo) { l.cfg.seconds = 0; l.cfg.hints = 3; l.cfg.guided = true; l.questions = [{ a: [1, 0, -4, 1], c: 2, degree: 3, ...M.synthetic([1, 0, -4, 1], 2) }]; }
    else l.questions = M.makeRound(l.cfg);
    l.question = 0; l.score = 0; l.attempts = 0; l.correct = 0; l.finishedQuestions = 0; l.totalHints = 0; l.timeouts = 0; l.recorded = false; l.roundStarted = Date.now(); l.roundPauseMs = 0;
    initQuestion(l); beep('tap');
  }
  function celebrate(l) {
    const el = laneEl(l.id); el.classList.add('success-flash'); setTimeout(() => el.classList.remove('success-flash'), 180);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 8; i++) { const p = document.createElement('span'); p.className = 'energy-particle'; p.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px'); p.style.setProperty('--dy', (-40 - Math.random() * 180) + 'px'); el.appendChild(p); setTimeout(() => p.remove(), 850); }
  }
  function completeQuestion(l, timeout = false) {
    l.timedOut = timeout; l.state = 'review';
    l.gain = timeout ? 0 : M.points(l.mistakes, l.hintsUsed, remaining(l), l.cfg.seconds);
    l.score += l.gain; if (timeout) l.timeouts++; else l.finishedQuestions++;
    render(l); if (!timeout) { beep('win'); celebrate(l); }
  }
  function finish(l) {
    l.state = 'done';
    if (!l.recorded && !l.demo) {
      l.recorded = true;
      records.push({ time: new Date().toISOString(), station: l.id + 1, seat: l.seat, score: l.score, completed: l.finishedQuestions, total: l.questions.length, timeouts: l.timeouts, attempts: l.attempts, correct: l.correct, hints: l.totalHints, seconds: Math.max(0, Math.round((Date.now() - l.roundStarted - l.roundPauseMs) / 1000)) });
      records = records.slice(-100); writeStored(':records', records);
    }
    render(l); beep('win');
  }
  function input(l, key) {
    if (l.state !== 'playing' || pausedAt) return;
    if (l.cfg.seconds && remaining(l) <= 0) { completeQuestion(l, true); return; }
    if (key === 'enter') { submit(l); return; }
    if (key === 'back') l.buffer = l.buffer.slice(0, -1);
    else if (key === 'clear') l.buffer = '';
    else if (key === 'sign') l.buffer = l.buffer.startsWith('-') ? l.buffer.slice(1) : '-' + l.buffer;
    else if (/^\d$/.test(key)) { if (l.buffer.replace('-', '').length >= 4) return; if (l.buffer === '0') l.buffer = key; else if (l.buffer === '-0') l.buffer = '-' + key; else l.buffer += key; }
    updateEntry(l);
  }
  function updateEntry(l) {
    const el = laneEl(l.id), display = $('.entry-display', el);
    if (!display) return;
    display.textContent = l.buffer ? num(l.buffer) : '輸入數字'; display.classList.toggle('empty', !l.buffer);
    $('[data-key="enter"]', el).disabled = !l.buffer || l.buffer === '-';
  }
  function submit(l) {
    if (!l.buffer || l.buffer === '-') return;
    l.attempts++;
    if (Number(l.buffer) !== l.tasks[l.step].value) {
      l.mistakes++; const instruction = M.instruction(l.tasks[l.step], l.q, l.cfg.guided);
      l.feedback = { type: 'error', title: '還差一點，再檢查一次', sub: instruction[1] }; l.buffer = ''; render(l); beep('wrong'); return;
    }
    l.correct++; l.step++; l.buffer = ''; l.feedback = null;
    if (l.step === l.tasks.length) completeQuestion(l);
    else { render(l); beep('tap'); }
  }
  function useHint(l) {
    if (l.state !== 'playing' || pausedAt || l.hintsUsed >= l.cfg.hints || l.hintedSteps.has(l.step)) return;
    if (l.cfg.seconds && remaining(l) <= 0) { completeQuestion(l, true); return; }
    l.hintsUsed++; l.totalHints++; l.hintedSteps.add(l.step);
    l.feedback = { type: 'hint', title: '✦ 求救卡：' + M.hint(l.tasks[l.step], l.q), sub: '照著提示完成這一格，再繼續接通能源。' }; render(l);
  }
  function next(l) { if (l.state !== 'review') return; l.question++; if (l.question < l.questions.length) initQuestion(l); else finish(l); }
  function reset(l) { l.state = 'ready'; l.seat = ''; l.demo = false; l.score = 0; l.leaving = false; render(l); }
  function pause() { if (pausedAt) return; pausedAt = Date.now(); lanes.filter(l => l.state === 'playing').forEach(l => { const e = $('.pause-badge', laneEl(l.id)); if (e) e.textContent = '已暫停'; }); }
  function resume() {
    if (!pausedAt || $('dialog[open]')) return;
    const delta = Date.now() - pausedAt;
    lanes.forEach(l => { if (l.state === 'playing') l.deadline += delta; if (l.roundStarted && l.state !== 'ready' && l.state !== 'done') l.roundPauseMs += delta; });
    pausedAt = 0; lanes.filter(l => l.state === 'playing').forEach(l => { const e = $('.pause-badge', laneEl(l.id)); if (e) e.textContent = ''; });
  }
  function openDialog(id) { pause(); $('#' + id).showModal(); }
  function populateForm(c) {
    const f = $('#settings-form');
    [2, 3, 4].forEach((degree, i) => f.elements['count' + degree].value = c.counts[i]);
    for (const k of ['seconds', 'hints', 'coefficientMax', 'rootMax', 'missingRate', 'seatMin', 'seatMax']) f.elements[k].value = c[k];
    for (const k of ['shuffle', 'guided', 'leadingOne', 'includeZero']) f.elements[k].checked = c[k];
    $('#record-count').textContent = '目前有 ' + records.length + ' 筆成績紀錄。'; $('#settings-error').textContent = ''; $('#clear-records').textContent = '清除紀錄'; $('#clear-records').dataset.confirm = '';
  }
  function exportRecords() {
    if (!records.length) { toast('目前還沒有完成回合的成績。'); return; }
    const lines = [['時間（臺灣）', '發電站', '座號', '總分', '完成題數', '總題數', '逾時題數', '輸入次數', '正確次數', '使用求救卡', '回合秒數']];
    records.forEach(r => lines.push([new Date(r.time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }), r.station, r.seat, r.score, r.completed, r.total, r.timeouts, r.attempts, r.correct, r.hints, r.seconds]));
    const csv = '\uFEFF' + lines.map(row => row.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })), a = document.createElement('a'); a.href = url; a.download = '綜合除法能源工廠_成績_' + new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  lanes.forEach(l => { const el = document.createElement('section'); el.className = 'lane'; el.id = 'lane-' + l.id; el.setAttribute('aria-label', '第 ' + (l.id + 1) + ' 區發電站'); dom.appendChild(el); render(l); });
  window.ClassroomTouch.bind(dom, { activate(b) {
    const section = b.closest('.lane'); if (!section) return;
    const l = lanes[Number(section.id.slice(5))]; keyboardLane = l.id;
    if (b.dataset.key) { input(l, b.dataset.key); return; }
    const action = b.dataset.action;
    if (action === 'start') start(l);
    else if (action === 'demo') start(l, true);
    else if (action === 'hint') useHint(l);
    else if (action === 'next') next(l);
    else if (action === 'again') start(l, false, true);
    else if (action === 'new-player') reset(l);
    else if (action === 'leave') { if (l.leaving) reset(l); else { l.leaving = true; b.textContent = '確定結束？'; setTimeout(() => { l.leaving = false; const button = $('[data-action="leave"]', laneEl(l.id)); if (button) button.textContent = '結束本區'; }, 2500); } }
  } });
  dom.addEventListener('pointerdown', e => {
    const section = e.target.closest('.lane'); if (section) keyboardLane = Number(section.id.slice(5));
  }, { passive: true });
  dom.addEventListener('click', e => {
    const section = e.target.closest('.lane'); if (section) keyboardLane = Number(section.id.slice(5));
  });
  dom.addEventListener('change', e => { if (e.target.matches('.seat-select')) { const l = lanes[Number(e.target.closest('.lane').id.slice(5))]; l.seat = e.target.value; } });
  document.addEventListener('keydown', e => {
    if ($('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || e.target.matches('select,input,textarea')) return;
    if (e.target.matches('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const keys = { Enter: 'enter', Backspace: 'back', Delete: 'clear', Escape: 'clear', '-': 'sign' };
    if (/^\d$/.test(e.key) || keys[e.key]) { if (lanes[keyboardLane].state === 'playing') { e.preventDefault(); input(lanes[keyboardLane], keys[e.key] || e.key); } }
  });
  document.addEventListener('contextmenu', e => { if (e.target.closest('#lanes')) e.preventDefault(); });
  document.addEventListener('dragstart', e => e.preventDefault());
  $('#start-all').addEventListener('click', () => lanes.filter(l => l.state === 'ready').forEach(l => start(l)));
  $('#settings-btn').addEventListener('click', () => { populateForm(settings); openDialog('settings-dialog'); });
  $('#guide-btn').addEventListener('click', () => openDialog('guide-dialog'));
  const touchCounts = [0, 0, 0]; let touchMax = 0;
  window.ClassroomTouch.bind($('#touch-pads'), {
    activate(button, event) {
      $('b', button).textContent = ++touchCounts[Number(button.dataset.pad)];
      const type = event.pointerType || (event.type === 'touchstart' ? 'touch' : 'click');
      $('#touch-source').textContent = '最近輸入：' + ({ touch: '觸控', pen: '觸控筆', mouse: '滑鼠', click: '一般點擊／鍵盤' }[type] || type);
    },
    onContacts(contacts) {
      const count = contacts.filter(p => p.type === 'touch' || p.type === 'pen').length;
      touchMax = Math.max(touchMax, count);
      $('#touch-current').textContent = count; $('#touch-max').textContent = touchMax;
    }
  });
  $('#touch-test-btn').addEventListener('click', () => { openDialog('touch-dialog'); $('#settings-dialog').close(); });
  $('#touch-reset').addEventListener('click', () => {
    touchCounts.fill(0); $('#touch-pads').querySelectorAll('b').forEach(b => b.textContent = '0');
    touchMax = Number($('#touch-current').textContent); $('#touch-max').textContent = touchMax;
    $('#touch-source').textContent = '等待操作';
  });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('close', resume));
  $('#sound-btn').addEventListener('click', () => { sound = !sound; $('#sound-btn').textContent = '音效 ' + (sound ? '開' : '關'); $('#sound-btn').setAttribute('aria-pressed', String(sound)); beep('tap'); });
  $('#fullscreen-btn').addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { toast('此瀏覽器無法自動進入全螢幕，可使用 F11。'); } });
  document.addEventListener('fullscreenchange', () => { $('#fullscreen-btn').textContent = document.fullscreenElement ? '⛶ 離開全螢幕' : '⛶ 全螢幕'; });
  $('#defaults-btn').addEventListener('click', () => populateForm(DEFAULTS));
  $('#export-btn').addEventListener('click', exportRecords);
  $('#clear-records').addEventListener('click', e => { if (e.target.dataset.confirm === 'yes') { records = []; writeStored(':records', records); e.target.dataset.confirm = ''; e.target.textContent = '清除紀錄'; $('#record-count').textContent = '目前有 0 筆成績紀錄。'; } else { e.target.dataset.confirm = 'yes'; e.target.textContent = '再按一次確認清除'; setTimeout(() => { e.target.dataset.confirm = ''; e.target.textContent = '清除紀錄'; }, 3500); } });
  $('#settings-form').addEventListener('submit', e => {
    e.preventDefault(); const f = e.currentTarget;
    const c = { counts: [2, 3, 4].map(d => +f.elements['count' + d].value) };
    for (const k of ['seconds', 'hints', 'coefficientMax', 'rootMax', 'missingRate', 'seatMin', 'seatMax']) c[k] = +f.elements[k].value;
    for (const k of ['shuffle', 'guided', 'leadingOne', 'includeZero']) c[k] = f.elements[k].checked;
    if (!c.counts.some(Boolean)) { $('#settings-error').textContent = '請至少安排一題任務。'; return; }
    if (c.seatMax < c.seatMin) { $('#settings-error').textContent = '結束座號必須大於或等於起始座號。'; return; }
    settings = normalized(c); writeStored(':settings', settings); lanes.filter(l => l.state === 'ready').forEach(render); $('#settings-dialog').close(); toast('設定已儲存，將套用至下一回合。');
  });
  setInterval(() => {
    if (pausedAt) return;
    lanes.forEach(l => { if (l.state !== 'playing' || !l.cfg.seconds) return; const r = remaining(l); if (r <= 0) { completeQuestion(l, true); return; } const t = $('.timer', laneEl(l.id)); if (t) { const value = duration(r); if (t.textContent !== value) t.textContent = value; t.classList.toggle('urgent', r < 30); } });
  }, 200);
})();
