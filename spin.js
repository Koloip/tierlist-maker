'use strict';
// Wheel of fortune and a CS:GO-style case opening.
// Images added here live in a separate IndexedDB store ('spin'), so they never show up in the tier list pool.
// Items taken from the tier list point at the tier list's own images instead of copying them.
// This file only declares things: app.js calls spinSetup() on start and spinLoad() once the database is open.

const MODES = ['wheel', 'case'];
const TAU = Math.PI * 2;
const RARITIES = [  // CS:GO case colors and drop odds, %
  {c: '#4b69ff', p: 79.92}, {c: '#8847ff', p: 15.98}, {c: '#d32ce6', p: 3.2}, {c: '#eb4b4b', p: 0.64}, {c: '#e4ae39', p: 0.26},
];
const WHEEL_COLORS = ['#e6194b', '#f58231', '#e0a800', '#3cb44b', '#16a39a', '#4363d8', '#911eb4', '#f032e6', '#9a6324', '#2f8fd8', '#c2185b'];
const SPIN_DEFAULTS = {
  wheel: {items: [], dur: 6, sound: true, removeWin: false},
  case: {items: [], dur: 7, sound: true},
};
// item: {id, img: image id (spin store or tier list) or null for a text option, cap, off, r: rarity index, w: weight}
// the chance of an item is its weight divided by the sum of weights of all enabled items

const simgs = new Map();   // id -> {id, name, key, blob, url}
const imOf = id => id ? simgs.get(id) || images.get(id) : null;  // ids are unique across both stores
const thumbs = new Map();  // id -> {src, side}: downscaled copies for drawing the wheel
const spinTimers = {};
let spinning = false, wheelAngle = 0, wheelToken = 0, winShown = null, audioCtx = null, lastTick = 0;

const cfg = m => state.spin[m];
const enabledItems = m => cfg(m).items.filter(it => !it.off);
const secOf = m => document.getElementById('view-' + m);
function later(key, fn, ms) { clearTimeout(spinTimers[key]); spinTimers[key] = setTimeout(fn, ms); }

/* ================= setup & storage ================= */
function spinSetup() {
  for (const m of MODES) {
    const side = secOf(m).querySelector('.spin-side');
    side.innerHTML = `
      <div class="side-head"><h3><span data-i18n="sp_items"></span> <span class="muted scount"></span></h3></div>
      <div class="side-btns">
        <button class="btn primary" data-act="files" data-i18n="add_files"></button>
        <button class="btn primary" data-act="dir" data-i18n="add_folder"></button>
        <button class="btn" data-act="text" data-i18n="sp_add_text"></button>
        <button class="btn" data-act="tier" data-i18n="sp_from_tier"></button>
        <span class="spacer"></span>
        <button class="btn" data-act="equal" data-i18n="sp_equal"></button>
        <button class="btn" data-act="restore" data-i18n="sp_restore"></button>
        <button class="btn danger" data-act="clear" data-i18n="sp_clear"></button>
        <input type="file" class="f-files" multiple accept="image/*" hidden>
        <input type="file" class="f-dir" webkitdirectory multiple hidden>
      </div>
      <div class="slist scroll"></div>
      <details class="hist"><summary><span data-i18n="hist_title"></span> <span class="muted hcount"></span></summary>
        <div class="hist-list scroll"></div><button class="btn hclear" data-i18n="hist_clear"></button></details>`;
    const fFiles = side.querySelector('.f-files'), fDir = side.querySelector('.f-dir');
    side.querySelector('.side-btns').onclick = e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'files') fFiles.click();
      else if (act === 'dir') fDir.click();
      else if (act === 'text') addTextItem(m);
      else if (act === 'tier') addFromTier(m);
      else if (act === 'restore') { cfg(m).items.forEach(it => it.off = false); save(); itemsChanged(m, true); }
      else if (act === 'equal') { cfg(m).items.forEach(it => it.w = 1); save(); updatePct(m); itemsChanged(m); }
      else if (act === 'clear') {
        const n = cfg(m).items.length;
        if (n) ask(t('c_sp_clear', {n}), t('sp_clear')).then(ok => { if (ok) { cfg(m).items = []; save(); itemsChanged(m, true); gcSpinImages(); } });
      }
    };
    fFiles.onchange = fDir.onchange = e => { addSpinFiles([...e.target.files], m); e.target.value = ''; };
    bindList(m, side.querySelector('.slist'));
    side.querySelector('.hclear').onclick = () => { cfg(m).hist = []; save(); renderHist(m); };
    const sec = secOf(m), dur = sec.querySelector('.sdur'), snd = sec.querySelector('.ssound');
    dur.oninput = () => { cfg(m).dur = +dur.value; showDur(m); save(); };
    snd.onchange = () => { cfg(m).sound = snd.checked; save(); };
  }
  $('#wheelRemove').onchange = e => { cfg('wheel').removeWin = e.target.checked; save(); };
  $('#caseCs').onclick = applyCsOdds;
  $('#caseBg').onclick = () => $('#fCaseBg').click();
  $('#caseSnd').onclick = () => $('#fCaseSnd').click();
  $('#fCaseBg').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f && isImageFile(f)) setCaseAsset('bg', f); };
  $('#fCaseSnd').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) setCaseAsset('snd', f); };
  $('#caseBgOff').onclick = () => setCaseAsset('bg', null);
  $('#caseSndOff').onclick = () => setCaseAsset('snd', null);
  $('#wheelSpin').onclick = $('#wheelHub').onclick = $('#wheelCv').onclick = () => spinWheel();
  $('#caseOpen').onclick = () => openCase();
  $('#winOk').onclick = () => closeWin(false);
  $('#winExclude').onclick = () => closeWin(true);
  $('#winModal').onmousedown = e => { if (e.target === $('#winModal')) closeWin(false); };
  new ResizeObserver(layoutWheel).observe($('#wheelArea'));
  addEventListener('resize', () => later('case', renderCaseIdle, 250));
}

