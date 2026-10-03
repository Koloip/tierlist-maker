'use strict';
// Tier List Maker — everything runs in the browser, images are stored in IndexedDB and never uploaded.

const REPO_URL = 'https://github.com/Koloip/tierlist-maker';  // shows the GitHub icon in the header; leave empty to hide it

const COLORS = ['#ff7f7f','#ffbf7f','#ffdf7f','#ffff7f','#bfff7f','#7fff7f','#7fffff','#7fbfff','#7f7fff','#ff7fff','#bf7fbf','#3b3b3b','#858585','#cfcfcf','#f7f7f7'];
const GEAR = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#fff"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>';
const UP = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const TOUCH = matchMedia('(hover: none)').matches;  // phones and tablets: no hover, no physical keyboard
if (TOUCH) document.documentElement.classList.add('touch');

let db, state, meta, project = 'default', view = 'tier', hovered = null, lastClicked = null, mx = 0, my = 0, dragIds = null, editTier = null, pair = null;
const images = new Map();   // id -> {id, project, name, key, blob, url}
const els = new Map();      // id -> .item element
const sel = new Set();
const recent = [];
const ph = document.createElement('div'); ph.className = 'placeholder';

/* ================= i18n ================= */
const LANG_KEY = 'tierlist.lang';
let lang = 'en', collator = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});

function detectLang() {
  try { const saved = localStorage.getItem(LANG_KEY); if (saved && I18N[saved]) return saved; } catch {}
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const code = l.toLowerCase().split('-')[0];
    if (I18N[code]) return code;
    if (code === 'be' || code === 'kk') return 'ru';
  }
  return 'en';
}
function t(key, vars) {
  let s = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);
  return s;
}
function applyI18n() {
  document.documentElement.lang = lang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  document.querySelectorAll('[data-i18n-html]').forEach(e => e.innerHTML = t(e.dataset.i18nHtml));
  document.querySelectorAll('[data-i18n-title]').forEach(e => e.title = t(e.dataset.i18nTitle));
  document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
  if (TOUCH) $('.hint').textContent = t('hint_touch');
}
function setLang(l) {
  lang = I18N[l] ? l : 'en';
  collator = new Intl.Collator(lang, {numeric: true, sensitivity: 'base'});
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  $('#lang').value = lang;
  applyI18n();
  if (!state) return;
  renderProjects(); renderAll(); updateSelBar();
  if (view === 'cmp') { renderScope(); updateStats(); }
  if (view === 'res') renderResults();
  spinLang();
}
$('#lang').innerHTML = Object.entries(I18N).map(([code, d]) => `<option value="${code}">${d.lang_name}</option>`).join('');
$('#lang').onchange = e => setLang(e.target.value);
if (REPO_URL) { $('#ghLink').href = REPO_URL; $('#ghLink').hidden = false; }

/* ================= storage ================= */
// Every list ("project") has its own state in kv; images carry the id of the list they belong to.
// The first list is 'default' and keeps the original key 'state', so data from older versions just works.
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('tierlist-maker', 2);
    r.onupgradeneeded = () => {
      const d = r.result, has = n => d.objectStoreNames.contains(n);
      if (!has('images')) d.createObjectStore('images', {keyPath: 'id'});
      if (!has('kv')) d.createObjectStore('kv');
      if (!has('spin')) d.createObjectStore('spin', {keyPath: 'id'});  // wheel / case images
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const tr = db.transaction(store, mode);
    const out = fn(tr.objectStore(store));
    tr.oncomplete = () => res(out instanceof IDBRequest ? out.result : undefined);
    tr.onerror = () => rej(tr.error);
    tr.onabort = () => rej(tr.error);
  });
}
const stateKey = p => p === 'default' ? 'state' : 'state:' + p;
const projOf = r => r.project || 'default';
let saveTimer;
function saveNow() {
  clearTimeout(saveTimer);
  return tx('kv', 'readwrite', s => s.put(state, stateKey(project))).catch(e => toast(t('t_save_fail', {e})));
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
const saveMeta = () => tx('kv', 'readwrite', s => s.put(meta, 'meta'));

function defaultState() {
  return {
    tiers: [['S',0],['A',1],['B',2],['C',3],['D',4]].map(([label, c]) => ({id: uid(), label, color: COLORS[c], items: []})),
    pool: [], elo: {}, history: [], scope: {}, topN: 0, cmpCount: 0, view: 'tier',
    settings: {}
  };
}
const DEFAULT_SETTINGS = {size: 120, aspect: 'portrait', captions: false, bg: '#1a1a17', poolH: 34, showUnrated: true};

/* ================= helpers ================= */
function toast(msg, ms = 2200) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), ms);
}
function cellW() {
  const s = state.settings;
  return Math.round(s.aspect === 'square' ? s.size : s.aspect === 'wide' ? s.size * 16 / 9 : s.size * 2 / 3);
}
function listOf(key) { return key === 'pool' ? state.pool : state.tiers.find(x => x.id === key).items; }
function removeEverywhere(ids) {
  const s = new Set(ids);
  state.pool = state.pool.filter(x => !s.has(x));
  state.tiers.forEach(x => x.items = x.items.filter(y => !s.has(y)));
}
// keep the lists consistent with the stored images: drop unknown ids and duplicates, put missing images into the pool
function reconcile() {
  const seen = new Set(), keep = id => images.has(id) && !seen.has(id) && seen.add(id);
  state.tiers.forEach(x => x.items = x.items.filter(keep));
  state.pool = state.pool.filter(keep);
  const missing = [...images.keys()].filter(id => !seen.has(id)).sort((a, b) => collator.compare(images.get(a).name, images.get(b).name));
  state.pool.push(...missing);
}
function makeEl(id) {
  const im = images.get(id);
  const d = document.createElement('div');
  d.className = 'item'; d.draggable = !TOUCH; d.dataset.id = id; d.title = im.name;
  const img = new Image(); img.src = im.url; img.alt = ''; img.draggable = false; img.decoding = 'async';
  const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = im.name;
  d.append(img, cap);
  return d;
}
function isImageFile(f) { return f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(f.name); }
function el(id) { let e = els.get(id); if (!e) { e = makeEl(id); els.set(id, e); } return e; }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
const fileSafe = s => (s || 'tierlist').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'tierlist';

