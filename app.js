'use strict';
// Tier List Maker — everything runs in the browser, images are stored in IndexedDB and never uploaded.

const REPO_URL = 'https://github.com/Koloip/tierlist-maker';  // GitHub link in the menu; leave empty to hide it
const DONATE_URL = 'https://boosty.to/prfast/donate';      // donation link in the menu; leave empty to hide it

const COLORS = ['#ff7f7f','#ffbf7f','#ffdf7f','#ffff7f','#bfff7f','#7fff7f','#7fffff','#7fbfff','#7f7fff','#ff7fff','#bf7fbf','#3b3b3b','#858585','#cfcfcf','#f7f7f7'];
const GEAR = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#fff"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>';
const UP = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
// the look is a personal choice for the whole app, so it lives in localStorage like the language
const THEME_KEY = 'tierlist.theme', THEMES = ['dark', 'pro', 'light', 'pixel', 'neon'];
function setTheme(name) {
  if (!THEMES.includes(name)) name = 'dark';
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem(THEME_KEY, name); } catch {}
  document.querySelector('#theme').value = name;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#252525');
  if (state) applySettings();
  if (typeof drawWheel === 'function' && state?.spin) drawWheel();
}
const TOUCH = matchMedia('(hover: none)').matches;  // phones and tablets: no hover, no physical keyboard
if (TOUCH) document.documentElement.classList.add('touch');

let db, state, meta, project = 'default', view = 'tier', hovered = null, lastClicked = null, mx = 0, my = 0, dragIds = null, editTier = null, pair = null;
document.querySelector('#theme').onchange = e => setTheme(e.target.value);
setTheme((() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })());
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
  spinLang(); refreshSrc(); twPaint();
}
$('#lang').innerHTML = Object.entries(I18N).map(([code, d]) => `<option value="${code}">${d.lang_name}</option>`).join('');
$('#lang').onchange = e => setLang(e.target.value);
if (REPO_URL) { $('#ghLink').href = REPO_URL; $('#ghLink').hidden = false; }
if (DONATE_URL) { $('#donateLink').href = DONATE_URL; $('#donateLink').hidden = false; }

/* ================= storage ================= */
// Every list ("project") has its own state in kv; images carry the id of the list they belong to.
// The first list is 'default' and keeps the original key 'state', so data from older versions just works.
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('tierlist-maker', 3);
    r.onupgradeneeded = () => {
      const d = r.result, has = n => d.objectStoreNames.contains(n);
      if (!has('images')) d.createObjectStore('images', {keyPath: 'id'});
      if (!has('kv')) d.createObjectStore('kv');
      if (!has('spin')) d.createObjectStore('spin', {keyPath: 'id'});  // wheel / case images
      if (!has('thumbs')) d.createObjectStore('thumbs', {keyPath: 'id'});  // small copies for the tiles
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
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); scheduleFolder(); }
const saveMeta = () => tx('kv', 'readwrite', s => s.put(meta, 'meta'));

// row presets for a new list; their labels need no translation
const TEMPLATES = {
  sd: ['S', 'A', 'B', 'C', 'D'],
  sf: ['S', 'A', 'B', 'C', 'D', 'E', 'F'],
  ten: ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
  stars: ['★★★★★', '★★★★', '★★★', '★★', '★'],
};
function defaultState(tpl = 'sd') {
  const rows = TEMPLATES[tpl] || TEMPLATES.sd;
  return {
    tiers: rows.map((label, i) => ({id: uid(), label, color: COLORS[Math.round(i * Math.min(1, 9 / Math.max(1, rows.length - 1)))], items: []})),
    pool: [], elo: {}, history: [], scope: {}, topN: 0, cmpCount: 0, view: 'tier',
    settings: {}
  };
}
const DEFAULT_SETTINGS = {size: 120, aspect: 'portrait', captions: false, bg: '#1a1a17', poolH: 34, showUnrated: true, zoom: true, pngHead: false, pngCaps: false, pngPool: false};

/* ================= helpers ================= */
// action: {label, fn} adds a button to the message, e.g. "Undo"
function toast(msg, ms = 2200, action) {
  const el = $('#toast'), b = $('#toastAct');
  $('#toastMsg').textContent = msg;
  b.hidden = !action;
  if (action) { b.textContent = action.label; b.onclick = () => { el.classList.remove('show'); action.fn(); }; }
  el.classList.toggle('has-act', !!action); el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), ms);
}
const toastUndo = msg => toast(msg, 6000, {label: t('undo_act'), fn: undoTier});
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
  d.className = 'item'; d.draggable = !TOUCH; d.dataset.id = id; d.title = tipOf(im);
  const img = new Image(); img.loading = 'lazy'; img.src = im.turl || im.url; img.alt = ''; img.draggable = false; img.decoding = 'async';
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
// what goes into the database: the in-memory record without its object URLs and the small copy
const recOf = ({url, turl, tblob, ...r}) => r;

/* ================= thumbnails ================= */
// Tiles are small, so they show a downscaled copy: decoding hundreds of full-size pictures is what makes big lists slow.
// The copies live in the 'thumbs' store (not for folder-only lists) and are made in the background for older pictures.
const THUMB = 360;  // px on the shorter side
const srcOf = id => { const im = imOf(id); return im ? im.turl || im.url : ''; };
const thumbQueue = new Set();
let thumbBusy = false;
async function makeThumb(blob) {
  const bm = await createImageBitmap(blob);
  const k = THUMB / Math.min(bm.width, bm.height);
  if (k > .75) { bm.close(); return null; }  // small enough as it is
  const cv = document.createElement('canvas');
  cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k);
  const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bm, 0, 0, cv.width, cv.height); bm.close();
  const out = await new Promise(r => cv.toBlob(r, 'image/webp', .85));
  return out && out.size < blob.size ? out : null;
}
function setThumb(id, blob) {
  const im = imOf(id); if (!im || !blob) return;
  if (im.turl) URL.revokeObjectURL(im.turl);
  im.tblob = blob; im.turl = URL.createObjectURL(blob);
  const img = els.get(id)?.querySelector('img'); if (img) img.src = im.turl;
}
function queueThumbs(ids) { ids.forEach(id => thumbQueue.add(id)); if (!thumbBusy) runThumbs(); }
async function runThumbs() {
  thumbBusy = true;
  let batch = [];
  const flush = async () => {
    const b = batch; batch = [];
    if (b.length && keepBlobs()) await tx('thumbs', 'readwrite', s => b.forEach(r => s.put(r))).catch(() => {});
  };
  for (const id of thumbQueue) {
    thumbQueue.delete(id);
    const im = imOf(id);
    if (!im?.blob || im.turl || im.blob.type === 'image/gif') continue;  // a GIF would lose its animation
    let blob = null;
    try { blob = await makeThumb(im.blob); } catch {}
    setThumb(id, blob);
    batch.push({id, project, blob});  // blob null: no copy needed, don't try again
    if (batch.length >= 25) await flush();
  }
  await flush();
  thumbBusy = false;
}
async function loadThumbs() {
  const done = new Set();
  for (const r of await tx('thumbs', 'readonly', s => s.getAll()).catch(() => [])) {
    if (projOf(r) !== project) continue;
    done.add(r.id); setThumb(r.id, r.blob);
  }
  queueThumbs([...images.keys(), ...simgs.keys()].filter(id => !done.has(id)));
}
function dropThumbs(ids) {
  ids.forEach(id => { const im = imOf(id); if (im?.turl) URL.revokeObjectURL(im.turl); });
  return tx('thumbs', 'readwrite', s => ids.forEach(id => s.delete(id))).catch(() => {});
}

