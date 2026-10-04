'use strict';
// Single-elimination tournament: the images play one-on-one, the winner goes to the next round until one is left.
// The bracket is seeded like in sports (1st meets the last), extra slots become byes for the top seeds.
// Every match can also count as a comparison in the Elo rating. app.js calls tourSetup() on start.

const TOUR_SIZES = [4, 8, 16, 32, 64, 128];
// state.tour: {rounds: [[{a, b, w, bye}]], hist: [{r, m, elo}], elo, done}; state.tourCfg: the settings bar
const tcfg = () => state.tourCfg || (state.tourCfg = {scope: {}, size: 16, seed: 'rating', elo: true});
const tourIm = id => imOf(id) || null;

function tourSetup() {
  $('#tourStart').onclick = startTour;
  $('#tourUndo').onclick = tourUndo;
  $('#tourSize').onchange = e => { tcfg().size = +e.target.value; save(); };
  $('#tourSeed').onchange = e => { tcfg().seed = e.target.value; save(); };
  $('#tourElo').onchange = e => { tcfg().elo = e.target.checked; save(); };
  $('#tourStage').addEventListener('click', e => {
    const c = e.target.closest('[data-side]');
    if (c) tourPick(+c.dataset.side); else if (e.target.closest('#tourAgain')) startTour();
  });
}
function tourShow() { renderTourBar(); renderTour(); }

function tourCandidates() {
  if (tcfg().src === 'own') return ownIds();
  const c = tcfg(), ids = [];
  state.tiers.forEach(x => { if (c.scope[x.id] !== false) ids.push(...x.items); });
  if (c.scope.pool !== false) ids.push(...state.pool);
  return ids;
}
function renderTourBar() {
  const c = tcfg(), box = $('#tourScope'); box.innerHTML = '';
  const add = (key, name, color, count) => {
    const l = document.createElement('label'); l.className = 'chip';
    l.innerHTML = `<input type="checkbox"${c.scope[key] !== false ? ' checked' : ''}><span class="dot" style="background:${color}"></span><span></span><span class="muted">${count}</span>`;
    l.querySelector('span:nth-of-type(2)').textContent = name;
    l.querySelector('input').onchange = e => { c.scope[key] = e.target.checked; save(); renderTourBar(); };
    box.appendChild(l);
  };
  state.tiers.forEach(x => add(x.id, x.label.split('\n')[0] || '—', x.color, x.items.length));
  add('pool', t('unranked'), '#666', state.pool.length);
  const n = tourCandidates().length, sizes = TOUR_SIZES.filter(s => s < n);
  $('#tourSize').innerHTML = sizes.map(s => `<option value="${s}">${s}</option>`).join('') + `<option value="0">${t('tour_all')} (${n})</option>`;
  $('#tourSize').value = sizes.includes(c.size) ? c.size : 0;
  $('#tourSeed').value = c.seed; $('#tourElo').checked = c.elo;
  $('#tourUndo').disabled = !state.tour?.hist?.length || tourHidden();
}

// standard bracket order: for 8 slots it is 1 8 4 5 2 7 3 6, so the best seeds meet as late as possible
function seedOrder(n) {
  let o = [1];
  while (o.length < n) { const m = o.length * 2; o = o.flatMap(s => [s, m + 1 - s]); }
  return o;
}
const ratingOf = id => state.elo[id]?.n ? state.elo[id].r : -1e9;
async function startTour() {
  const T = state.tour;
  if (T && !T.done && T.hist.length && !await ask(t('c_tour_new'), t('tour_start'), false)) return;
  const c = tcfg();
  let ids = shuffled(tourCandidates());
  if (ids.length < 2) { toast(t('need2'), 3500); return; }
  if (c.seed === 'rating') ids.sort((a, b) => ratingOf(b) - ratingOf(a));  // stable: equal ratings stay shuffled
  if (c.size && c.size < ids.length) ids = ids.slice(0, c.size);
  let size = 2; while (size < ids.length) size *= 2;
  const slots = seedOrder(size).map(s => ids[s - 1] ?? null);
  const rounds = [];
  for (let r = 0; size >> (r + 1) >= 1; r++) rounds.push(Array.from({length: size >> (r + 1)}, () => ({a: null, b: null, w: null})));
  rounds[0].forEach((mt, m) => { mt.a = slots[2 * m]; mt.b = slots[2 * m + 1]; });
  state.tour = {rounds, hist: [], elo: c.elo, done: false, src: c.src === 'own' ? 'own' : 'tier'};
  rounds[0].forEach((mt, m) => { if (!mt.a || !mt.b) { mt.w = mt.a || mt.b; mt.bye = true; advance(0, m); } });
  save(); tourShow();
}
function advance(r, m) {
  const T = state.tour, w = T.rounds[r][m].w, nx = T.rounds[r + 1];
  if (!nx) { T.done = !!w; return; }
  const mt = nx[m >> 1];
  if (m % 2) mt.b = w; else mt.a = w;
}
function curMatch() {
  const T = state.tour; if (!T) return null;
  for (let r = 0; r < T.rounds.length; r++)
    for (let m = 0; m < T.rounds[r].length; m++) { const mt = T.rounds[r][m]; if (mt.a && mt.b && !mt.w) return {r, m, mt}; }
  return null;
}
// true when the saved bracket was built from the other picture source and is hidden
const tourHidden = () => !!state.tour && (state.tour.src || 'tier') !== (tcfg().src === 'own' ? 'own' : 'tier');
function tourPick(side) {
  if (tourHidden()) return;
  const cur = curMatch(); if (!cur) return;
  const {r, m, mt} = cur, w = side ? mt.b : mt.a, l = side ? mt.a : mt.b;
  const card = document.querySelector(`#tourStage [data-side="${side}"]`);
  card?.classList.add('pick');
  mt.w = w;
  const h = {r, m};
  if (state.tour.elo && imOf(w) && imOf(l)) h.elo = eloMatch(w, l, 1);
  state.tour.hist.push(h);
  advance(r, m);
  save();
  setTimeout(() => {
    renderTour(); $('#tourUndo').disabled = false;
    if (state.tour.done) celebrate();
  }, 140);
}
function tourUndo() {
  if (tourHidden()) return;
  const T = state.tour, h = T?.hist.pop(); if (!h) { toast(t('t_nothing_undo')); return; }
  T.rounds[h.r][h.m].w = null;
  const nx = T.rounds[h.r + 1];
  if (nx) { const n = nx[h.m >> 1]; if (h.m % 2) n.b = null; else n.a = null; }
  T.done = false;
  if (h.elo) { state.elo[h.elo.a] = h.elo.A; state.elo[h.elo.b] = h.elo.B; state.cmpCount = Math.max(0, (state.cmpCount || 0) - 1); }
  save(); renderTour(); $('#tourUndo').disabled = !T.hist.length;
}
function celebrate() {
  const img = $('#tourStage .champ img');
  if (img) burst(...centerOf(img), 4);
  audio(true); ding();
}
function roundName(r) {
  const left = state.tour.rounds.length - r;
  return left === 1 ? t('tour_final') : left === 2 ? t('tour_semi') : left === 3 ? t('tour_quarter') : t('tour_round_of', {n: 2 ** left, h: 2 ** (left - 1)});
}