/* ================= dialogs & menu ================= */
let dlgOk = null;
// body: element or HTML string; onOk may return false to keep the dialog open
function dialog({title, body, ok = t('ok'), onOk}) {
  $('#dlgTitle').textContent = title;
  const b = $('#dlgBody'); b.replaceChildren();
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  $('#dlgOk').textContent = ok; $('#dlgCancel').textContent = t('cancel');
  dlgOk = onOk;
  $('#dlg').classList.add('open');
  setTimeout(() => (b.querySelector('input[type=text]') || $('#dlgOk')).focus(), 0);
}
function closeDialog() { $('#dlg').classList.remove('open'); dlgOk = null; }
async function confirmDialog() { const fn = dlgOk; if (fn && (await fn()) === false) return; closeDialog(); }
$('#dlgOk').onclick = confirmDialog;
$('#dlgCancel').onclick = closeDialog;
$('#dlg').onmousedown = e => { if (e.target === $('#dlg')) closeDialog(); };
function askName(title, value, onOk) {
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = value; inp.className = 'dlg-input'; inp.maxLength = 80;
  dialog({title, body: inp, onOk: () => { const v = inp.value.trim(); if (!v) return false; return onOk(v); }});
  setTimeout(() => inp.select(), 0);
}

const menu = $('#menu');
$('#menuBtn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#menu')) menu.hidden = true; });
menu.onclick = e => {
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  menu.hidden = true;
  ({newProj, renameProj, deleteProj, exportProj, importProj: () => $('#fImport').click(), install: installApp})[act]?.();
};

/* ================= lists (projects) ================= */
const projName = p => p.name || t('proj_default');
function renderProjects() {
  $('#project').innerHTML = '';
  for (const p of meta.projects) {
    const o = document.createElement('option'); o.value = p.id; o.textContent = projName(p); $('#project').appendChild(o);
  }
  $('#project').value = project;
}
$('#project').onchange = e => switchProject(e.target.value);
async function switchProject(id) {
  await saveNow();
  meta.current = id; await saveMeta();
  location.reload();
}
function newProj() {
  askName(t('proj_new').replace(/^\+\s*|…$/g, ''), '', async name => {
    const id = uid(); meta.projects.push({id, name}); await switchProject(id);
  });
}
function renameProj() {
  const p = meta.projects.find(x => x.id === project);
  askName(t('proj_name'), projName(p), async name => { p.name = name; await saveMeta(); renderProjects(); });
}
async function deleteProj() {
  if (meta.projects.length < 2) { toast(t('t_proj_last')); return; }
  const p = meta.projects.find(x => x.id === project);
  if (!confirm(t('c_proj_delete', {name: projName(p)}))) return;
  clearTimeout(saveTimer);
  for (const store of ['images', 'spin']) {
    const ids = (await tx(store, 'readonly', s => s.getAll())).filter(r => projOf(r) === project).map(r => r.id);
    await tx(store, 'readwrite', s => ids.forEach(id => s.delete(id)));
  }
  await tx('kv', 'readwrite', s => s.delete(stateKey(project)));
  meta.projects = meta.projects.filter(x => x.id !== project);
  meta.current = meta.projects[0].id; await saveMeta();
  state = null;  // nothing must be saved for the deleted list
  location.reload();
}

/* ================= save to / open from file ================= */
// The file is JSON with the list's state and all its images as base64, so it can be moved to another browser or shared.
const FILE_FORMAT = 'tierlist-maker';
function blobToB64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
function b64ToBlob(b64, type) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], {type: type || 'image/jpeg'});
}
async function exportProj() {
  toast(t('t_exporting'), 60000);
  await saveNow();
  const pack = async map => {
    const out = [];
    for (const im of map.values()) out.push({id: im.id, name: im.name, key: im.key, type: im.blob.type, data: await blobToB64(im.blob)});
    return out;
  };
  const p = meta.projects.find(x => x.id === project);
  const data = {format: FILE_FORMAT, version: 1, name: projName(p), state, images: await pack(images), spin: await pack(simgs)};
  download(new Blob([JSON.stringify(data)], {type: 'application/json'}), fileSafe(projName(p)) + '.tierlist.json');
  toast(t('t_exported'));
}
// opens the file as a new list; all ids are renewed so it never collides with lists already in this browser
async function importProj(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (!data || data.format !== FILE_FORMAT || !data.state || !Array.isArray(data.images)) { toast(t('t_bad_file'), 4000); return; }
  toast(t('t_importing'), 60000);
  const id = uid(), map = new Map(), re = x => map.get(x) ?? x;
  const recs = store => (data[store] || []).map(r => { const nid = uid(); map.set(r.id, nid); return {id: nid, project: id, name: r.name, key: r.key, blob: b64ToBlob(r.data, r.type)}; });
  const imgs = recs('images'), spins = recs('spin');
  const s = data.state;
  s.tiers = (s.tiers || []).map(x => ({...x, items: (x.items || []).map(re)}));
  s.pool = (s.pool || []).map(re);
  s.elo = Object.fromEntries(Object.entries(s.elo || {}).map(([k, v]) => [re(k), v]));
  s.history = (s.history || []).map(h => ({...h, a: re(h.a), b: re(h.b)}));
  if (s.spin) for (const m of Object.values(s.spin)) {
    (m.items || []).forEach(it => { if (it.img) it.img = re(it.img); });
    for (const k of ['bg', 'snd']) if (m[k]) m[k] = re(m[k]);
  }
  await tx('images', 'readwrite', st => imgs.forEach(r => st.put(r)));
  await tx('spin', 'readwrite', st => spins.forEach(r => st.put(r)));
  await tx('kv', 'readwrite', st => st.put(s, stateKey(id)));
  const base = String(data.name || file.name.replace(/\.tierlist\.json$|\.json$/i, '')).slice(0, 80), taken = new Set(meta.projects.map(projName));
  let name = base;
  for (let k = 2; taken.has(name); k++) name = `${base} (${k})`;
  meta.projects.push({id, name});
  toast(t('t_imported'));
  await switchProject(id);
}
$('#fImport').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importProj(f); };

/* ================= install as an app (PWA) ================= */
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('#installItem').hidden = false; });
addEventListener('appinstalled', () => { installPrompt = null; $('#installItem').hidden = true; });
async function installApp() { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; $('#installItem').hidden = true; }
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