async function spinLoad() {
  const saved = state.spin || {};
  state.spin = {};
  for (const m of MODES) state.spin[m] = {...JSON.parse(JSON.stringify(SPIN_DEFAULTS[m])), ...saved[m]};
  const recs = (await tx('spin', 'readonly', s => s.getAll())).filter(r => (r.project || 'default') === project);
  recs.forEach(r => simgs.set(r.id, {...r, url: URL.createObjectURL(r.blob)}));
  // older versions copied tier list images here; point those items back at the originals so the copies get freed
  const tierByKey = new Map([...images.values()].map(im => [im.key, im.id]));
  for (const m of MODES) {
    cfg(m).items.forEach(it => { const k = simgs.get(it.img)?.key; if (tierByKey.has(k)) it.img = tierByKey.get(k); });
    cfg(m).items = cfg(m).items.filter(it => !it.img || imOf(it.img));
    cfg(m).items.forEach(it => { if (!(it.w >= 0)) it.w = 1; });
  }
  delete cfg('case').csOdds;  // replaced by the "CS:GO odds" button
  await gcSpinImages();
  spinLang();
}

function spinLang() {
  if (!state?.spin) return;
  for (const m of MODES) {
    const sec = secOf(m);
    sec.querySelector('.sdur').value = cfg(m).dur;
    sec.querySelector('.ssound').checked = cfg(m).sound;
    showDur(m); renderSpinList(m); renderHist(m);
  }
  $('#wheelRemove').checked = cfg('wheel').removeWin;
  applyCaseAssets();
  drawWheel();
}

/* ================= case background & win sound ================= */
// the user's own picture behind the case and own sound on a drop; stored like the other images, only in this browser
async function setCaseAsset(kind, file) {
  const c = cfg('case');
  if (file) {
    const id = uid(), rec = {id, project, name: file.name, key: kind + ':' + file.name + '|' + file.size,
      blob: new Blob([await file.arrayBuffer()], {type: file.type || (kind === 'bg' ? 'image/jpeg' : 'audio/mpeg')})};
    await tx('spin', 'readwrite', s => s.put(rec));
    simgs.set(id, {...rec, url: URL.createObjectURL(rec.blob)});
    c[kind] = id;
  } else delete c[kind];
  save(); await gcSpinImages(); applyCaseAssets();
  if (kind === 'snd' && file) playWinSound();
}
function applyCaseAssets() {
  const c = cfg('case'), bg = imOf(c.bg);
  const main = secOf('case').querySelector('.spin-main');
  main.style.backgroundImage = bg ? `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.55)), url("${bg.url}")` : '';
  main.classList.toggle('has-bg', !!bg);
  $('#caseBgOff').hidden = !bg; $('#caseSndOff').hidden = !imOf(c.snd);
}
function playWinSound() {
  const s = imOf(cfg('case').snd); if (!s) return false;
  const a = new Audio(s.url); a.play().catch(() => {});
  return true;
}