/* ================= rendering ================= */
function renderTour() {
  const T = state.tour, stage = $('#tourStage');
  // a bracket built from the other source is not shown, so it never looks like the wrong pictures are playing
  const otherSrc = tourHidden();
  if (!T || otherSrc) {
    stage.innerHTML = '<div class="tour-empty"></div>';
    stage.firstChild.textContent = otherSrc ? t('tour_src_changed') : t('tour_empty');
    $('#tourBracket').replaceChildren();
    return;
  }
  const cur = curMatch();
  if (cur) {
    const {r, m, mt} = cur, real = T.rounds[r].filter(x => !x.bye);
    stage.innerHTML = `<div class="tour-round"><b></b> · <span class="muted"></span></div>
      <div class="arena tour-arena">
        <div class="card" data-side="0"><img alt="" draggable="false"><div class="nm"></div></div>
        <div class="mid"><div class="vs">VS</div></div>
        <div class="card" data-side="1"><img alt="" draggable="false"><div class="nm"></div></div>
      </div>`;
    stage.querySelector('.tour-round b').textContent = roundName(r);
    stage.querySelector('.tour-round span').textContent = t('tour_match', {i: real.indexOf(mt) + 1, n: real.length});
    [mt.a, mt.b].forEach((id, i) => {
      const c = stage.querySelectorAll('.card')[i], im = tourIm(id);
      if (im) c.querySelector('img').src = im.url;
      c.querySelector('.nm').textContent = im ? im.name : '—';
    });
  } else if (T.done) {
    const im = tourIm(T.rounds.at(-1)[0].w);
    stage.innerHTML = `<div class="champ"><div class="champ-title"></div><img alt=""><div class="nm"></div><button class="btn primary" id="tourAgain"></button></div>`;
    stage.querySelector('.champ-title').textContent = t('tour_champion');
    if (im) stage.querySelector('img').src = im.url;
    stage.querySelector('.nm').textContent = im ? im.name : '—';
    stage.querySelector('#tourAgain').textContent = t('tour_start');
  }
  renderBracket(cur);
}
function renderBracket(cur) {
  const T = state.tour, frag = document.createDocumentFragment();
  T.rounds.forEach((round, r) => {
    const col = document.createElement('div'); col.className = 'bcol';
    const h = document.createElement('div'); h.className = 'bhead'; h.textContent = roundName(r); col.appendChild(h);
    const list = document.createElement('div'); list.className = 'bmatches';
    round.forEach((mt, m) => {
      const box = document.createElement('div');
      box.className = 'bm' + (mt.bye ? ' bye' : '') + (cur && cur.r === r && cur.m === m ? ' cur' : '');
      for (const id of [mt.a, mt.b]) {
        const p = document.createElement('div'), im = tourIm(id);
        p.className = 'bp' + (mt.w && id ? (mt.w === id ? ' bwin' : ' blose') : '');
        p.innerHTML = `<span class="bth">${im ? '<img alt="" loading="lazy">' : ''}</span><span class="bnm"></span>`;
        if (im) p.querySelector('img').src = im.url;
        p.querySelector('.bnm').textContent = im ? im.name : id ? '—' : '';
        box.appendChild(p);
      }
      list.appendChild(box);
    });
    col.appendChild(list); frag.appendChild(col);
  });
  $('#tourBracket').replaceChildren(frag);
  $('#tourBracket .bm.cur')?.scrollIntoView({block: 'nearest', inline: 'nearest'});
}

// returns true when the key was used
function tourKey(e) {
  const c = e.code;
  if (c === 'ArrowLeft' || c === 'Digit1' || c === 'Numpad1') tourPick(0);
  else if (c === 'ArrowRight' || c === 'Digit2' || c === 'Numpad2') tourPick(1);
  else if (c === 'KeyZ' || c === 'Backspace') tourUndo();
  else return false;
  e.preventDefault();
  return true;
}