/* ================= settings ================= */
function applySettings() {
  const s = state.settings, r = document.documentElement.style;
  r.setProperty('--h', s.size + 'px');
  r.setProperty('--w', cellW() + 'px');
  r.setProperty('--tier-bg', s.bg);
  r.setProperty('--pool-h', s.poolH + 'vh');
  document.body.classList.toggle('captions', s.captions);
  $('#size').value = s.size; $('#aspect').value = s.aspect; $('#captions').checked = s.captions;
  $('#bg').value = s.bg; $('#showUnrated').checked = s.showUnrated;
}
$('#size').oninput = e => { state.settings.size = +e.target.value; applySettings(); save(); };
$('#aspect').onchange = e => { state.settings.aspect = e.target.value; applySettings(); save(); };
$('#captions').onchange = e => { state.settings.captions = e.target.checked; applySettings(); save(); };
$('#bg').oninput = e => { state.settings.bg = e.target.value; applySettings(); save(); };

/* ================= undo / redo (tier list layout) ================= */
const undoStack = [], redoStack = [];
const layout = () => JSON.stringify({tiers: state.tiers, pool: state.pool});
// call before every change of rows or of the images' placement
function snap() {
  undoStack.push(layout()); if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0; updateUndoBtns();
}
function restoreLayout(s) {
  const o = JSON.parse(s); state.tiers = o.tiers; state.pool = o.pool;
  reconcile(); clearSel(); renderAll(); save(); updateUndoBtns();
}
function undoTier() { if (!undoStack.length) { toast(t('t_nothing_undo')); return; } redoStack.push(layout()); restoreLayout(undoStack.pop()); }
function redoTier() { if (!redoStack.length) return; undoStack.push(layout()); restoreLayout(redoStack.pop()); }
function updateUndoBtns() { $('#undoTier').disabled = !undoStack.length; $('#redoTier').disabled = !redoStack.length; }
$('#undoTier').onclick = undoTier;
$('#redoTier').onclick = redoTier;

/* ================= render tier list ================= */
function renderTiers() {
  const wrap = $('#tiers'); wrap.innerHTML = '';
  state.tiers.forEach((tier, i) => {
    const row = document.createElement('div');
    row.className = 'tier'; row.dataset.tier = tier.id;
    row.innerHTML = `<div class="label" style="background:${tier.color}"><span class="kn">${i < 9 ? i + 1 : ''}</span><span class="txt"></span><span class="cnt"></span></div>
      <div class="items" data-list="${tier.id}"></div>
      <div class="ctrl"><button class="gear">${GEAR}</button>
        <div class="arrows"><button class="up">${UP}</button><button class="down">${DOWN}</button></div></div>`;
    row.querySelector('.txt').textContent = tier.label;
    row.querySelector('.gear').title = t('row_settings');
    row.querySelector('.up').title = t('up');
    row.querySelector('.down').title = t('down');
    const box = row.querySelector('.items');
    tier.items.forEach(id => box.appendChild(el(id)));
    wrap.appendChild(row);
  });
}
function renderPool() {
  const p = $('#pool');
  p.replaceChildren(...state.pool.map(el));
  if (!images.size) {
    const e = document.createElement('div'); e.className = 'empty';
    e.innerHTML = t('empty');
    p.appendChild(e);
  }
  applyFilter();
}
function updateCounts() {
  $('#poolCount').textContent = state.pool.length;
  state.tiers.forEach(tier => {
    const c = document.querySelector(`.tier[data-tier="${tier.id}"] .cnt`);
    if (c) c.textContent = tier.items.length || '';
  });
}
function renderAll() { renderTiers(); renderPool(); updateCounts(); updateSelBar(); }
function applyFilter() {
  const q = $('#search').value.trim().toLowerCase();
  for (const id of state.pool) el(id).style.display = !q || images.get(id).name.toLowerCase().includes(q) ? '' : 'none';
}
$('#search').oninput = applyFilter;

function syncFromDom() {
  state.tiers.forEach(tier => {
    const box = document.querySelector(`.items[data-list="${tier.id}"]`);
    tier.items = [...box.children].filter(c => c.dataset.id).map(c => c.dataset.id);
  });
  state.pool = [...$('#pool').children].filter(c => c.dataset.id).map(c => c.dataset.id);
}
function refreshHover() {
  const target = document.elementFromPoint(mx, my);
  hovered = target?.closest?.('#view-tier .item')?.dataset.id || null;
}
function moveTo(ids, key) {
  snap();
  removeEverywhere(ids);
  listOf(key).push(...ids);
  clearSel(); renderAll(); refreshHover(); save();
}

/* ================= selection ================= */
function setSel(id, on) { on ? sel.add(id) : sel.delete(id); el(id).classList.toggle('sel', on); updateSelBar(); }
function clearSel() { [...sel].forEach(id => { sel.delete(id); el(id).classList.remove('sel'); }); updateSelBar(); }
const selected = () => [...document.querySelectorAll('#view-tier .item.sel')].map(x => x.dataset.id);
// the bar at the bottom moves the selection with one tap — the main way to sort on a phone
function updateSelBar() {
  cancelAnimationFrame(updateSelBar.raf);
  updateSelBar.raf = requestAnimationFrame(() => {
    const bar = $('#selBar'), on = sel.size > 0 && view === 'tier';
    bar.hidden = !on; if (!on) return;
    $('#selCount').textContent = t('sel_n', {n: sel.size});
    const box = $('#selTiers'); box.innerHTML = '';
    state.tiers.forEach(x => {
      const b = document.createElement('button'); b.className = 'sel-tier'; b.style.background = x.color;
      b.textContent = (x.label.split('\n')[0] || '—').slice(0, 6); b.title = x.label; b.dataset.key = x.id; box.appendChild(b);
    });
    $('#selPool').title = t('sel_to_pool'); $('#selDel').title = t('sel_del'); $('#selClear').title = t('sel_clear');
  });
}
$('#selTiers').onclick = e => { const b = e.target.closest('[data-key]'); if (b) moveTo(selected(), b.dataset.key); };
$('#selPool').onclick = () => moveTo(selected(), 'pool');
$('#selClear').onclick = clearSel;
$('#selDel').onclick = () => { const ids = selected(); if (ids.length && confirm(t('c_delete', {n: ids.length}))) deleteImages(ids); };