/* ================= Steam games ================= */
// pictures made by tools/steam-import.ps1 carry steam: {appid, min (minutes played), last (unix time of the last launch)}
const fmtHours = min => new Intl.NumberFormat(lang, {maximumFractionDigits: min < 600 ? 1 : 0}).format(min / 60);
function playInfo(im) {
  const s = im?.steam; if (!s) return '';
  const out = [];
  if (s.min) out.push(t('play_h', {h: fmtHours(s.min)}));
  if (s.last) out.push(t('play_last', {d: new Date(s.last * 1000).toLocaleDateString(lang)}));
  return out.join(' · ');
}
const hasSteam = () => { for (const im of images.values()) if (im.steam) return true; return false; };

/* ================= dialogs & menu ================= */
let dlgOk = null, dlgCancel = null;
// body: element or HTML string; onOk may return false to keep the dialog open; ok: null hides the OK button
function dialog({title, body, ok = t('ok'), onOk, onCancel, danger = false, wide = false, cancel = t('cancel')}) {
  $('#dlgTitle').textContent = title;
  const b = $('#dlgBody'); b.replaceChildren();
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  $('#dlgOk').hidden = ok === null; $('#dlgOk').textContent = ok || '';
  $('#dlgOk').classList.toggle('danger-solid', danger);
  $('#dlgCancel').textContent = cancel;
  $('.dlg').classList.toggle('wide', wide);
  dlgOk = onOk; dlgCancel = onCancel;
  $('#dlg').classList.add('open');
  if (!TOUCH) setTimeout(() => (b.querySelector('input[type=text]') || ($('#dlgOk').hidden ? $('#dlgCancel') : $('#dlgOk'))).focus(), 0);
}
function closeDialog() { const c = dlgCancel; $('#dlg').classList.remove('open'); dlgOk = dlgCancel = null; c?.(); }
async function confirmDialog() {
  if ($('#dlgOk').hidden) { closeDialog(); return; }
  const fn = dlgOk; if (fn && (await fn()) === false) return;
  dlgCancel = null; closeDialog();
}
// a styled replacement for confirm(): resolves to true or false
const ask = (question, ok = t('ok'), danger = true) =>
  new Promise(res => dialog({title: question, ok, danger, onOk: () => res(true), onCancel: () => res(false)}));
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
// the View panel sits in the scrollable header, so it is positioned on the page to avoid being clipped
$('#viewBtn').onclick = e => {
  e.stopPropagation();
  const m = $('#viewMenu'); m.hidden = !m.hidden; if (m.hidden) return;
  const r = e.currentTarget.getBoundingClientRect();
  m.style.position = 'fixed'; m.style.top = r.bottom + 6 + 'px';
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
};
document.addEventListener('click', e => { if (!$('#viewMenu').hidden && !e.target.closest('#viewMenu')) $('#viewMenu').hidden = true; });
menu.onclick = e => {
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  menu.hidden = true;
  ({newProj, renameProj, deleteProj, exportProj, importProj: () => $('#fImport').click(), install: installApp, help: showHelp, storage: openStorage, group: openGroup, common: () => openCommonGames()})[act]?.();
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
  const body = document.createElement('div'); body.className = 'new-proj';
  body.innerHTML = '<input type="text" class="dlg-input" maxlength="80"><div class="muted"></div><div class="tpls"></div>';
  body.querySelector('.muted').textContent = t('proj_tpl');
  let tpl = 'sd';
  for (const [key, rows] of Object.entries(TEMPLATES)) {
    const b = document.createElement('button'); b.className = 'btn tpl' + (key === tpl ? ' on' : ''); b.type = 'button';
    b.textContent = rows.length > 5 ? `${rows[0]} … ${rows.at(-1)}` : rows.join(' ');
    b.onclick = () => { tpl = key; body.querySelectorAll('.tpl').forEach(x => x.classList.toggle('on', x === b)); };
    body.querySelector('.tpls').appendChild(b);
  }
  const inp = body.querySelector('input');
  dialog({title: t('proj_new').replace(/^\+\s*|…$/g, ''), body, onOk: async () => {
    const name = inp.value.trim(); if (!name) { inp.focus(); return false; }
    const id = uid(); meta.projects.push({id, name, tpl}); await switchProject(id);
  }});
}
function renameProj() {
  const p = meta.projects.find(x => x.id === project);
  askName(t('proj_name'), projName(p), async name => { p.name = name; await saveMeta(); renderProjects(); });
}
async function deleteProj() {
  if (meta.projects.length < 2) { toast(t('t_proj_last')); return; }
  const p = meta.projects.find(x => x.id === project);
  if (!await ask(t('c_proj_delete', {name: projName(p)}), t('sel_del'))) return;
  clearTimeout(saveTimer);
  for (const store of ['images', 'spin', 'thumbs']) {
    const ids = (await tx(store, 'readonly', s => s.getAll())).filter(r => projOf(r) === project).map(r => r.id);
    await tx(store, 'readwrite', s => ids.forEach(id => s.delete(id)));
  }
  await tx('kv', 'readwrite', s => { s.delete(stateKey(project)); s.delete(dirKey(project)); });
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
    for (const im of map.values()) out.push({id: im.id, name: im.name, note: im.note || '', key: im.key, steam: im.steam, type: im.blob.type, data: await blobToB64(im.blob)});
    return out;
  };
  const p = meta.projects.find(x => x.id === project);
  const data = {format: FILE_FORMAT, version: 1, name: projName(p), state, images: await pack(images), spin: await pack(simgs)};
  download(new Blob([JSON.stringify(data)], {type: 'application/json'}), fileSafe(projName(p)) + '.tierlist.json');
  p.backupAt = Date.now(); saveMeta();
  toast(t('t_exported'));
}
// opens the file as a new list; all ids are renewed so it never collides with lists already in this browser
async function importProj(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (!data || data.format !== FILE_FORMAT || !data.state || !Array.isArray(data.images)) { toast(t('t_bad_file'), 4000); return; }
  toast(t('t_importing'), 60000);
  const withBlobs = list => (list || []).map(r => ({...r, blob: b64ToBlob(r.data, r.type)}));
  await finishImport(data, withBlobs(data.images), withBlobs(data.spin), file.name.replace(/\.tierlist\.json$|\.json$/i, ''));
}
// shared by files and folders: stores the pictures and the state as a new list and switches to it
async function finishImport(data, imgsIn, spinsIn, fallbackName, folder = null) {
  const id = uid(), map = new Map(), re = x => map.get(x) ?? x;
  const recs = list => list.map(r => {
    const nid = uid(); map.set(r.id, nid);
    return {id: nid, project: id, name: r.name, note: r.note || '', key: r.key, ...(r.steam && {steam: r.steam}), blob: r.blob};
  });
  const imgs = recs(imgsIn), spins = recs(spinsIn);
  const s = data.state, reKeys = o => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [re(k), v]));
  s.tiers = (s.tiers || []).map(x => ({...x, items: (x.items || []).map(re)}));
  s.pool = (s.pool || []).map(re);
  s.elo = reKeys(s.elo || {});
  s.lead = reKeys(s.lead);
  if (s.group) { s.group.votes = reKeys(s.group.votes); s.group.labels = reKeys(s.group.labels); }
  s.history = (s.history || []).map(h => ({...h, a: re(h.a), b: re(h.b), ...(h.lead && {lead: re(h.lead)})}));
  if (s.spin) for (const m of Object.values(s.spin)) {
    (m.items || []).forEach(it => { if (it.img) it.img = re(it.img); });
    for (const k of ['bg', 'snd']) if (m[k]) m[k] = re(m[k]);
  }
  s.ownSet = (s.ownSet || []).map(re);
  if (s.tour) {
    s.tour.rounds.forEach(round => round.forEach(mt => { for (const k of ['a', 'b', 'w']) if (mt[k]) mt[k] = re(mt[k]); }));
    s.tour.hist.forEach(h => { if (h.elo) { h.elo.a = re(h.elo.a); h.elo.b = re(h.elo.b); } });
  }
  await tx('images', 'readwrite', st => imgs.forEach(r => st.put(r)));
  await tx('spin', 'readwrite', st => spins.forEach(r => st.put(r)));
  await tx('kv', 'readwrite', st => st.put(s, stateKey(id)));
  const base = String(data.name || fallbackName).slice(0, 80), taken = new Set(meta.projects.map(projName));
  let name = base;
  for (let k = 2; taken.has(name); k++) name = `${base} (${k})`;
  const p = {id, name, backupAt: Date.now()};  // it came from a file, a link or Steam, so no backup reminder yet
  meta.projects.push(p);
  if (folder) { await tx('kv', 'readwrite', st => st.put(folder, dirKey(id))); p.dir = folder.name; }
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
const tierBg = () => getComputedStyle(document.documentElement).getPropertyValue('--tier-bg').trim() || DEFAULT_SETTINGS.bg;
function applySettings() {
  const s = state.settings, r = document.documentElement.style;
  r.setProperty('--h', s.size + 'px');
  r.setProperty('--w', cellW() + 'px');
  // an untouched background follows the theme; a color picked by hand wins over it
  if (s.bg.toLowerCase() === DEFAULT_SETTINGS.bg) r.removeProperty('--tier-bg'); else r.setProperty('--tier-bg', s.bg);
  r.setProperty('--pool-h', s.poolH + 'vh');
  document.body.classList.toggle('captions', s.captions);
  $('#size').value = s.size; $('#aspect').value = s.aspect; $('#captions').checked = s.captions; $('#zoomOpt').checked = s.zoom;
  $('#bg').value = tierBg(); $('#showUnrated').checked = s.showUnrated;
  $('#bgReset').hidden = s.bg.toLowerCase() === DEFAULT_SETTINGS.bg;
}
$('#size').oninput = e => { state.settings.size = +e.target.value; applySettings(); save(); };
$('#aspect').onchange = e => { state.settings.aspect = e.target.value; applySettings(); save(); };
$('#captions').onchange = e => { state.settings.captions = e.target.checked; applySettings(); save(); };
$('#bg').oninput = e => { state.settings.bg = e.target.value; applySettings(); save(); };
$('#bgReset').onclick = () => { state.settings.bg = DEFAULT_SETTINGS.bg; applySettings(); save(); };

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
    row.querySelector('.label').draggable = !TOUCH;
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
  const steam = hasSteam();
  document.querySelectorAll('.steam-opt').forEach(o => o.hidden = !steam);
  $('#shareBtn').hidden = !steam;
}
function updateCounts() {
  $('#poolCount').textContent = state.pool.length;
  state.tiers.forEach(tier => {
    const c = document.querySelector(`.tier[data-tier="${tier.id}"] .cnt`);
    if (c) c.textContent = tier.items.length || '';
  });
}
function renderAll() { renderTiers(); renderPool(); updateCounts(); updateSelBar(); }
// in Unranked the non-matching images are hidden; in the rows they are dimmed so the layout stays readable
function filterTiles(ids) {
  const q = $('#search').value.trim().toLowerCase();
  for (const id of ids) {
    const e = el(id), im = images.get(id), hit = !q || (im.name + ' ' + (im.note || '')).toLowerCase().includes(q), inPool = e.parentNode?.id === 'pool';
    e.style.display = inPool && !hit ? 'none' : '';
    e.classList.toggle('dim', !inPool && !hit);
  }
}
function applyFilter() { filterTiles(state.pool); for (const x of state.tiers) filterTiles(x.items); }
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
  // moving just these tiles is far cheaper than rebuilding every row of a big list
  const box = key === 'pool' ? $('#pool') : document.querySelector(`.items[data-list="${key}"]`);
  ids.forEach(id => box.appendChild(el(id)));
  filterTiles(ids); clearSel(); updateCounts(); refreshHover(); save();
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
    $('#selCard').hidden = sel.size !== 1;
    $('#selPool').title = t('sel_to_pool'); $('#selDel').title = t('sel_del'); $('#selClear').title = t('sel_clear');
  });
}
$('#selTiers').onclick = e => { const b = e.target.closest('[data-key]'); if (b) moveTo(selected(), b.dataset.key); };
$('#selPool').onclick = () => moveTo(selected(), 'pool');
$('#selClear').onclick = clearSel;
$('#selDel').onclick = async () => { const ids = selected(); if (ids.length && await ask(t('c_delete', {n: ids.length}), t('sel_del'))) deleteImages(ids); };

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
  rowDrag = rowTarget = null;
  document.querySelectorAll('.row-dragging, .drop-before, .drop-after').forEach(x => x.classList.remove('row-dragging', 'drop-before', 'drop-after'));
}
// whole rows are dragged by their label (desktop); the arrows stay for phones
let rowDrag = null, rowTarget = null;
function rowDragOver(e) {
  const row = e.target instanceof Element && e.target.closest('#tiers .tier');
  document.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  autoscroll(e.target, e.clientY);
  if (!row) { rowTarget = null; return; }
  e.preventDefault();
  const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  row.classList.add(after ? 'drop-after' : 'drop-before');
  rowTarget = {id: row.dataset.tier, after};
}
function rowDrop() {
  if (!rowTarget || rowTarget.id === rowDrag) return;
  snap();
  const idx = id => state.tiers.findIndex(x => x.id === id);
  const [moved] = state.tiers.splice(idx(rowDrag), 1);
  state.tiers.splice(idx(rowTarget.id) + (rowTarget.after ? 1 : 0), 0, moved);
  renderAll(); save();
}
document.addEventListener('dragstart', e => {
  const lb = e.target.closest?.('#tiers .label');
  if (lb) {
    rowDrag = lb.parentNode.dataset.tier; lb.parentNode.classList.add('row-dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'row');
    return;
  }
  const it = e.target.closest?.('.item'); if (!it || !it.dataset.id) return;
  beginDrag(it.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', it.dataset.id);
});
document.addEventListener('dragend', endDrag);
document.addEventListener('dragover', e => {
  if (rowDrag) { rowDragOver(e); return; }
  const isFiles = !dragIds && [...e.dataTransfer.types].includes('Files');
  if (!dragIds && !isFiles) return;
  autoscroll(e.target, e.clientY);
  if (isFiles) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; return; }
  if (!placeholderAt(e.target, e.clientX, e.clientY)) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
});
document.addEventListener('drop', e => {
  if (rowDrag) { e.preventDefault(); rowDrop(); return; }
  if (dragIds) { e.preventDefault(); finishDrop(); return; }
  if (e.dataTransfer.types.includes('Files')) {
    e.preventDefault();
    if (view === 'wheel' || view === 'case') { const m = view; filesFromDT(e.dataTransfer).then(files => addSpinFiles(files, m)); return; }
    if (['cmp', 'res', 'tour'].includes(view) && ownSource()) { filesFromDT(e.dataTransfer).then(addOwnFiles); return; }
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
  if (keepBlobs()) await tx('images', 'readwrite', s => { recs.forEach(r => s.put(r)); });
  recs.forEach(r => images.set(r.id, {...r, url: URL.createObjectURL(r.blob)}));
  listOf(key).push(...recs.map(r => r.id));
  renderAll(); save();
  toast(t('t_added', {n: recs.length}));
  queueThumbs(recs.map(r => r.id));
}
async function deleteImages(ids) {
  removeEverywhere(ids);
  const s = new Set(ids);
  state.history = state.history.filter(h => !s.has(h.a) && !s.has(h.b));
  spinForget(ids);
  dropThumbs(ids);
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
  if (!images.size || !await ask(t('c_wipe', {n: images.size}), t('sel_del'))) return;
  await deleteImages([...images.keys()]);
  state.elo = {}; state.history = []; state.lead = {}; state.cmpCount = 0;
  undoStack.length = redoStack.length = 0; updateUndoBtns(); save();
};
$('#resetBtn').onclick = () => {
  snap();
  state.tiers.forEach(x => { state.pool.push(...x.items); x.items = []; });
  clearSel(); renderAll(); save(); toastUndo(t('reset') + ' ✓');
};
// ids start with the time they were added (see uid), so sorting by id sorts by date
const SORTS = {
  name: (a, b) => collator.compare(images.get(a).name, images.get(b).name),
  rating: (a, b) => (state.elo[b]?.n ? state.elo[b].r : -1e9) - (state.elo[a]?.n ? state.elo[a].r : -1e9) || SORTS.name(a, b),
  new: (a, b) => (a < b ? 1 : a > b ? -1 : 0),
  old: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  played: (a, b) => (images.get(b).steam?.min || 0) - (images.get(a).steam?.min || 0) || SORTS.name(a, b),
  recent: (a, b) => (images.get(b).steam?.last || 0) - (images.get(a).steam?.last || 0) || SORTS.name(a, b),
};
$('#sortSel').onchange = e => {
  const how = e.target.value; e.target.value = '';
  if (!how || state.pool.length < 2) return;
  snap();
  if (how === 'shuffle') state.pool = shuffled(state.pool); else state.pool.sort(SORTS[how]);
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
  delete state.scope[editTier]; closeModal(); renderAll(); save(); toastUndo(t('m_delete') + ' ✓');
};
$('#mClear').onclick = () => { snapOnce(); const tier = curTier(); state.pool.push(...tier.items); tier.items = []; closeModal(); renderAll(); save(); toastUndo(t('m_clear') + ' ✓'); };
$('#mAbove').onclick = () => { snapOnce(); const i = state.tiers.findIndex(x => x.id === editTier); state.tiers.splice(i, 0, newTier()); closeModal(); renderAll(); save(); };
$('#mBelow').onclick = () => { snapOnce(); const i = state.tiers.findIndex(x => x.id === editTier); state.tiers.splice(i + 1, 0, newTier()); closeModal(); renderAll(); save(); };

/* ================= splitter / presentation ================= */
$('#splitter').onpointerdown = e => {
  e.preventDefault();
  const sp = e.currentTarget; sp.setPointerCapture(e.pointerId);
  sp.onpointermove = ev => { state.settings.poolH = Math.min(80, Math.max(10, (innerHeight - ev.clientY) / innerHeight * 100)); applySettings(); };
  sp.onpointerup = sp.onpointercancel = () => { sp.onpointermove = sp.onpointerup = sp.onpointercancel = null; save(); };
};
function togglePresent(on) {
  document.body.classList.toggle('present', on); clearSel();
  if (!on && reveal) { reveal.order.forEach(id => els.get(id)?.classList.remove('unrev')); reveal = null; }
}
$('#presentBtn').onclick = () => togglePresent(true);

// reveal: a presentation where the images appear one by one, from the bottom row up to the top — made for streams
let reveal = null;
$('#revealBtn').onclick = () => {
  const order = [...state.tiers].reverse().flatMap(x => x.items);
  if (!order.length) return;
  togglePresent(true);
  reveal = {order, i: 0};
  order.forEach(id => el(id).classList.add('unrev'));
};
function revealStep(dir) {
  if (dir > 0 && reveal.i < reveal.order.length) {
    const e = el(reveal.order[reveal.i++]);
    e.classList.remove('unrev'); e.classList.add('pop');
    e.scrollIntoView({block: 'nearest'});
    setTimeout(() => e.classList.remove('pop'), 600);
    if (reveal.i === reveal.order.length) setTimeout(() => burst(...centerOf(e), 3), 250);
  } else if (dir < 0 && reveal.i > 0) el(reveal.order[--reveal.i]).classList.add('unrev');
}
document.addEventListener('click', e => {
  if (!reveal || e.target.closest('#exitPresent')) return;
  e.stopPropagation(); revealStep(1);
}, true);

function remindBackup() {
  const p = meta.projects.find(x => x.id === project), now = Date.now(), day = 864e5;
  if (images.size < 10 || now - (p.backupAt || 0) < 14 * day || now - (p.remindAt || 0) < 3 * day) return;
  p.remindAt = now; saveMeta();
  setTimeout(() => toast(t('t_backup'), 12000, {label: t('exp').replace(/…$/, ''), fn: exportProj}), 2500);
}
$('#exitPresent').onclick = () => togglePresent(false);

/* ================= PNG export ================= */
function drawCover(ctx, src, sw0, sh0, x, y, w, h) {
  const ir = sw0 / sh0, r = w / h; let sx, sy, sw, sh;
  if (ir > r) { sh = sh0; sw = sh * r; sx = (sw0 - sw) / 2; sy = 0; } else { sw = sw0; sh = sw / r; sx = 0; sy = (sh0 - sh) / 2; }
  ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
}
async function drawImages(ctx, jobs) {  // jobs: [id, x, y, w, h]
  const scale = ctx.getTransform().a;
  for (let i = 0; i < jobs.length; i += 8) {
    await Promise.all(jobs.slice(i, i + 8).map(async ([id, x, y, w, h]) => {
      // the small copy is enough when the cell in the picture is not bigger than it
      const im = imOf(id), blob = im.tblob && Math.max(w, h) * scale <= THUMB ? im.tblob : im.blob;
      try { const bm = await createImageBitmap(blob); drawCover(ctx, bm, bm.width, bm.height, x, y, w, h); bm.close(); } catch {}
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
// head: the list name on top; caps: names under the images; pool: Unranked as an extra grey row
async function renderTierCanvas({head, caps, pool}) {
  const ch = state.settings.size, cw = cellW(), labelW = 110, headH = head ? 64 : 0;
  const rows = state.tiers.map(x => ({label: x.label, color: x.color, items: x.items}));
  if (pool && state.pool.length) rows.push({label: t('unranked'), color: '#7a7a7a', items: state.pool});
  const boxW = document.querySelector('#tiers .items')?.clientWidth || 1000;
  const cols = Math.max(1, Math.floor(boxW / cw));
  const heights = rows.map(x => Math.max(1, Math.ceil(x.items.length / cols)) * ch);
  const W = labelW + cols * cw, H = headH + heights.reduce((a, b) => a + b, 0) + rows.length - 1;
  const sc = pickScale(W, H);
  const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
  const ctx = cv.getContext('2d'); ctx.scale(sc, sc); ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (head) {
    ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, 0, W, headH);
    ctx.fillStyle = '#fff'; ctx.font = `700 30px system-ui, "Segoe UI", sans-serif`;
    ctx.fillText(fitText(ctx, projName(meta.projects.find(p => p.id === project)), W - 40), W / 2, headH / 2);
  }
  const jobs = []; let y = headH;
  const fs = Math.min(30, Math.max(13, ch * .17));
  rows.forEach((row, i) => {
    const h = heights[i];
    ctx.fillStyle = row.color; ctx.fillRect(0, y, labelW, h);
    ctx.fillStyle = tierBg(); ctx.fillRect(labelW, y, cols * cw, h);
    ctx.fillStyle = '#111'; ctx.font = `${fs}px system-ui, "Segoe UI", sans-serif`;
    const lines = wrapText(ctx, row.label, labelW - 12), lh = fs * 1.2;
    lines.forEach((ln, k) => ctx.fillText(ln, labelW / 2, y + h / 2 + (k - (lines.length - 1) / 2) * lh));
    row.items.forEach((id, k) => jobs.push([id, labelW + (k % cols) * cw, y + Math.floor(k / cols) * ch, cw, ch]));
    y += h + 1;
  });
  await drawImages(ctx, jobs);
  if (caps) {
    const cfs = Math.max(10, Math.min(16, cw * .11));
    ctx.font = `600 ${cfs}px system-ui, "Segoe UI", sans-serif`;
    for (const [id, x, yy, w, h] of jobs) {
      const g = ctx.createLinearGradient(0, yy + h - cfs * 2.6, 0, yy + h);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
      ctx.fillStyle = g; ctx.fillRect(x, yy + h - cfs * 2.6, w, cfs * 2.6);
      ctx.fillStyle = '#fff'; ctx.fillText(fitText(ctx, images.get(id).name, w - 8), x + w / 2, yy + h - cfs * .8);
    }
  }
  return cv;
}
$('#pngBtn').onclick = () => {
  const s = state.settings, body = document.createElement('div'); body.className = 'png-opts';
  for (const [key, label] of [['pngHead', 'png_head'], ['pngCaps', 'png_caps'], ['pngPool', 'png_pool']]) {
    const l = document.createElement('label');
    l.innerHTML = '<input type="checkbox"> <span></span>'; l.querySelector('span').textContent = t(label);
    const c = l.querySelector('input'); c.checked = !!s[key]; c.onchange = () => { s[key] = c.checked; save(); };
    body.appendChild(l);
  }
  const opts = () => ({head: s.pngHead, caps: s.pngCaps, pool: s.pngPool});
  const copy = document.createElement('button'); copy.className = 'btn'; copy.textContent = t('png_copy');
  copy.onclick = () => {
    if (!navigator.clipboard?.write || !window.ClipboardItem) { toast(t('t_copy_fail'), 4000); return; }
    toast(t('t_building'), 20000);
    // the blob is passed as a promise so the copy still counts as part of this click
    const blob = renderTierCanvas(opts()).then(cv => new Promise(r => cv.toBlob(r, 'image/png')));
    navigator.clipboard.write([new ClipboardItem({'image/png': blob})])
      .then(() => { toast(t('t_copied'), 3500); closeDialog(); }).catch(() => toast(t('t_copy_fail'), 4000));
  };
  body.appendChild(copy);
  dialog({title: t('png_title'), body, ok: t('png_dl'), onOk: async () => {
    toast(t('t_building'), 20000);
    canvasToFile(await renderTierCanvas(opts()), fileSafe(projName(meta.projects.find(p => p.id === project))) + '.png');
  }});
};

/* ================= compare (Elo) ================= */
function eloOf(id) { return state.elo[id] || (state.elo[id] = {r: 1500, n: 0, w: 0, l: 0, d: 0}); }
const K = n => n < 5 ? 48 : n < 15 ? 32 : 20;
const pkey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
function scopeBase() {
  if (state.cmpSrc === 'own') return ownIds();
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
  if (!pair || !imOf(pair[0]) || !imOf(pair[1])) pair = pickPair();
  const ok = !!pair;
  $('#arena').style.display = ok ? '' : 'none';
  $('#arenaEmpty').style.display = ok ? 'none' : 'flex';
  if (ok) document.querySelectorAll('#arena .card').forEach((c, i) => {
    const im = imOf(pair[i]); c.querySelector('img').src = im.url; c.querySelector('.nm').textContent = im.name;
  });
  updateStats();
  twPaint();
}
function updateStats() {
  renderCmpTop();
  const ids = scopeIds(), n = ids.length;
  if (!n) { $('#stats').textContent = ''; $('#pfill').style.width = '0'; return; }
  const avg = ids.reduce((s, id) => s + eloOf(id).n, 0) / n;
  const target = Math.max(6, Math.ceil(Math.log2(Math.max(2, n))) + 2);
  $('#stats').textContent = t('stats', {c: state.cmpCount || 0, n, a: avg.toFixed(1), t: target});
  $('#pfill').style.width = Math.min(100, avg / target * 100) + '%';
}
// one Elo game between a and b; sa is a's score (1 win, 0.5 draw, 0 loss). Returns what is needed to undo it
function eloMatch(a, b, sa) {
  const A = eloOf(a), B = eloOf(b), snap = {a, b, A: {...A}, B: {...B}};
  const ea = 1 / (1 + 10 ** ((B.r - A.r) / 400));
  const ka = K(A.n), kb = K(B.n);
  A.r += ka * (sa - ea); B.r += kb * (ea - sa);
  A.n++; B.n++;
  if (sa === 1) { A.w++; B.l++; } else if (sa === 0) { A.l++; B.w++; } else { A.d++; B.d++; }
  state.cmpCount = (state.cmpCount || 0) + 1;
  snap.s = sa;  // the result, for the statistics
  return snap;
}
function vote(res) {  // 0 = left wins, 1 = right wins, 0.5 = draw
  if (!pair) return;
  const [a, b] = pair;
  const h = eloMatch(a, b, res === 0 ? 1 : res === 1 ? 0 : .5);
  // who is first after this vote: the statistics show who held the top the longest
  let lead = null;
  for (const id of scopeBase()) if (state.elo[id]?.n && (!lead || state.elo[id].r > state.elo[lead].r)) lead = id;
  if (lead) { state.lead ||= {}; state.lead[lead] = (state.lead[lead] || 0) + 1; h.lead = lead; }
  state.history.push(h);
  if (state.history.length > 1000) state.history.shift();
  recent.push(pkey(a, b)); if (recent.length > 60) recent.shift();
  if (res !== .5) { const c = document.querySelectorAll('#arena .card')[res]; c.classList.add('pick'); setTimeout(() => c.classList.remove('pick'), 120); }
  save(); pair = null; showPair();
}
function skip() { if (pair) { recent.push(pkey(...pair)); if (recent.length > 60) recent.shift(); } pair = null; showPair(); }
function undo() {
  const h = state.history.pop(); if (!h) { toast(t('t_nothing_undo')); return; }
  state.elo[h.a] = h.A; state.elo[h.b] = h.B;
  if (h.lead && state.lead?.[h.lead]) state.lead[h.lead]--;
  state.cmpCount = Math.max(0, (state.cmpCount || 0) - 1);
  pair = [h.a, h.b]; save(); showPair();
}
document.querySelectorAll('#arena .card').forEach((c, i) => c.onclick = () => vote(i));
$('#drawBtn').onclick = () => vote(.5);
$('#skipBtn').onclick = skip;
$('#undoBtn').onclick = undo;
$('#resetElo').onclick = async () => {
  if (!await ask(t('c_reset_elo'))) return;
  state.elo = {}; state.history = []; state.lead = {}; state.cmpCount = 0; recent.length = 0; pair = null; save(); showPair();
};

/* ================= results ================= */
function resIds() {
  const ids = scopeBase();
  const rated = ids.filter(id => eloOf(id).n > 0).sort((a, b) => eloOf(b).r - eloOf(a).r);
  const un = state.settings.showUnrated ? ids.filter(id => eloOf(id).n === 0) : [];
  return {rated, un};
}
// Results has two pages: the ranking grid and the statistics
function renderResults() {
  const stats = state.resMode === 'stats';
  $('#view-res').classList.toggle('mode-stats', stats);
  document.querySelectorAll('#resMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === (stats ? 'stats' : 'rank')));
  if (stats) renderStats($('#statsPanel')); else renderRanking();
}
$('#resMode').onclick = e => { const b = e.target.closest('[data-mode]'); if (!b) return; state.resMode = b.dataset.mode; save(); renderResults(); };
$('#groupBtn').onclick = () => openGroup();
$('#steamBtn').onclick = () => openSteamImport();
$('#shareBtn').onclick = () => openShare();
document.querySelectorAll('.tw-btn').forEach(b => b.onclick = () => openTwitch());
function renderRanking() {
  const {rated, un} = resIds(), g = $('#grid'), frag = document.createDocumentFragment();
  [...rated, ...un].forEach((id, i) => {
    const im = imOf(id), e = eloOf(id), isR = i < rated.length;
    const d = document.createElement('div');
    d.className = 'gitem' + (isR ? (i < 3 ? ' top' + (i + 1) : '') : ' unrated'); d.dataset.id = id;
    d.title = isR ? t('tip_rank', {name: im.name, i: i + 1, r: Math.round(e.r), w: e.w, l: e.l, d: e.d}) : t('tip_unrated', {name: im.name});
    d.innerHTML = (isR ? `<span class="rank">${i + 1}</span>` : '') + `<img alt="" draggable="false" loading="lazy"><div class="cap"></div>`;
    d.querySelector('img').src = im.turl || im.url; d.querySelector('.cap').textContent = im.name;
    frag.appendChild(d);
  });
  g.replaceChildren(frag);
  $('#resInfo').textContent = t('res_rated', {n: rated.length}) + (un.length ? t('res_unrated', {n: un.length}) : '') + t('res_scope');
}
$('#showUnrated').onchange = e => { state.settings.showUnrated = e.target.checked; save(); renderRanking(); };
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
    toastUndo(t('t_auto_done', {n: rated.length}));
  }});
};

/* ================= magnifier ================= */
// resting the cursor on a tile shows it big next to the cursor, with its name and note
const zoom = $('#zoom');
let zoomTimer = 0, zoomId = null;
function hideZoom() { clearTimeout(zoomTimer); zoomId = null; zoom.hidden = true; }
function placeZoom() {
  const w = zoom.offsetWidth, h = zoom.offsetHeight, gap = 18;
  let x = mx + gap; if (x + w > innerWidth - 8) x = mx - gap - w;
  const y = Math.max(8, Math.min(innerHeight - h - 8, my - h / 2));
  zoom.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
}
function showZoom(id) {
  const im = imOf(id); if (!im) return;
  zoomId = id;
  const img = zoom.querySelector('img'); img.onload = placeZoom; img.src = im.url;
  zoom.querySelector('.zoom-name').textContent = im.name;
  const n = zoom.querySelector('.zoom-note'), info = [playInfo(im), im.note].filter(Boolean).join('\n');
  n.textContent = info; n.hidden = !info;
  zoom.hidden = false; placeZoom();
}
document.addEventListener('mouseover', e => {
  const it = e.target.closest?.('#view-tier .item, #view-res .gitem');
  if (!it) { if (zoomId || !zoom.hidden) hideZoom(); return; }
  if (TOUCH || !state?.settings.zoom || dragIds || rowDrag || document.body.classList.contains('present') || it.dataset.id === zoomId) return;
  hideZoom();
  const id = it.dataset.id;
  zoomId = id; zoomTimer = setTimeout(() => zoomId === id && showZoom(id), 550);
});
document.addEventListener('mousemove', () => { if (!zoom.hidden) placeZoom(); }, {passive: true});
for (const ev of ['mousedown', 'wheel', 'keydown', 'dragstart']) document.addEventListener(ev, hideZoom, {passive: true, capture: true});
$('#zoomOpt').onchange = e => { state.settings.zoom = e.target.checked; save(); hideZoom(); };

/* ================= live top in Compare ================= */
function renderCmpTop() {
  const box = $('#cmpTop');
  const ids = scopeBase().filter(id => state.elo[id]?.n).sort((a, b) => state.elo[b].r - state.elo[a].r).slice(0, 10);
  box.hidden = !ids.length; if (!ids.length) return;
  const h = document.createElement('h4'); h.textContent = t('cmp_top', {n: ids.length});
  const ol = document.createElement('ol');
  for (const id of ids) {
    const im = imOf(id), li = document.createElement('li');
    li.innerHTML = '<img alt="" loading="lazy"><span></span>';
    li.querySelector('img').src = im.turl || im.url; li.querySelector('span').textContent = im.name; li.title = tipOf(im);
    ol.appendChild(li);
  }
  box.replaceChildren(h, ol);
}

/* ================= image card ================= */
// big preview with renaming, rating, moving to a row and deleting; right-click on desktop, ✎ in the selection bar on phones
function openCard(id) {
  const im = images.get(id); if (!im) return;
  const body = document.createElement('div'); body.className = 'card-view';
  body.innerHTML = `<img alt=""><div class="card-side"><label class="card-name"><span class="muted"></span><input type="text" maxlength="120"></label>
    <label class="card-name"><span class="muted card-note-lbl"></span><textarea class="card-note" rows="3" maxlength="1000"></textarea></label>
    <div class="muted card-rating"></div><div class="muted card-move-lbl"></div><div class="card-rows"></div>
    <button class="btn danger card-del"></button></div>`;
  body.querySelector('img').src = im.url;
  body.querySelector('.card-name span').textContent = t('card_name');
  const inp = body.querySelector('input'); inp.value = im.name;
  const note = body.querySelector('.card-note'); note.value = im.note || ''; note.placeholder = t('card_note_ph');
  body.querySelector('.card-note-lbl').textContent = t('card_note');
  const apply = () => updateImage(id, {name: inp.value, note: note.value});
  const e = state.elo[id];
  if (e?.n) {
    const place = Object.keys(state.elo).filter(k => images.has(k) && state.elo[k].n).sort((a, b) => state.elo[b].r - state.elo[a].r).indexOf(id) + 1;
    body.querySelector('.card-rating').textContent = t('card_rating', {i: place, r: Math.round(e.r), w: e.w, l: e.l, d: e.d});
  } else body.querySelector('.card-rating').textContent = t('card_unrated');
  if (im.steam) body.querySelector('.card-rating').textContent += '\n' + playInfo(im);
  body.querySelector('.card-move-lbl').textContent = t('card_move');
  const here = state.pool.includes(id) ? 'pool' : state.tiers.find(x => x.items.includes(id))?.id;
  const rows = body.querySelector('.card-rows');
  for (const r of [...state.tiers.map(x => ({key: x.id, name: x.label.split('\n')[0] || '—', color: x.color})), {key: 'pool', name: t('unranked'), color: '#7a7a7a'}]) {
    const b = document.createElement('button'); b.className = 'sel-tier' + (r.key === here ? ' here' : ''); b.style.background = r.color; b.textContent = r.name;
    b.onclick = async () => { await apply(); closeDialog(); if (r.key !== here) moveTo([id], r.key); };
    rows.appendChild(b);
  }
  const del = body.querySelector('.card-del'); del.textContent = t('sel_del');
  del.onclick = async () => { closeDialog(); if (await ask(t('c_delete', {n: 1}), t('sel_del'))) deleteImages([id]); };
  dialog({title: t('card_title'), body, wide: true, onOk: apply});
}
const tipOf = im => [im.name, playInfo(im), im.note].filter(Boolean).join('\n');
// saves a new name and/or note of an image; an empty name keeps the old one
async function updateImage(id, {name, note}) {
  const im = images.get(id); if (!im) return;
  name = String(name ?? im.name).trim() || im.name;
  note = String(note ?? im.note ?? '').trim();
  if (name === im.name && note === (im.note || '')) return;
  im.name = name; im.note = note;
  if (keepBlobs()) await tx('images', 'readwrite', s => s.put(recOf(im)));
  scheduleFolder();
  const e = els.get(id); if (e) { e.title = tipOf(im); e.querySelector('.cap').textContent = name; }
  if (view === 'res') renderResults();
  if (view === 'cmp') showPair();
}
document.addEventListener('contextmenu', e => {
  const it = e.target.closest?.('#view-tier .item, #view-res .gitem'); if (!it) return;
  e.preventDefault();
  if (!TOUCH || it.classList.contains('gitem')) openCard(it.dataset.id);  // on phones a long press on a tile is a drag
});
$('#grid').addEventListener('click', e => { const g = e.target.closest('.gitem'); if (g) openCard(g.dataset.id); });
$('#selCard').onclick = () => { const ids = selected(); if (ids.length === 1) openCard(ids[0]); };

// Ctrl+V: pasted pictures (screenshots, images copied in a browser) are added like dropped files
document.addEventListener('paste', e => {
  if (!state || e.target.matches?.('input, textarea')) return;
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const files = [...(e.clipboardData?.files || [])].filter(isImageFile)
    .map((f, i) => new File([f], `paste-${stamp}${i ? '-' + i : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, {type: f.type}));
  if (!files.length) return;
  e.preventDefault();
  if (view === 'wheel' || view === 'case') addSpinFiles(files, view); else addFiles(files);
});

function showHelp() {
  const body = document.createElement('div'); body.className = 'help';
  const sec = (title, html) => { const h = document.createElement('h4'); h.textContent = title; const p = document.createElement('p'); p.innerHTML = html; body.append(h, p); };
  sec(t('tab_tier'), (TOUCH ? t('hint_touch') : t('hint')) + '<br>' + t('undo_tip') + ' · ' + t('redo_tip') + '<br>' + t('help_more'));
  sec(t('reveal_btn'), t('reveal_tip'));
  sec(t('tab_cmp'), t('keys'));
  sec(t('tab_tour'), t('tour_keys'));
  sec(t('tab_wheel'), t('sp_keys_wheel'));
  sec(t('tab_case'), t('sp_keys_case'));
  dialog({title: t('help_title'), body, ok: null, cancel: t('close'), wide: true});
}

/* ================= views & keys ================= */
function setView(v) {
  view = v; state.view = v; save();
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  document.querySelectorAll('.tier-only').forEach(x => x.style.display = v === 'tier' ? '' : 'none');
  const spinView = v === 'wheel' || v === 'case';
  document.querySelectorAll('.grid-opt').forEach(x => x.style.display = spinView || v === 'tour' ? 'none' : '');
  if (v === 'tour') tourShow();
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
  if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); showHelp(); return; }
  if (view === 'tier' && (e.ctrlKey || e.metaKey) && !e.altKey) {
    if (e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redoTier() : undoTier(); }
    else if (e.code === 'KeyA') { e.preventDefault(); state.pool.filter(id => el(id).style.display !== 'none').forEach(id => setSel(id, true)); }
    else if (e.code === 'KeyY') { e.preventDefault(); redoTier(); }
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (view === 'tier' && reveal) {
    const c = e.code;
    if (c === 'Space' || c === 'ArrowRight' || c === 'Enter' || c === 'ArrowDown') revealStep(1);
    else if (c === 'ArrowLeft' || c === 'Backspace' || c === 'ArrowUp') revealStep(-1);
    else if (e.key === 'Escape') togglePresent(false);
    else return;
    e.preventDefault(); return;
  }
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
      if (ids.length) ask(t('c_delete', {n: ids.length}), t('sel_del')).then(ok => ok && deleteImages(ids));
    }
  } else if (view === 'tour') {
    tourKey(e);
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
tourSetup();
ownSetup();
setLang(detectLang());
(async () => {
  try { db = await openDB(); }
  catch { alert(t('idb_fail')); return; }
  navigator.storage?.persist?.();
  meta = await tx('kv', 'readonly', s => s.get('meta')) || {current: 'default', projects: [{id: 'default', name: ''}]};
  if (!meta.projects.some(p => p.id === meta.current)) meta.current = meta.projects[0].id;
  project = meta.current;
  const cur = meta.projects.find(p => p.id === project);
  if (cur.dirOnly) { if (!await loadFolderImages(cur)) return; }
  else {
    if (cur.dir) dirHandle = await tx('kv', 'readonly', s => s.get(dirKey(project))) || null;
    const recs = (await tx('images', 'readonly', s => s.getAll())).filter(r => projOf(r) === project);
    recs.forEach(r => images.set(r.id, {...r, url: URL.createObjectURL(r.blob)}));
  }
  state = await tx('kv', 'readonly', s => s.get(stateKey(project))) || defaultState(meta.projects.find(p => p.id === project)?.tpl);
  state.settings = {...DEFAULT_SETTINGS, ...state.settings};
  for (const k of ['elo', 'scope']) state[k] ||= {};
  state.history ||= [];
  reconcile();
  await spinLoad();
  state.ownSet = ownIds(); state.cmpSrc ||= 'tier'; tcfg().src ||= 'tier';
  await loadThumbs();
  renderProjects(); updateUndoBtns(); remindBackup();
  applySettings(); renderAll(); setView(state.view || 'tier'); refreshSrc();
  // a group list that was just made opens with its statistics
  if (state.group?.fresh) { delete state.group.fresh; openStats(); }
  twPaint();
  checkShareLink();
})();
