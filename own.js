'use strict';
// A separate set of images for Compare, Results and Tournament, independent of the tier list.
// Its pictures live in the 'spin' store (like the wheel's own pictures), so they never show up in the tier list;
// state.ownSet keeps their ids. Compare/Results use state.cmpSrc, the tournament tcfg().src: 'tier' or 'own'.
// Switching back to 'tier' keeps the set and its ratings for later. app.js calls ownSetup() on start.

const ownIds = () => (state.ownSet || []).filter(id => imOf(id));

function ownSetup() {
  $('#cmpSrc').onchange = e => { state.cmpSrc = e.target.value; pair = null; save(); refreshSrc(); };
  $('#tourSrc').onchange = e => { tcfg().src = e.target.value; save(); refreshSrc(); };
  document.querySelectorAll('.own-files').forEach(b => b.onclick = () => $('#fOwnFiles').click());
  document.querySelectorAll('.own-dir').forEach(b => b.onclick = () => $('#fOwnDir').click());
  document.querySelectorAll('.own-clear').forEach(b => b.onclick = clearOwn);
  $('#fOwnFiles').onchange = $('#fOwnDir').onchange = e => { addOwnFiles([...e.target.files]); e.target.value = ''; };
}
const ownSource = () => (view === 'tour' ? tcfg().src : state.cmpSrc) === 'own';

// updates the switches, the counters and whichever of the three views is open
function refreshSrc() {
  if (!state) return;
  const n = ownIds().length;
  for (const [sel, sec, src] of [['#cmpSrc', '#view-cmp', state.cmpSrc], ['#tourSrc', '#view-tour', tcfg().src]]) {
    $(sel).value = src === 'own' ? 'own' : 'tier';
    $(sec).classList.toggle('src-own', src === 'own');
  }
  document.querySelectorAll('.own-count').forEach(e => e.textContent = t('own_count', {n}));
  const auto = $('#autoTier'), own = state.cmpSrc === 'own';
  auto.disabled = own; auto.title = own ? t('auto_own') : '';
  $('#arenaEmpty').textContent = own && !n ? t('own_empty') : t('need2');
  if (view === 'cmp') { renderScope(); showPair(); }
  if (view === 'res') renderResults();
  if (view === 'tour') tourShow();
}

async function addOwnFiles(files) {
  const have = new Set(ownIds().map(id => imOf(id).key));
  // a picture that is already stored (in the tier list or elsewhere) is reused instead of copied
  const byKey = new Map([...simgs.values(), ...images.values()].map(s => [s.key, s.id]));
  const fresh = [], added = [];
  const list = files.filter(isImageFile).map(f => ({name: f.name.replace(/\.[^.]+$/, ''), key: f.name + '|' + f.size, blob: f}))
    .sort((a, b) => collator.compare(a.name, b.name));
  for (const r of list) {
    if (have.has(r.key)) continue;
    have.add(r.key);
    let id = byKey.get(r.key);
    if (!id) { id = uid(); fresh.push({id, project, name: r.name, key: r.key, blob: r.blob}); byKey.set(r.key, id); }
    added.push(id);
  }
  if (!added.length) { toast(t('t_no_new')); return; }
  toast(t('t_loading', {n: added.length}), 10000);
  for (const f of fresh) f.blob = new Blob([await f.blob.arrayBuffer()], {type: f.blob.type || 'image/jpeg'});
  if (fresh.length) await tx('spin', 'readwrite', s => fresh.forEach(r => s.put(r)));
  fresh.forEach(r => simgs.set(r.id, {...r, url: URL.createObjectURL(r.blob)}));
  (state.ownSet ||= []).push(...added);
  pair = null; save(); refreshSrc();
  toast(t('t_added', {n: added.length}));
  queueThumbs(fresh.map(r => r.id));
}

async function clearOwn() {
  const ids = ownIds();
  if (!ids.length || !await ask(t('c_own_clear', {n: ids.length}), t('own_clear'))) return;
  state.ownSet = [];
  ids.forEach(id => { if (!images.has(id)) delete state.elo[id]; });  // ratings of tier list pictures stay
  const s = new Set(ids);
  state.history = state.history.filter(h => !s.has(h.a) && !s.has(h.b));
  pair = null; save(); await gcSpinImages(); refreshSrc();
}