let suppressClick = 0;
document.addEventListener('click', e => {
  const it = e.target.closest?.('#view-tier .item');
  if (!it || Date.now() < suppressClick) return;
  const id = it.dataset.id;
  const prev = lastClicked && els.get(lastClicked);
  if (e.shiftKey && prev && prev.parentNode === it.parentNode) {
    const kids = [...it.parentNode.children].filter(c => c.dataset.id && c.style.display !== 'none');
    let a = kids.indexOf(prev), b = kids.indexOf(it); if (a > b) [a, b] = [b, a];
    kids.slice(a, b + 1).forEach(k => setSel(k.dataset.id, true));
  } else setSel(id, !sel.has(id));
  lastClicked = id;
});
document.addEventListener('dblclick', e => {
  const it = e.target.closest?.('#view-tier .item');
  if (it && !it.closest('#pool')) moveTo([it.dataset.id], 'pool');
});
document.addEventListener('contextmenu', e => { if (TOUCH && e.target.closest?.('.item')) e.preventDefault(); });
document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, {passive: true});
document.addEventListener('mouseover', e => { hovered = e.target.closest?.('#view-tier .item')?.dataset.id || null; });

/* ================= drag & drop ================= */
function dropBox(target) {
  if (!(target instanceof Element)) return null;
  const row = target.closest('.tier'); if (row) return row.querySelector('.items');
  if (target.closest('.pool-panel')) return $('#pool');
  return null;
}
function insertPoint(box, x, y) {
  for (const c of box.children) {
    if (c === ph || !c.dataset.id || c.style.display === 'none') continue;
    const r = c.getBoundingClientRect();
    if (y < r.top) return c;
    if (y <= r.bottom && x < r.left + r.width / 2) return c;
  }
  return null;
}
function placeholderAt(target, x, y) {
  const box = view === 'tier' ? dropBox(target) : null;
  if (!box) return false;
  const before = insertPoint(box, x, y);
  if (ph.parentNode !== box || ph.nextSibling !== before) box.insertBefore(ph, before);
  return true;
}
function autoscroll(target, y) {
  const sc = target instanceof Element && target.closest('.scroll'); if (!sc) return;
  const r = sc.getBoundingClientRect(), z = 70;
  if (y < r.top + z) sc.scrollTop -= 22; else if (y > r.bottom - z) sc.scrollTop += 22;
}
function beginDrag(id) {
  dragIds = sel.has(id) && sel.size > 1 ? selected() : [id];
  requestAnimationFrame(() => dragIds && dragIds.forEach(x => el(x).classList.add('dragging')));
}
function finishDrop() {
  if (!ph.parentNode) return;
  snap();
  for (const id of dragIds) ph.parentNode.insertBefore(el(id), ph);
  ph.remove(); syncFromDom(); clearSel(); updateCounts(); save();
}
function endDrag() {
  ph.remove();
  if (dragIds) dragIds.forEach(x => el(x).classList.remove('dragging'));
  dragIds = null;
}
document.addEventListener('dragstart', e => {
  const it = e.target.closest?.('.item'); if (!it || !it.dataset.id) return;
  beginDrag(it.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', it.dataset.id);
});
document.addEventListener('dragend', endDrag);
document.addEventListener('dragover', e => {
  const isFiles = !dragIds && [...e.dataTransfer.types].includes('Files');
  if (!dragIds && !isFiles) return;
  autoscroll(e.target, e.clientY);
  if (isFiles) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; return; }
  if (!placeholderAt(e.target, e.clientX, e.clientY)) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
});
document.addEventListener('drop', e => {
  if (dragIds) { e.preventDefault(); finishDrop(); return; }
  if (e.dataTransfer.types.includes('Files')) {
    e.preventDefault();
    if (view === 'wheel' || view === 'case') { const m = view; filesFromDT(e.dataTransfer).then(files => addSpinFiles(files, m)); return; }
    const box = view === 'tier' ? dropBox(e.target) : null;
    const key = box ? box.dataset.list : 'pool';
    filesFromDT(e.dataTransfer).then(files => addFiles(files, key));
  }
});