/* ================= particles ================= */
// a burst whose size and colors grow with the rarity: a few blue sparks for Mil-Spec, a gold shower for a rare special item
const FX = [
  {n: 40, sp: 7, colors: ['#4b69ff', '#9aaeff']},
  {n: 80, sp: 9, colors: ['#8847ff', '#c7a6ff', '#ffffff']},
  {n: 150, sp: 11, colors: ['#d32ce6', '#f7a3ff', '#ffffff'], ring: 1},
  {n: 240, sp: 13, colors: ['#eb4b4b', '#ff9e9e', '#ffd27a', '#ffffff'], ring: 2},
  {n: 380, sp: 15, colors: ['#e4ae39', '#ffd700', '#fff3b0', '#ffffff'], ring: 3, rain: 160},
];
const parts = [], rings = [];
let fxRunning = false;
function burst(x, y, level) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const f = FX[Math.max(0, Math.min(FX.length - 1, level))], cv = $('#fx');
  cv.width = innerWidth; cv.height = innerHeight;
  const pick = () => f.colors[Math.floor(Math.random() * f.colors.length)];
  for (let i = 0; i < f.n; i++) {
    const a = Math.random() * TAU, v = f.sp * (.3 + Math.random() * .9);
    parts.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - f.sp * .35, life: 1, decay: .008 + Math.random() * .012,
      size: 2 + Math.random() * 4, color: pick(), rect: Math.random() < .5, rot: Math.random() * TAU, vr: (Math.random() - .5) * .4});
  }
  for (let i = 0; i < (f.rain || 0); i++) {  // confetti falling over the whole screen
    parts.push({x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * .6, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3,
      life: 1, decay: .004 + Math.random() * .004, size: 4 + Math.random() * 5, color: pick(), rect: true, rot: Math.random() * TAU, vr: (Math.random() - .5) * .3, fall: true});
  }
  for (let i = 0; i < (f.ring || 0); i++) rings.push({x, y, r: 10, delay: i * 10, color: f.colors[0], life: 1});
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxFrame); }
}
function fxFrame() {
  const cv = $('#fx'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    if (p.fall) p.vx += (Math.random() - .5) * .2; else { p.vx *= .985; p.vy = p.vy * .985 + .18; }
    p.life -= p.decay;
    if (p.life <= 0 || p.y > cv.height + 30) { parts.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life * 1.5); ctx.fillStyle = p.color;
    if (p.rect) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, TAU); ctx.fill(); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    if (g.delay-- > 0) continue;
    g.r += 9; g.life -= .025;
    if (g.life <= 0) { rings.splice(i, 1); continue; }
    ctx.globalAlpha = g.life; ctx.strokeStyle = g.color; ctx.lineWidth = 6 * g.life;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (parts.length || rings.length) requestAnimationFrame(fxFrame);
  else { fxRunning = false; ctx.clearRect(0, 0, cv.width, cv.height); }
}
const centerOf = node => { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
function showDur(m) { secOf(m).querySelector('.sdur-v').textContent = `${cfg(m).dur} ${t('sp_sec')}`; }

function spinShow(v) {
  if (v === 'wheel') { layoutWheel(); drawWheel(); }
  else renderCaseIdle();
}

// images no item refers to any more are removed from the database
async function gcSpinImages() {
  const used = new Set([...MODES.flatMap(m => cfg(m).items.map(it => it.img)), cfg('case').bg, cfg('case').snd].filter(Boolean));
  const dead = [...simgs.keys()].filter(id => !used.has(id));
  if (!dead.length) return;
  dead.forEach(id => { URL.revokeObjectURL(simgs.get(id).url); simgs.delete(id); thumbs.delete(id); });
  await tx('spin', 'readwrite', s => dead.forEach(id => s.delete(id))).catch(() => {});
}

/* ================= adding items ================= */
function addSpinFiles(files, m) {
  const recs = files.filter(isImageFile).map(f => ({name: f.name.replace(/\.[^.]+$/, ''), key: f.name + '|' + f.size, blob: f}));
  recs.sort((a, b) => collator.compare(a.name, b.name));
  return addSpinRecords(m, recs);
}
// lets the user pick which rows of the tier list to take, then adds references to those images
function addFromTier(m) {
  if (spinning) return;
  if (!images.size) { toast(t('t_tier_empty')); return; }
  const lists = [...state.tiers.map(x => ({key: x.id, name: x.label.split('\n')[0] || '—', color: x.color, ids: x.items})),
    {key: 'pool', name: t('unranked'), color: '#666', ids: state.pool}].filter(l => l.ids.length);
  const body = document.createElement('div'); body.className = 'pick-list';
  for (const l of lists) {
    const row = document.createElement('label'); row.className = 'chip';
    row.innerHTML = `<input type="checkbox" checked><span class="dot" style="background:${l.color}"></span><span></span><span class="muted">${l.ids.length}</span>`;
    row.querySelector('span:nth-of-type(2)').textContent = l.name;
    row.querySelector('input').dataset.key = l.key;
    body.appendChild(row);
  }
  dialog({title: t('pick_title'), body, ok: t('pick_add'), onOk: () => {
    const keys = new Set([...body.querySelectorAll('input:checked')].map(x => x.dataset.key));
    addTierRefs(m, lists.filter(l => keys.has(l.key)).flatMap(l => l.ids));
  }});
}
function addTierRefs(m, ids) {
  const c = cfg(m), have = new Set(c.items.map(it => imOf(it.img)?.key).filter(Boolean)), w = newWeight(m), added = [];
  for (const id of ids) {
    const im = images.get(id);
    if (!im || have.has(im.key)) continue;
    have.add(im.key);
    added.push({id: uid(), img: id, cap: '', off: false, r: 0, w});
  }
  if (!added.length) { toast(t('t_no_new')); return; }
  c.items.push(...added);
  save(); itemsChanged(m, true);
  toast(t('t_added', {n: added.length}));
}
// tier list images were deleted: drop the items that pointed at them
function spinForget(ids) {
  if (!state?.spin) return;
  const s = new Set(ids);
  for (const m of MODES) {
    const before = cfg(m).items.length;
    cfg(m).items = cfg(m).items.filter(it => !s.has(it.img));
    if (cfg(m).items.length !== before) itemsChanged(m, true);
  }
  ids.forEach(id => thumbs.delete(id));
}
async function addSpinRecords(m, recs) {
  if (spinning) return;
  const c = cfg(m);
  const have = new Set(c.items.map(it => imOf(it.img)?.key).filter(Boolean));
  // the same picture is stored once: both modes share it, and a picture already in the tier list is reused
  const byKey = new Map([...simgs.values(), ...images.values()].map(s => [s.key, s.id]));
  const fresh = [], added = [], w = newWeight(m);
  for (const r of recs) {
    if (have.has(r.key)) continue;
    have.add(r.key);
    let id = byKey.get(r.key);
    if (!id) { id = uid(); fresh.push({id, project, name: r.name, key: r.key, blob: r.blob}); byKey.set(r.key, id); }
    added.push({id: uid(), img: id, cap: '', off: false, r: 0, w});
  }
  if (!added.length) { toast(t('t_no_new')); return; }
  toast(t('t_loading', {n: added.length}), 10000);
  // store as plain Blob so it no longer depends on the original file on disk
  for (const f of fresh) if (f.blob instanceof File) f.blob = new Blob([await f.blob.arrayBuffer()], {type: f.blob.type || 'image/jpeg'});
  if (fresh.length) await tx('spin', 'readwrite', s => fresh.forEach(r => s.put(r)));
  fresh.forEach(r => simgs.set(r.id, {...r, url: URL.createObjectURL(r.blob)}));
  c.items.push(...added);
  save(); itemsChanged(m, true);
  toast(t('t_added', {n: added.length}));
}
function addTextItem(m) {
  const c = cfg(m), it = {id: uid(), img: null, cap: t('sp_option', {n: c.items.length + 1}), off: false, r: 0, w: newWeight(m)};
  c.items.push(it); save(); itemsChanged(m, true);
  const inp = secOf(m).querySelector(`.srow[data-id="${it.id}"] .scap`);
  inp.focus(); inp.select(); inp.scrollIntoView({block: 'nearest'});
}

/* ================= item list ================= */
function renderSpinList(m) {
  const list = secOf(m).querySelector('.slist'), items = cfg(m).items;
  if (!items.length) { list.innerHTML = `<div class="empty">${t('sp_empty')}</div>`; updateCount(m); return; }
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const im = imOf(it.img);
    const row = document.createElement('div');
    row.className = 'srow' + (it.off ? ' off' : ''); row.dataset.id = it.id;
    row.innerHTML = `<input type="checkbox" class="son"${it.off ? '' : ' checked'}>
      <div class="sthumb">${im ? '<img alt="" loading="lazy" draggable="false">' : 'Aa'}</div>
      <input type="text" class="scap">${m === 'case' ? '<button class="rar"></button>' : ''}
      <label class="pctw"><input type="number" class="pct" min="0" max="100" step="any">%</label><button class="sdel">×</button>`;
    row.querySelector('.son').title = t('sp_toggle');
    row.querySelector('.pctw').title = t('sp_chance');
    row.querySelector('.sdel').title = t('sp_del');
    if (im) { row.querySelector('img').src = im.url; row.querySelector('.sthumb').title = im.name; }
    const cap = row.querySelector('.scap'); cap.value = it.cap; cap.placeholder = t(im ? 'sp_cap_ph' : 'sp_text_ph');
    if (m === 'case') paintRarity(row.querySelector('.rar'), it);
    frag.appendChild(row);
  }
  list.replaceChildren(frag);
  updatePct(m); updateCount(m);
}
function paintRarity(b, it) { b.style.background = RARITIES[it.r || 0].c; b.title = t('sp_rarity', {r: t('rar_' + (it.r || 0))}); }
function updateCount(m) { secOf(m).querySelector('.scount').textContent = `${enabledItems(m).length} / ${cfg(m).items.length}`; }
const fmtPct = p => (p *= 100, p === 0 || p >= .01 ? +p.toFixed(2) : +p.toPrecision(2));
function updatePct(m) {
  const on = enabledItems(m), w = weightsOf(m, on), pct = new Map(on.map((it, i) => [it.id, w[i]]));
  secOf(m).querySelectorAll('.srow').forEach(row => {
    const p = pct.get(row.dataset.id), inp = row.querySelector('.pct');
    inp.disabled = p === undefined;
    inp.value = p === undefined ? '' : fmtPct(p);
  });
}
function itemsChanged(m, rerender) {
  if (rerender) renderSpinList(m); else updateCount(m);
  if (m === 'wheel') later('wheel', drawWheel, 120); else later('case', renderCaseIdle, 250);
}
function bindList(m, list) {
  const find = e => {
    const row = e.target.closest('.srow');
    return row ? [row, cfg(m).items.find(x => x.id === row.dataset.id)] : [];
  };
  list.addEventListener('input', e => {
    if (!e.target.matches('.scap')) return;
    const [, it] = find(e); it.cap = e.target.value; save(); itemsChanged(m);
  });
  list.addEventListener('change', e => {
    const [row, it] = find(e); if (!it) return;
    if (e.target.matches('.son')) { it.off = !e.target.checked; row.classList.toggle('off', it.off); }
    else if (e.target.matches('.pct')) { if (e.target.value !== '') setChance(m, it, +e.target.value); }
    else return;
    save(); updatePct(m); itemsChanged(m);
  });
  list.addEventListener('click', e => {
    const [row, it] = find(e); if (!it) return;
    if (e.target.closest('.rar')) {
      it.r = ((it.r || 0) + 1) % RARITIES.length; paintRarity(e.target.closest('.rar'), it);
      save(); itemsChanged(m);
    } else if (e.target.closest('.sdel')) {
      cfg(m).items = cfg(m).items.filter(x => x !== it); row.remove();
      save(); cfg(m).items.length ? updatePct(m) : renderSpinList(m); itemsChanged(m); gcSpinImages();
    }
  });
}

/* ================= odds ================= */
// chances (summing to 1) of the given enabled items
function weightsOf(m, list) {
  const ws = list.map(it => Math.max(0, it.w ?? 1)), sum = ws.reduce((a, b) => a + b, 0);
  return sum > 0 ? ws.map(x => x / sum) : list.map(() => 1 / list.length);
}
// a new item gets an average weight, so it starts with a typical share
function newWeight(m) {
  const on = enabledItems(m);
  return on.length ? on.reduce((s, it) => s + Math.max(0, it.w ?? 1), 0) / on.length || 1 : 1;
}
// give the item exactly `pct` %; the other enabled items keep their proportions between each other
function setChance(m, it, pct) {
  const others = enabledItems(m).filter(x => x !== it);
  let rest = others.reduce((s, x) => s + Math.max(0, x.w ?? 1), 0);
  pct = Math.min(100, Math.max(0, pct));
  if (!others.length) return;
  if (pct >= 100) { others.forEach(x => x.w = 0); it.w = 1; return; }
  if (rest <= 0) { others.forEach(x => x.w = 1); rest = others.length; }
  it.w = pct / (100 - pct) * rest;
}
// the rarity's CS:GO chance is shared by all enabled items of that rarity
function applyCsOdds() {
  const items = cfg('case').items, on = items.filter(it => !it.off);
  const cnt = RARITIES.map((_, k) => on.filter(it => (it.r || 0) === k).length);
  items.forEach(it => { const r = it.r || 0; it.w = RARITIES[r].p / Math.max(1, cnt[r]); });
  save(); updatePct('case'); itemsChanged('case');
}
function pickWeighted(w) {
  let x = Math.random();
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
  return w.length - 1;
}