// touch: hold an image for a moment, then drag it with the finger
let touch = null;
const ghost = document.createElement('div'); ghost.className = 'drag-ghost';
document.addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || view !== 'tier') return;
  const it = e.target.closest?.('#view-tier .item'); if (!it) return;
  const p = e.touches[0];
  touch = {x: p.clientX, y: p.clientY, started: false};
  touch.timer = setTimeout(() => startTouchDrag(it), 280);
}, {passive: true});
document.addEventListener('touchmove', e => {
  if (!touch) return;
  const p = e.touches[0];
  if (!touch.started) {
    if (Math.hypot(p.clientX - touch.x, p.clientY - touch.y) > 10) { clearTimeout(touch.timer); touch = null; }  // it is a scroll
    return;
  }
  e.preventDefault();
  touch.x = p.clientX; touch.y = p.clientY; moveTouchDrag();
}, {passive: false});
document.addEventListener('touchend', () => endTouch(true));
document.addEventListener('touchcancel', () => endTouch(false));
function startTouchDrag(it) {
  if (!touch) return;
  touch.started = true;
  beginDrag(it.dataset.id);
  navigator.vibrate?.(15);
  const r = it.getBoundingClientRect();
  ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
  ghost.replaceChildren(it.querySelector('img').cloneNode());
  if (dragIds.length > 1) { const n = document.createElement('span'); n.textContent = dragIds.length; ghost.appendChild(n); }
  document.body.appendChild(ghost);
  moveTouchDrag();
  const loop = () => {
    if (!touch?.started) return;
    autoscroll(document.elementFromPoint(touch.x, touch.y), touch.y);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function moveTouchDrag() {
  ghost.style.transform = `translate(${touch.x - ghost.offsetWidth / 2}px, ${touch.y - ghost.offsetHeight / 2}px)`;
  placeholderAt(document.elementFromPoint(touch.x, touch.y), touch.x, touch.y);
}
function endTouch(drop) {
  if (!touch) return;
  clearTimeout(touch.timer);
  if (touch.started) {
    if (drop) finishDrop();
    endDrag(); ghost.remove();
    suppressClick = Date.now() + 500;
  }
  touch = null;
}

async function filesFromDT(dt) {
  const entries = [...(dt.items || [])].filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return [...dt.files];
  const out = [];
  async function walk(en) {
    if (en.isFile) out.push(await new Promise((r, j) => en.file(r, j)));
    else if (en.isDirectory) {
      const rd = en.createReader(); let batch;
      do { batch = await new Promise((r, j) => rd.readEntries(r, j)); for (const x of batch) await walk(x); } while (batch.length);
    }
  }
  for (const en of entries) await walk(en);
  return out;
}

/* ================= add / delete images ================= */
async function addFiles(files, key = 'pool') {
  const existing = new Set([...images.values()].map(i => i.key));
  const recs = [];
  for (const f of files) {
    if (!isImageFile(f)) continue;
    const k = f.name + '|' + f.size;
    if (existing.has(k)) continue;
    existing.add(k);
    recs.push({id: uid(), project, name: f.name.replace(/\.[^.]+$/, ''), key: k, blob: f});
  }
  if (!recs.length) { toast(t('t_no_new')); return; }
  recs.sort((a, b) => collator.compare(a.name, b.name));
  toast(t('t_loading', {n: recs.length}), 10000);
  // store as plain Blob so it no longer depends on the original file on disk
  for (const r of recs) r.blob = new Blob([await r.blob.arrayBuffer()], {type: r.blob.type || 'image/jpeg'});
  await tx('images', 'readwrite', s => { recs.forEach(r => s.put(r)); });
  recs.forEach(r => images.set(r.id, {...r, url: URL.createObjectURL(r.blob)}));
  listOf(key).push(...recs.map(r => r.id));
  renderAll(); save();
  toast(t('t_added', {n: recs.length}));
}
async function deleteImages(ids) {
  removeEverywhere(ids);
  const s = new Set(ids);
  state.history = state.history.filter(h => !s.has(h.a) && !s.has(h.b));
  spinForget(ids);
  ids.forEach(id => {
    delete state.elo[id];
    const im = images.get(id); if (im) URL.revokeObjectURL(im.url);
    images.delete(id); els.get(id)?.remove(); els.delete(id); sel.delete(id);
  });
  await tx('images', 'readwrite', st => { ids.forEach(id => st.delete(id)); });
  pair = null; renderAll(); save();
}
$('#addFilesBtn').onclick = () => $('#fFiles').click();
$('#addDirBtn').onclick = () => $('#fDir').click();
$('#fFiles').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('#fDir').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('#wipeBtn').onclick = async () => {
  if (!images.size || !confirm(t('c_wipe', {n: images.size}))) return;
  await deleteImages([...images.keys()]);
  state.elo = {}; state.history = []; state.cmpCount = 0;
  undoStack.length = redoStack.length = 0; updateUndoBtns(); save();
};
$('#resetBtn').onclick = () => {
  if (!confirm(t('c_reset'))) return;
  snap();
  state.tiers.forEach(x => { state.pool.push(...x.items); x.items = []; });
  clearSel(); renderAll(); save();
};
$('#sortBtn').onclick = () => { snap(); state.pool.sort((a, b) => collator.compare(images.get(a).name, images.get(b).name)); renderPool(); save(); };
$('#shuffleBtn').onclick = () => {
  snap();
  const p = state.pool;
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  renderPool(); save();
};

/* ================= rows ================= */
$('#tiers').addEventListener('click', e => {
  const row = e.target.closest('.tier'); if (!row) return;
  const i = state.tiers.findIndex(x => x.id === row.dataset.tier);
  if (e.target.closest('.gear')) openTierModal(row.dataset.tier);
  else if (e.target.closest('.up') && i > 0) { snap(); [state.tiers[i - 1], state.tiers[i]] = [state.tiers[i], state.tiers[i - 1]]; renderAll(); save(); }
  else if (e.target.closest('.down') && i < state.tiers.length - 1) { snap(); [state.tiers[i + 1], state.tiers[i]] = [state.tiers[i], state.tiers[i + 1]]; renderAll(); save(); }
});
$('#tiers').addEventListener('dblclick', e => { const l = e.target.closest('.label'); if (l) openTierModal(l.parentNode.dataset.tier); });
function newTier() { return {id: uid(), label: t('new_row'), color: COLORS[state.tiers.length % COLORS.length], items: []}; }
$('#addRow').onclick = () => { snap(); state.tiers.push(newTier()); renderAll(); save(); };

let modalSnapped = false;
function openTierModal(id) {
  editTier = id; modalSnapped = false;
  const tier = curTier();
  const box = $('#mColors'); box.innerHTML = '';
  COLORS.forEach(c => {
    const b = document.createElement('button'); b.className = 'color' + (c === tier.color ? ' on' : ''); b.style.background = c; b.dataset.c = c;
    b.onclick = () => setTierColor(c); box.appendChild(b);
  });
  const cc = document.createElement('label'); cc.className = 'custom-color'; cc.title = t('custom_color');
  const ci = document.createElement('input'); ci.type = 'color'; ci.value = tier.color; ci.oninput = () => setTierColor(ci.value);
  cc.appendChild(ci); box.appendChild(cc);
  $('#mLabel').value = tier.label;
  $('#tierModal').classList.add('open');
  if (!TOUCH) setTimeout(() => $('#mLabel').focus(), 0);
}
function curTier() { return state.tiers.find(x => x.id === editTier); }
function snapOnce() { if (!modalSnapped) { snap(); modalSnapped = true; } }  // one undo step per editing session
function setTierColor(c) {
  snapOnce();
  curTier().color = c;
  document.querySelector(`.tier[data-tier="${editTier}"] .label`).style.background = c;
  document.querySelectorAll('#mColors .color').forEach(b => b.classList.toggle('on', b.dataset.c === c));
  save();
}
function closeModal() { $('#tierModal').classList.remove('open'); editTier = null; updateSelBar(); }
$('#mLabel').oninput = e => { snapOnce(); curTier().label = e.target.value; document.querySelector(`.tier[data-tier="${editTier}"] .txt`).textContent = e.target.value; save(); };
$('#mClose').onclick = closeModal;
$('#tierModal').onmousedown = e => { if (e.target === $('#tierModal')) closeModal(); };
$('#mDel').onclick = () => {
  snapOnce();
  const i = state.tiers.findIndex(x => x.id === editTier);
  state.pool.push(...state.tiers[i].items); state.tiers.splice(i, 1);
  delete state.scope[editTier]; closeModal(); renderAll(); save();
};
$('#mClear').onclick = () => { snapOnce(); const tier = curTier(); state.pool.push(...tier.items); tier.items = []; closeModal(); renderAll(); save(); };
$('#mAbove').onclick = () => { snapOnce(); const i = state.tiers.findIndex(x => x.id === editTier); state.tiers.splice(i, 0, newTier()); closeModal(); renderAll(); save(); };
$('#mBelow').onclick = () => { snapOnce(); const i = state.tiers.findIndex(x => x.id === editTier); state.tiers.splice(i + 1, 0, newTier()); closeModal(); renderAll(); save(); };

/* ================= splitter / presentation ================= */
$('#splitter').onpointerdown = e => {
  e.preventDefault();
  const sp = e.currentTarget; sp.setPointerCapture(e.pointerId);
  sp.onpointermove = ev => { state.settings.poolH = Math.min(80, Math.max(10, (innerHeight - ev.clientY) / innerHeight * 100)); applySettings(); };
  sp.onpointerup = sp.onpointercancel = () => { sp.onpointermove = sp.onpointerup = sp.onpointercancel = null; save(); };
};
function togglePresent(on) { document.body.classList.toggle('present', on); clearSel(); }
$('#presentBtn').onclick = () => togglePresent(true);
$('#exitPresent').onclick = () => togglePresent(false);

/* ================= PNG export ================= */
function drawCover(ctx, src, sw0, sh0, x, y, w, h) {
  const ir = sw0 / sh0, r = w / h; let sx, sy, sw, sh;
  if (ir > r) { sh = sh0; sw = sh * r; sx = (sw0 - sw) / 2; sy = 0; } else { sw = sw0; sh = sw / r; sx = 0; sy = (sh0 - sh) / 2; }
  ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
}
async function drawImages(ctx, jobs) {  // jobs: [id, x, y, w, h]
  for (let i = 0; i < jobs.length; i += 8) {
    await Promise.all(jobs.slice(i, i + 8).map(async ([id, x, y, w, h]) => {
      try { const bm = await createImageBitmap(images.get(id).blob); drawCover(ctx, bm, bm.width, bm.height, x, y, w, h); bm.close(); } catch {}
    }));
  }
}
function pickScale(W, H) { return Math.max(0.2, Math.min(2, 32000 / W, 32000 / H, Math.sqrt(220e6 / (W * H)))); }
function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const next = line ? line + ' ' + w : w;
      if (ctx.measureText(next).width > maxW && line) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out;
}
function canvasToFile(cv, name) {
  cv.toBlob(b => { if (b) { download(b, name); toast(t('t_done')); } else toast(t('t_too_big')); }, 'image/png');
}
$('#pngBtn').onclick = async () => {
  toast(t('t_building'), 20000);
  const ch = state.settings.size, cw = cellW(), labelW = 110;
  const boxW = document.querySelector('#tiers .items')?.clientWidth || 1000;
  const cols = Math.max(1, Math.floor(boxW / cw));
  const heights = state.tiers.map(x => Math.max(1, Math.ceil(x.items.length / cols)) * ch);
  const W = labelW + cols * cw, H = heights.reduce((a, b) => a + b, 0) + state.tiers.length - 1;
  const sc = pickScale(W, H);
  const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
  const ctx = cv.getContext('2d'); ctx.scale(sc, sc); ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const jobs = []; let y = 0;
  const fs = Math.min(30, Math.max(13, ch * .17));
  state.tiers.forEach((tier, i) => {
    const h = heights[i];
    ctx.fillStyle = tier.color; ctx.fillRect(0, y, labelW, h);
    ctx.fillStyle = state.settings.bg; ctx.fillRect(labelW, y, cols * cw, h);
    ctx.fillStyle = '#111'; ctx.font = `${fs}px system-ui, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, tier.label, labelW - 12), lh = fs * 1.2;
    lines.forEach((ln, k) => ctx.fillText(ln, labelW / 2, y + h / 2 + (k - (lines.length - 1) / 2) * lh));
    tier.items.forEach((id, k) => jobs.push([id, labelW + (k % cols) * cw, y + Math.floor(k / cols) * ch, cw, ch]));
    y += h + 1;
  });
  await drawImages(ctx, jobs);
  canvasToFile(cv, 'tierlist.png');
};

/* ================= compare (Elo) ================= */
function eloOf(id) { return state.elo[id] || (state.elo[id] = {r: 1500, n: 0, w: 0, l: 0, d: 0}); }
const K = n => n < 5 ? 48 : n < 15 ? 32 : 20;
const pkey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
function scopeBase() {
  const ids = [];
  if (state.scope.pool !== false) ids.push(...state.pool);
  state.tiers.forEach(x => { if (state.scope[x.id] !== false) ids.push(...x.items); });
  return ids;
}
function scopeIds() {
  let ids = scopeBase();
  const n = +state.topN || 0;
  if (n > 1 && ids.length > n) ids = ids.slice().sort((a, b) => eloOf(b).r - eloOf(a).r).slice(0, n);
  return ids;
}
function renderScope() {
  const box = $('#scope'); box.innerHTML = '';
  const add = (key, name, color, count) => {
    const l = document.createElement('label'); l.className = 'chip';
    l.innerHTML = `<input type="checkbox"${state.scope[key] !== false ? ' checked' : ''}><span class="dot" style="background:${color}"></span><span></span><span class="muted">${count}</span>`;
    l.querySelector('span:nth-of-type(2)').textContent = name;
    l.querySelector('input').onchange = e => { state.scope[key] = e.target.checked; save(); pair = null; showPair(); };
    box.appendChild(l);
  };
  state.tiers.forEach(x => add(x.id, x.label.split('\n')[0] || '—', x.color, x.items.length));
  add('pool', t('unranked'), '#666', state.pool.length);
  $('#topN').value = state.topN || 0;
}
$('#topN').onchange = e => { state.topN = Math.max(0, +e.target.value || 0); save(); pair = null; showPair(); };
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickPair() {
  const ids = shuffled(scopeIds());
  if (ids.length < 2) return null;
  // the least-compared image meets an opponent with a close rating (Swiss-style)
  const minN = Math.min(...ids.map(id => eloOf(id).n));
  const low = ids.filter(id => eloOf(id).n <= minN + 1);
  const a = low[Math.floor(Math.random() * low.length)], ra = eloOf(a).r;
  const others = ids.filter(x => x !== a).sort((x, y) => Math.abs(eloOf(x).r - ra) - Math.abs(eloOf(y).r - ra));
  let cand = others.slice(0, Math.max(3, Math.min(12, Math.ceil(others.length * .05)))).filter(b => !recent.includes(pkey(a, b)));
  if (!cand.length) cand = others;
  const b = cand[Math.floor(Math.random() * cand.length)];
  return Math.random() < .5 ? [a, b] : [b, a];
}
function showPair() {
  if (!pair || !images.has(pair[0]) || !images.has(pair[1])) pair = pickPair();
  const ok = !!pair;
  $('#arena').style.display = ok ? '' : 'none';
  $('#arenaEmpty').style.display = ok ? 'none' : 'flex';
  if (ok) document.querySelectorAll('#arena .card').forEach((c, i) => {
    const im = images.get(pair[i]); c.querySelector('img').src = im.url; c.querySelector('.nm').textContent = im.name;
  });
  updateStats();
}
function updateStats() {
  const ids = scopeIds(), n = ids.length;
  if (!n) { $('#stats').textContent = ''; $('#pfill').style.width = '0'; return; }
  const avg = ids.reduce((s, id) => s + eloOf(id).n, 0) / n;
  const target = Math.max(6, Math.ceil(Math.log2(Math.max(2, n))) + 2);
  $('#stats').textContent = t('stats', {c: state.cmpCount || 0, n, a: avg.toFixed(1), t: target});
  $('#pfill').style.width = Math.min(100, avg / target * 100) + '%';
}
function vote(res) {  // 0 = left wins, 1 = right wins, 0.5 = draw
  if (!pair) return;
  const [a, b] = pair, A = eloOf(a), B = eloOf(b);
  state.history.push({a, b, A: {...A}, B: {...B}});
  if (state.history.length > 1000) state.history.shift();
  const sa = res === 0 ? 1 : res === 1 ? 0 : .5;
  const ea = 1 / (1 + 10 ** ((B.r - A.r) / 400));
  const ka = K(A.n), kb = K(B.n);
  A.r += ka * (sa - ea); B.r += kb * (ea - sa);
  A.n++; B.n++;
  if (sa === 1) { A.w++; B.l++; } else if (sa === 0) { A.l++; B.w++; } else { A.d++; B.d++; }
  state.cmpCount = (state.cmpCount || 0) + 1;
  recent.push(pkey(a, b)); if (recent.length > 60) recent.shift();
  if (res !== .5) { const c = document.querySelectorAll('#arena .card')[res]; c.classList.add('pick'); setTimeout(() => c.classList.remove('pick'), 120); }
  save(); pair = null; showPair();
}
function skip() { if (pair) { recent.push(pkey(...pair)); if (recent.length > 60) recent.shift(); } pair = null; showPair(); }
function undo() {
  const h = state.history.pop(); if (!h) { toast(t('t_nothing_undo')); return; }
  state.elo[h.a] = h.A; state.elo[h.b] = h.B;
  state.cmpCount = Math.max(0, (state.cmpCount || 0) - 1);
  pair = [h.a, h.b]; save(); showPair();
}
document.querySelectorAll('#arena .card').forEach((c, i) => c.onclick = () => vote(i));
$('#drawBtn').onclick = () => vote(.5);
$('#skipBtn').onclick = skip;
$('#undoBtn').onclick = undo;
$('#resetElo').onclick = () => {
  if (!confirm(t('c_reset_elo'))) return;
  state.elo = {}; state.history = []; state.cmpCount = 0; recent.length = 0; pair = null; save(); showPair();
};

/* ================= results ================= */
function resIds() {
  const ids = scopeBase();
  const rated = ids.filter(id => eloOf(id).n > 0).sort((a, b) => eloOf(b).r - eloOf(a).r);
  const un = state.settings.showUnrated ? ids.filter(id => eloOf(id).n === 0) : [];
  return {rated, un};
}
function renderResults() {
  const {rated, un} = resIds(), g = $('#grid'), frag = document.createDocumentFragment();
  [...rated, ...un].forEach((id, i) => {
    const im = images.get(id), e = eloOf(id), isR = i < rated.length;
    const d = document.createElement('div');
    d.className = 'gitem' + (isR ? (i < 3 ? ' top' + (i + 1) : '') : ' unrated');
    d.title = isR ? t('tip_rank', {name: im.name, i: i + 1, r: Math.round(e.r), w: e.w, l: e.l, d: e.d}) : t('tip_unrated', {name: im.name});
    d.innerHTML = (isR ? `<span class="rank">${i + 1}</span>` : '') + `<img alt="" draggable="false" loading="lazy"><div class="cap"></div>`;
    d.querySelector('img').src = im.url; d.querySelector('.cap').textContent = im.name;
    frag.appendChild(d);
  });
  g.replaceChildren(frag);
  $('#resInfo').textContent = t('res_rated', {n: rated.length}) + (un.length ? t('res_unrated', {n: un.length}) : '') + t('res_scope');
}
$('#showUnrated').onchange = e => { state.settings.showUnrated = e.target.checked; save(); renderResults(); };
$('#resPng').onclick = async () => {
  const {rated} = resIds();
  if (!rated.length) { toast(t('t_compare_first')); return; }
  toast(t('t_building'), 20000);
  const ch = state.settings.size, cw = cellW(), gap = 6, pad = 14;
  const cols = Math.max(1, Math.floor(($('#grid').clientWidth - 2 * pad + gap) / (cw + gap)));
  const rows = Math.ceil(rated.length / cols);
  const W = pad * 2 + cols * (cw + gap) - gap, H = pad * 2 + rows * (ch + gap) - gap;
  const sc = pickScale(W, H);
  const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
  const ctx = cv.getContext('2d'); ctx.scale(sc, sc); ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, 0, W, H);
  const pos = rated.map((id, k) => [id, pad + (k % cols) * (cw + gap), pad + Math.floor(k / cols) * (ch + gap), cw, ch]);
  await drawImages(ctx, pos);
  const fs = Math.max(11, Math.min(20, ch * .11));
  ctx.font = `bold ${fs}px system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  pos.forEach(([, x, y], k) => {
    const label = String(k + 1), bw = ctx.measureText(label).width + fs * .8, bh = fs * 1.4;
    ctx.fillStyle = k === 0 ? '#c9a227' : k === 1 ? '#b8b8b8' : k === 2 ? '#b0703a' : 'rgba(0,0,0,.78)';
    ctx.fillRect(x + 4, y + 4, bw, bh);
    ctx.fillStyle = k < 3 ? '#111' : '#fff'; ctx.fillText(label, x + 4 + bw / 2, y + 4 + bh / 2 + 1);
  });
  canvasToFile(cv, 'ranking.png');
};

// put the compared images into the rows by rating; the shares per row are editable
$('#autoTier').onclick = () => {
  const {rated} = resIds();
  if (!rated.length) { toast(t('t_compare_first')); return; }
  const n = state.tiers.length;
  const defaults = n === 5 ? [10, 20, 30, 25, 15] : state.tiers.map((_, i) => Math.round(100 / n) + (i < 100 % n ? 1 : 0));
  const body = document.createElement('div');
  body.innerHTML = `<p class="muted dlg-hint"></p><div class="auto-rows"></div>`;
  body.querySelector('.dlg-hint').textContent = t('auto_hint');
  const rowsBox = body.querySelector('.auto-rows');
  state.tiers.forEach((x, i) => {
    const r = document.createElement('label'); r.className = 'auto-row';
    r.innerHTML = `<span class="auto-lbl"></span><input type="number" min="0" max="100" step="1"><span class="muted">%</span><span class="muted auto-n"></span>`;
    const lbl = r.querySelector('.auto-lbl'); lbl.textContent = x.label.split('\n')[0] || '—'; lbl.style.background = x.color;
    r.querySelector('input').value = defaults[i] ?? 0;
    rowsBox.appendChild(r);
  });
  const inputs = [...rowsBox.querySelectorAll('input')];
  const counts = () => {
    const p = inputs.map(x => Math.max(0, +x.value || 0)), sum = p.reduce((a, b) => a + b, 0) || 1;
    let acc = 0; const bounds = p.map(v => Math.round((acc += v) / sum * rated.length));
    return bounds.map((b, i) => b - (i ? bounds[i - 1] : 0));
  };
  const preview = () => counts().forEach((c, i) => rowsBox.children[i].querySelector('.auto-n').textContent = `→ ${c}`);
  rowsBox.oninput = preview; preview();
  dialog({title: t('auto_title'), body, ok: t('auto_apply'), onOk: () => {
    const cs = counts(); snap();
    removeEverywhere(rated);
    let k = 0;
    state.tiers.forEach((x, i) => { x.items = [...rated.slice(k, k + cs[i]), ...x.items]; k += cs[i]; });
    renderAll(); save(); setView('tier');
    toast(t('t_auto_done', {n: rated.length}));
  }});
};

/* ================= views & keys ================= */
function setView(v) {
  view = v; state.view = v; save();
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  document.querySelectorAll('.tier-only').forEach(x => x.style.display = v === 'tier' ? '' : 'none');
  const spinView = v === 'wheel' || v === 'case';
  document.querySelectorAll('.grid-opt').forEach(x => x.style.display = spinView ? 'none' : '');
  updateSelBar();
  if (v === 'cmp') { renderScope(); showPair(); }
  if (v === 'res') renderResults();
  if (spinView) spinShow(v);
}
document.querySelectorAll('.tab').forEach(x => x.onclick = () => setView(x.dataset.view));

// Physical key codes are used so shortcuts work on any keyboard layout (AZERTY, Cyrillic, …).
function digitOf(e) {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (m) return +m[1];
  return /^[0-9]$/.test(e.key) ? +e.key : null;
}
document.addEventListener('keydown', e => {
  if ($('#dlg').classList.contains('open')) {
    if (e.key === 'Escape') closeDialog();
    else if (e.key === 'Enter' && !e.target.matches('textarea')) { e.preventDefault(); confirmDialog(); }
    return;
  }
  if ($('#tierModal').classList.contains('open')) { if (e.key === 'Escape') closeModal(); return; }
  if (spinKey(e)) return;
  if (e.target.matches('input, textarea, select')) return;
  if (view === 'tier' && (e.ctrlKey || e.metaKey) && !e.altKey) {
    if (e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redoTier() : undoTier(); }
    else if (e.code === 'KeyY') { e.preventDefault(); redoTier(); }
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (view === 'tier') {
    const targets = () => sel.size ? selected() : hovered ? [hovered] : [];
    const n = digitOf(e);
    if (n !== null) {
      const ids = targets(); if (!ids.length) return;
      if (n === 0) moveTo(ids, 'pool'); else if (state.tiers[n - 1]) moveTo(ids, state.tiers[n - 1].id);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      document.body.classList.contains('present') ? togglePresent(false) : clearSel();
    } else if (e.key === 'Delete') {
      const ids = targets();
      if (ids.length && confirm(t('c_delete', {n: ids.length}))) deleteImages(ids);
    }
  } else if (view === 'cmp') {
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'Digit1' || c === 'Numpad1') vote(0);
    else if (c === 'ArrowRight' || c === 'Digit2' || c === 'Numpad2') vote(1);
    else if (c === 'ArrowUp' || c === 'Equal') vote(.5);
    else if (c === 'ArrowDown' || c === 'Space') skip();
    else if (c === 'KeyZ' || c === 'Backspace') undo();
    else return;
    e.preventDefault();
  }
});
addEventListener('pagehide', () => { if (state) saveNow(); });

/* ================= init ================= */
spinSetup();
setLang(detectLang());
(async () => {
  try { db = await openDB(); }
  catch { alert(t('idb_fail')); return; }
  navigator.storage?.persist?.();
  meta = await tx('kv', 'readonly', s => s.get('meta')) || {current: 'default', projects: [{id: 'default', name: ''}]};
  if (!meta.projects.some(p => p.id === meta.current)) meta.current = meta.projects[0].id;
  project = meta.current;
  const recs = (await tx('images', 'readonly', s => s.getAll())).filter(r => projOf(r) === project);
  recs.forEach(r => images.set(r.id, {...r, url: URL.createObjectURL(r.blob)}));
  state = await tx('kv', 'readonly', s => s.get(stateKey(project))) || defaultState();
  state.settings = {...DEFAULT_SETTINGS, ...state.settings};
  for (const k of ['elo', 'scope']) state[k] ||= {};
  state.history ||= [];
  reconcile();
  await spinLoad();
  renderProjects(); updateUndoBtns();
  applySettings(); renderAll(); setView(state.view || 'tier');
})();