/* ================= animation & sound ================= */
const easeOut = p => 1 - Math.pow(1 - p, 4);
function animate(ms, step, done) {
  const t0 = performance.now();
  const frame = now => {
    const p = Math.min(1, (now - t0) / ms);
    step(easeOut(p));
    if (p < 1) requestAnimationFrame(frame); else done();
  };
  requestAnimationFrame(frame);
}
function setBusy(m, on) { spinning = on; secOf(m).classList.toggle('busy', on); }
function audio(on) {
  if (!on) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { audioCtx = null; }
}
function tick(freq) {
  const ac = audioCtx; if (!ac) return;
  const now = ac.currentTime; if (now - lastTick < .03) return; lastTick = now;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, now); o.frequency.exponentialRampToValueAtTime(freq / 3, now + .04);
  g.gain.setValueAtTime(.15, now); g.gain.exponentialRampToValueAtTime(.001, now + .05);
  o.connect(g).connect(ac.destination); o.start(now); o.stop(now + .06);
}
function ding() {
  const ac = audioCtx; if (!ac) return;
  const now = ac.currentTime;
  [[660, 0], [990, .1]].forEach(([f, d]) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(.001, now + d); g.gain.exponentialRampToValueAtTime(.22, now + d + .02); g.gain.exponentialRampToValueAtTime(.001, now + d + .8);
    o.connect(g).connect(ac.destination); o.start(now + d); o.stop(now + d + .85);
  });
}

/* ================= wheel ================= */
function layoutWheel() {
  const area = $('#wheelArea'), box = $('#wheelBox');
  const s = Math.floor(Math.min(area.clientWidth, area.clientHeight) - 40);
  if (s < 60) return;
  if (box.offsetWidth !== s) { box.style.width = box.style.height = s + 'px'; if (state?.spin) drawWheel(); }
}
const thumbSide = n => Math.round(Math.min(1024, Math.max(160, 2400 / Math.sqrt(Math.max(1, n)))));
async function makeThumb(id, side) {
  const im = imOf(id); if (!im) return;
  try {
    const bm = await createImageBitmap(im.blob);
    const k = Math.min(1, side / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bm.width * k)); c.height = Math.max(1, Math.round(bm.height * k));
    const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(bm, 0, 0, c.width, c.height); bm.close();
    thumbs.set(id, {src: c, side: k < 1 ? side : Infinity});
  } catch { thumbs.set(id, {src: null, side: Infinity}); }
}
async function drawWheel() {
  const cv = $('#wheelCv'), size = $('#wheelBox').clientWidth;
  if (!size || !state?.spin) return;
  const token = ++wheelToken, list = enabledItems('wheel'), side = thumbSide(list.length);
  paintWheel(cv, size, list);
  const missing = [...new Set(list.filter(it => it.img && !(thumbs.get(it.img)?.side >= side)).map(it => it.img))];
  if (!missing.length) return;
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(missing.slice(i, i + 8).map(id => makeThumb(id, side)));
    if (token !== wheelToken) return;
  }
  paintWheel(cv, size, list);
}
function wheelSegments(list) {
  const fr = weightsOf('wheel', list), starts = [];
  let acc = 0;
  for (const f of fr) { starts.push(acc); acc += f; }
  return {fr, starts};
}
// index of the segment that contains the position `pos` (0..1 of a turn)
function segmentAt(starts, pos) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo;
}
function segColor(i, n) {
  const L = WHEEL_COLORS.length;
  return WHEEL_COLORS[n > 1 && i === n - 1 && n % L === 1 ? 1 : i % L];  // never the same color as the first segment
}
function fitText(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1; }
  return s.slice(0, lo) + '…';
}
function paintWheel(cv, size, list) {
  const dpr = Math.min(2, devicePixelRatio || 1), px = Math.round(size * dpr);
  if (cv.width !== px || cv.height !== px) cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, px, px);
  ctx.translate(px / 2, px / 2); ctx.imageSmoothingQuality = 'high';
  const R = px / 2 - 3 * dpr, n = list.length;
  if (!n) {
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = '#2a2a2a'; ctx.fill();
    ctx.fillStyle = '#9a9a9a'; ctx.font = `${Math.round(R * .07)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t('sp_wheel_empty'), 0, -R * .4);
    return;
  }
  // segment i covers the angles [starts[i], starts[i] + fr[i]] (in turns) measured clockwise from the top,
  // so its size is exactly its chance
  const {fr, starts} = wheelSegments(list);
  const segs = list.map((it, i) => ({it, i, s: -Math.PI / 2 + starts[i] * TAU, a: fr[i] * TAU})).filter(g => g.a > 0);
  segs.forEach(({it, i, s, a}) => {
    const th = it.img && thumbs.get(it.img);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, s, s + a); ctx.closePath();
    ctx.fillStyle = it.img ? '#161616' : segColor(i, n); ctx.fill();
    if (th?.src) {
      // the picture covers the segment's bounding box, its top pointing to the rim
      ctx.clip(); ctx.rotate(s + a / 2 + Math.PI / 2);
      const hw = a >= Math.PI ? R : R * Math.sin(a / 2), below = a > Math.PI ? R : 0;
      drawCover(ctx, th.src, th.src.width, th.src.height, -hw, -R, hw * 2, R + below);
    }
    ctx.restore();
  });
  if (segs.length > 1 && segs.length <= 400) {
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = Math.max(1, Math.min(3, 300 / segs.length)) * dpr;
    ctx.beginPath();
    for (const {s} of segs) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(s) * R, Math.sin(s) * R); }
    ctx.stroke();
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#fff';
  for (const {it, s, a} of segs) {
    const txt = (it.cap || '').replace(/\s+/g, ' ').trim(), fs = Math.min(R * .075, R * a * .3);
    if (!txt || fs < 6 * dpr) continue;
    ctx.font = `700 ${fs}px system-ui, "Segoe UI", sans-serif`; ctx.lineWidth = fs * .25;
    ctx.save(); ctx.rotate(s + a / 2);
    const str = fitText(ctx, txt, R * .72);
    ctx.strokeText(str, R * .93, 0); ctx.fillText(str, R * .93, 0);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.lineWidth = 5 * dpr; ctx.strokeStyle = '#f2f2f2'; ctx.stroke();
}
function spinWheel() {
  if (spinning) return;
  const list = enabledItems('wheel');
  if (list.length < 2) { toast(t('sp_need2')); return; }
  const c = cfg('wheel'), cv = $('#wheelCv'), {fr, starts} = wheelSegments(list);
  const w = pickWeighted(fr);
  // the pointer is at the top: after turning by θ it points at the angle -θ of the unrotated wheel
  const start = wheelAngle, target = -(starts[w] + fr[w] * (.1 + Math.random() * .8)) * TAU;
  const end = start + Math.max(3, Math.round(c.dur * 1.1)) * TAU + ((target - start) % TAU + TAU) % TAU;
  const segAt = ang => segmentAt(starts, ((-ang % TAU) + TAU) % TAU / TAU);
  let seg = segAt(start);
  audio(c.sound); setBusy('wheel', true);
  animate(c.dur * 1000, p => {
    wheelAngle = start + (end - start) * p;
    cv.style.transform = `rotate(${wheelAngle}rad)`;
    const s = segAt(wheelAngle);
    if (s !== seg) { seg = s; if (c.sound) tick(900); }
  }, () => {
    wheelAngle = end % TAU; cv.style.transform = `rotate(${wheelAngle}rad)`;
    setBusy('wheel', false);
    if (c.sound) ding();
    burst(...centerOf($('#wheelBox')), 2);
    showWin('wheel', list[w]);
  });
}

/* ================= case ================= */
function caseCard(it) {
  const d = document.createElement('div'), im = imOf(it.img);
  d.className = 'ccard'; d.style.setProperty('--rc', RARITIES[it.r || 0].c);
  if (im) {
    const img = new Image(); img.src = im.url; img.alt = ''; img.draggable = false; img.decoding = 'async'; d.appendChild(img);
    if (it.cap) { const cap = document.createElement('div'); cap.className = 'ccap'; cap.textContent = it.cap; d.appendChild(cap); }
  } else {
    const x = document.createElement('div'); x.className = 'ctext'; x.textContent = it.cap; d.appendChild(x);
  }
  return d;
}
function fillStrip(items) {
  const strip = $('#caseStrip');
  strip.style.transform = 'translateX(0)';
  strip.replaceChildren(...items.map(caseCard));
  return strip;
}
function renderCaseIdle() {
  if (spinning || !state?.spin) return;
  const list = enabledItems('case');
  $('#caseEmpty').hidden = list.length > 0;
  if (!list.length) { $('#caseStrip').replaceChildren(); return; }
  const w = weightsOf('case', list);
  fillStrip(Array.from({length: 24}, () => list[pickWeighted(w)]));
}
function openCase() {
  if (spinning) return;
  const list = enabledItems('case');
  if (list.length < 2) { toast(t('sp_need2')); return; }
  const c = cfg('case'), w = weightsOf('case', list), win = pickWeighted(w);
  const winIdx = Math.max(25, Math.round(c.dur * 8));  // longer spin = more cards fly by
  const strip = fillStrip(Array.from({length: winIdx + 8}, (_, k) => list[k === winIdx ? win : pickWeighted(w)]));
  const cards = strip.children, step = cards[1].offsetLeft - cards[0].offsetLeft, cw = cards[0].offsetWidth;
  const W = $('#caseWin').clientWidth;
  // like in CS the marker may stop anywhere on the winning card, even near its edge
  const end = -(winIdx * step + cw / 2 + (Math.random() - .5) * cw * .9 - W / 2);
  let idx = Math.floor(W / 2 / step);
  audio(c.sound); setBusy('case', true);
  animate(c.dur * 1000, p => {
    const x = end * p;
    strip.style.transform = `translateX(${x}px)`;
    const k = Math.floor((W / 2 - x) / step);
    if (k !== idx) { idx = k; if (c.sound) tick(1500); }
  }, () => {
    cards[winIdx].classList.add('won');
    if (c.sound && !playWinSound()) ding();
    burst(...centerOf(cards[winIdx]), list[win].r || 0);
    setTimeout(() => { setBusy('case', false); showWin('case', list[win]); }, 450);
  });
}

/* ================= result ================= */
function showWin(m, it) {
  winShown = {m, it};
  logWin(m, it);
  const body = $('#winBody'), im = imOf(it.img);
  body.innerHTML = '';
  $('#winCard').style.setProperty('--rc', m === 'case' ? RARITIES[it.r || 0].c : '#f5c518');
  if (m === 'case') {
    const r = document.createElement('div'); r.className = 'win-rar'; r.textContent = t('rar_' + (it.r || 0)); body.appendChild(r);
  }
  if (im) {
    const img = new Image(); img.src = im.url; img.alt = ''; body.appendChild(img);
    const cap = document.createElement('div');
    cap.className = it.cap ? 'win-cap' : 'win-cap muted'; cap.textContent = it.cap || im.name; body.appendChild(cap);
  } else {
    const x = document.createElement('div'); x.className = 'win-text'; x.textContent = it.cap || '—'; body.appendChild(x);
  }
  $('#winExclude').hidden = m === 'wheel' && cfg('wheel').removeWin;
  $('#winModal').classList.add('open');
  document.activeElement?.blur?.();
}
function closeWin(exclude) {
  if (!winShown) return;
  const {m, it} = winShown; winShown = null;
  $('#winModal').classList.remove('open');
  if (exclude || (m === 'wheel' && cfg('wheel').removeWin)) { it.off = true; save(); itemsChanged(m, true); }
}

// returns true when the key belongs to the wheel / case (or the result window)
function spinKey(e) {
  if ($('#winModal').classList.contains('open')) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); closeWin(false); }
    return true;
  }
  if (view !== 'wheel' && view !== 'case') return false;
  if (e.target.matches('input, textarea, select, button') || e.ctrlKey || e.altKey || e.metaKey) return true;
  if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); view === 'wheel' ? spinWheel() : openCase(); }
  return true;
}

/* ================= history ================= */
// the last drops, newest first; the caption is copied so the entry stays readable if the item is removed later
function logWin(m, it) {
  const c = cfg(m);
  c.hist = [{img: it.img || null, cap: it.cap || imOf(it.img)?.name || '', r: it.r || 0, at: Date.now()}, ...(c.hist || [])].slice(0, 100);
  save(); renderHist(m);
}
function renderHist(m) {
  const box = secOf(m).querySelector('.hist-list'), hist = cfg(m).hist || [];
  secOf(m).querySelector('.hcount').textContent = hist.length || '';
  if (!hist.length) { box.innerHTML = `<div class="muted hist-empty">${t('hist_empty')}</div>`; return; }
  const fmt = new Intl.DateTimeFormat(lang, {hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'});
  box.replaceChildren(...hist.map(h => {
    const row = document.createElement('div'), im = imOf(h.img);
    row.className = 'hrow'; if (m === 'case') row.style.setProperty('--rc', RARITIES[h.r].c);
    row.innerHTML = `<div class="sthumb">${im ? '<img alt="" loading="lazy">' : 'Aa'}</div><span class="hname"></span><span class="muted htime"></span>`;
    if (im) row.querySelector('img').src = im.url;
    row.querySelector('.hname').textContent = h.cap || '—';
    row.querySelector('.htime').textContent = fmt.format(h.at);
    return row;
  }));
}