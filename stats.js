'use strict';
// Statistics of the open list (Results → Statistics) and the group tier list made from several people's files.
// A group list keeps state.group = {people: [names], votes: {id: [score 0..1 or null per person]}, labels: {id: [row label or null]}}.
// A score is the row position in that person's own list: 1 for the top row, 0 for the bottom one, so lists with
// different numbers of rows can be averaged.

/* ================= building blocks ================= */
function sxEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const rowName = x => x.label.split('\n')[0] || '—';
function rowOf(id) {
  const i = state.tiers.findIndex(x => x.items.includes(id));
  return i < 0 ? null : {i, x: state.tiers[i]};
}
// a list of pictures: [{id, text, sub, chip: tier row, rank}]; numbered puts 1, 2, 3… in front
function sxList(entries, numbered) {
  const ul = sxEl('ul', 'sx-list');
  entries.forEach((e, k) => {
    const im = imOf(e.id); if (!im) return;
    const li = sxEl('li'), img = sxEl('img'); img.alt = ''; img.loading = 'lazy'; img.src = im.turl || im.url;
    if (numbered || e.rank) { const r = e.rank || k + 1; li.append(sxEl('span', 'sx-rank' + (r <= 3 && !e.rank ? ' r' + r : ''), r)); }
    const txt = sxEl('div', 'sx-txt');
    if (e.label) txt.append(sxEl('span', 'sx-label', e.label));
    txt.append(sxEl('span', 'sx-name', e.text ?? im.name));
    if (e.sub) txt.append(sxEl('span', 'muted sx-sub', e.sub));
    li.append(img, txt);
    if (e.chip) { const c = sxEl('span', 'sx-chip', rowName(e.chip)); c.style.background = e.chip.color; li.append(c); }
    ul.append(li);
  });
  return ul;
}

/* ================= statistics ================= */
// shown in Results → Statistics: number tiles on top, then cards that flow into two columns on a wide screen
function renderStats(box) {
  const body = sxEl('div', 'sx'), grid = sxEl('div', 'sx-grid');
  box.replaceChildren(body);
  const card = (title, wide) => { const c = sxEl('section', 'sx-card' + (wide ? ' wide' : '')); c.append(sxEl('h4', '', title)); grid.append(c); return c; };
  const ranked = state.tiers.reduce((a, x) => a + x.items.length, 0);
  const steam = [...images.values()].filter(im => im.steam);
  const cmp = cmpData();

  const tiles = sxEl('div', 'sx-tiles');
  const tile = (num, label) => { const d = sxEl('div', 'sx-tile'); d.append(sxEl('b', '', num), sxEl('span', '', label)); tiles.append(d); };
  tile(images.size, t('sx_images'));
  tile(ranked, t('sx_ranked'));
  tile(state.pool.length, t('unranked'));
  if (steam.length) tile(fmtHours(steam.reduce((a, im) => a + (im.steam.min || 0), 0)), t('sx_hours'));
  if (state.cmpCount) tile(state.cmpCount, t('sx_cmps'));
  if (cmp) tile(cmp.ids.length, t('sx_rated'));
  body.append(tiles, grid);

  if (state.group) groupStats(card);
  rowStats(card, ranked, cmp);
  if (steam.length) {
    const top = steam.filter(im => im.steam.min).sort((a, b) => b.steam.min - a.steam.min).slice(0, 10);
    card(t('sx_most_played')).append(sxList(top.map(im => ({id: im.id, sub: playInfo(im), chip: rowOf(im.id)?.x})), true));
  }
  if (cmp) cmpStats(card, cmp);
  spinStats(card);
  if (!images.size && !state.group) body.append(sxEl('p', 'muted', t('sx_empty')));
}
function openStats() { state.resMode = 'stats'; setView('res'); }
const sxBtn = (text, fn) => { const b = sxEl('button', 'btn', text); b.onclick = fn; return b; };

// how the rows are filled; for Steam games also the average playtime per row
function rowStats(card, ranked, cmp) {
  const c = card(t('sx_rows'));
  if (!ranked) {
    c.append(sxEl('p', 'muted', t('sx_rows_empty')));
    if (cmp && state.cmpSrc !== 'own') c.append(sxBtn(t('auto_btn'), () => $('#autoTier').click()));
    return;
  }
  const max = Math.max(1, ...state.tiers.map(x => x.items.length)), bars = sxEl('div', 'sx-bars');
  for (const x of state.tiers) {
    const n = x.items.length, r = sxEl('div', 'sx-bar');
    const lbl = sxEl('span', 'sx-lbl', rowName(x)); lbl.style.background = x.color;
    const track = sxEl('div', 'sx-track'), fill = sxEl('div', 'sx-fill'); fill.style.width = n / max * 100 + '%'; fill.style.background = x.color; track.append(fill);
    let num = `${n} · ${Math.round(n / ranked * 100)}%`;
    const games = x.items.map(id => images.get(id)?.steam).filter(Boolean);
    if (games.length) num += ' · ' + t('sx_avg_h', {h: fmtHours(games.reduce((a, s) => a + (s.min || 0), 0) / games.length)});
    r.append(lbl, track, sxEl('span', 'sx-num', num));
    bars.append(r);
  }
  c.append(bars);
}

/* ---------- Compare ---------- */
// rated pictures (best first) and every vote of the history with its result.
// Older votes don't store the result, so it is worked out from the win/loss counters: going back from now,
// a picture whose wins dropped by one before a vote won that vote.
function cmpData() {
  const base = scopeBase(), E = id => state.elo[id];
  const ids = base.filter(id => E(id)?.n && imOf(id)).sort((a, b) => E(b).r - E(a).r);
  if (!ids.length) return null;
  const cur = new Map(), games = [];
  for (let i = state.history.length - 1; i >= 0; i--) {
    const h = state.history[i], after = cur.get(h.a) || E(h.a);
    let s = h.s;
    if (s == null && after) s = after.w > h.A.w ? 1 : after.l > h.A.l ? 0 : .5;
    games.push({a: h.a, b: h.b, ra: h.A.r, rb: h.B.r, s});
    cur.set(h.a, h.A); cur.set(h.b, h.B);
  }
  return {ids, base, E, games};
}
function cmpStats(card, {ids, base, E, games}) {
  const sub = id => t('sx_elo', {r: Math.round(E(id).r), w: E(id).w, l: E(id).l});
  card(t('sx_top10')).append(sxList(ids.slice(0, 10).map(id => ({id, sub: sub(id), chip: rowOf(id)?.x})), true));
  if (ids.length > 15) card(t('sx_bottom')).append(sxList(ids.slice(-5).reverse().map((id, k) => ({id, rank: ids.length - k, sub: sub(id), chip: rowOf(id)?.x}))));

  // records: every line names a different picture where possible
  const used = new Set(), out = [];
  const add = (id, label, s) => { if (id && !used.has(id)) { used.add(id); out.push({id, label, sub: s}); } };
  add(ids[0], t('sx_leader', {name: ''}), sub(ids[0]));
  const leads = Object.entries(state.lead || {}).filter(([id, n]) => n > 0 && imOf(id)).sort((a, b) => b[1] - a[1]);
  if (leads.length) add(leads[0][0], t('sx_lead', {name: ''}), t('sx_lead_n', {n: leads[0][1], of: leads.reduce((a, x) => a + x[1], 0)}));
  const rate = id => E(id).w / E(id).n;
  const best = ids.filter(id => E(id).n >= 5 && !used.has(id)).sort((a, b) => rate(b) - rate(a) || E(b).n - E(a).n)[0];
  if (best) add(best, t('sx_winrate', {name: ''}), t('sx_pct', {p: Math.round(rate(best) * 100), n: E(best).n}));
  const unbeaten = ids.filter(id => E(id).n >= 5 && !E(id).l && !used.has(id)).sort((a, b) => E(b).w - E(a).w)[0];
  if (unbeaten) add(unbeaten, t('sx_unbeaten', {name: ''}), sub(unbeaten));
  const draws = ids.filter(id => E(id).d >= 2 && !used.has(id)).sort((a, b) => E(b).d / E(b).n - E(a).d / E(a).n)[0];
  if (draws) add(draws, t('sx_draws', {name: ''}), t('sx_draws_n', {d: E(draws).d, n: E(draws).n}));
  const most = ids.filter(id => !used.has(id)).sort((a, b) => E(b).n - E(a).n)[0];
  if (most) add(most, t('sx_most_cmp', {name: ''}), t('sx_most_cmp_n', {n: E(most).n}));
  out.forEach(e => e.label = e.label.replace(/[\s:：]+$/, ''));
  card(t('sx_records')).append(sxList(out));

  // wins of a picture that now stands far below the one it beat. Pairs are picked with close ratings,
  // so the ratings at the time of the vote rarely differ much; today's ratings show the surprise better
  const upsets = games.filter(g => (g.s === 1 || g.s === 0) && E(g.a) && E(g.b)).map(g => {
    const [w, l] = g.s === 1 ? [g.a, g.b] : [g.b, g.a];
    return {w, l, rw: E(w).r, rl: E(l).r, d: E(l).r - E(w).r};
  }).filter(u => u.d >= 60 && imOf(u.w) && imOf(u.l)).sort((a, b) => b.d - a.d);
  const seen = new Set(), ups = [];
  for (const u of upsets) { if (seen.has(u.w)) continue; seen.add(u.w); ups.push(u); if (ups.length === 6) break; }
  if (ups.length) card(t('sx_upsets')).append(sxList(ups.map(u => ({id: u.w, sub: t('sx_upset_v', {name: imOf(u.l).name, a: Math.round(u.rw), b: Math.round(u.rl)})}))));

  histogram(card(t('sx_hist')), ids.map(id => E(id).r));

  // how far Compare has got: same target as the progress bar in Compare
  const c = card(t('sx_progress')), n = base.length, sum = base.reduce((a, id) => a + (E(id)?.n || 0), 0);
  const target = Math.max(6, Math.ceil(Math.log2(Math.max(2, n))) + 2), left = Math.max(0, Math.ceil((target * n - sum) / 2));
  const facts = sxEl('div', 'sx-facts');
  const fact = (num, label) => { const d = sxEl('div'); d.append(sxEl('b', '', num), sxEl('span', 'muted', label)); facts.append(d); };
  fact(`${ids.length} / ${n}`, t('sx_rated'));
  fact(base.filter(id => !E(id)?.n).length, t('sx_never'));
  fact(base.filter(id => (E(id)?.n || 0) < 3).length, t('sx_few_cmp'));
  fact((sum / Math.max(1, n)).toFixed(1), t('sx_avg_cmp'));
  const bar = sxEl('div', 'sx-track sx-progress'), fill = sxEl('div', 'sx-fill'); fill.style.width = Math.min(100, sum / Math.max(1, target * n) * 100) + '%'; bar.append(fill);
  c.append(facts, bar, sxEl('p', 'muted sx-hint', left ? t('sx_left', {n: left}) : t('sx_done')));

  // pictures whose place by comparisons is far from their row
  if (state.cmpSrc === 'own' || state.tiers.length < 2) return;
  const inRows = ids.filter(id => E(id).n >= 3 && rowOf(id));
  if (inRows.length < 8) return;
  const T = state.tiers.length;
  const diff = inRows.map((id, k) => {
    const row = rowOf(id), byRow = 1 - row.i / (T - 1), byCmp = 1 - k / (inRows.length - 1);
    return {id, d: byCmp - byRow, k, row};
  }).filter(x => Math.abs(x.d) >= .35).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8);
  if (!diff.length) return;
  const d = card(t('sx_disagree'));
  d.append(sxEl('p', 'muted sx-hint', t('sx_disagree_hint')));
  d.append(sxList(diff.map(x => ({id: x.id, sub: t('sx_place', {i: x.k + 1, n: inRows.length}) + ' · ' + t(x.d > 0 ? 'sx_higher' : 'sx_lower'), chip: x.row.x}))));
}
// columns of how many pictures fall into each rating range
function histogram(c, values) {
  const lo = Math.floor(Math.min(...values) / 25) * 25, hi = Math.ceil((Math.max(...values) + 1) / 25) * 25;
  const k = Math.min(14, Math.max(4, Math.round(Math.sqrt(values.length)))), step = (hi - lo) / k;
  const counts = new Array(k).fill(0);
  for (const v of values) counts[Math.min(k - 1, Math.floor((v - lo) / step))]++;
  const max = Math.max(...counts), box = sxEl('div', 'sx-hist');
  counts.forEach((n, i) => {
    const col = sxEl('div', 'sx-col'); col.title = `${Math.round(lo + i * step)}–${Math.round(lo + (i + 1) * step)}: ${n}`;
    const b = sxEl('div', 'sx-colbar'); b.style.height = (n / max * 100) + '%';
    col.append(sxEl('span', 'sx-colnum', n || ''), b);
    box.append(col);
  });
  const axis = sxEl('div', 'sx-axis'); axis.append(sxEl('span', '', Math.round(lo)), sxEl('span', '', Math.round(hi)));
  c.append(box, axis, sxEl('p', 'muted sx-hint', t('sx_hist_hint')));
}

// what the wheel and the case gave out most often
function spinStats(card) {
  for (const m of ['wheel', 'case']) {
    const hist = state.spin?.[m]?.hist || [];
    if (hist.length < 3) continue;
    const count = new Map();
    for (const h of hist) { const k = h.img || 'txt:' + h.cap; const c = count.get(k) || {n: 0, h}; c.n++; count.set(k, c); }
    const top = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 5);
    const c = card(t('sx_drops', {where: t('tab_' + m)}));
    const list = top.filter(x => x.h.img && imOf(x.h.img)).map(x => ({id: x.h.img, sub: t('sx_times_n', {n: x.n, of: hist.length})}));
    if (list.length) c.append(sxList(list));
    else c.append(sxEl('p', 'muted', top.map(x => t('sx_times', {name: x.h.cap || '—', n: x.n, of: hist.length})).join('\n')));
  }
}

/* ================= group tier list ================= */
function groupStats(card) {
  const g = state.group, P = g.people.length;
  const ids = Object.keys(g.votes).filter(id => images.has(id));
  const votes = id => g.votes[id].map((v, i) => [v, i]).filter(([v]) => v != null);
  const who = id => g.labels[id].map((l, i) => l == null ? null : `${g.people[i]}: ${l}`).filter(Boolean).join(' · ');
  const head = card(t('grp_people', {names: g.people.join(', ')}), true);

  // agreement of every pair: 100% when they put every common picture at the same height
  const pairs = [];
  for (let a = 0; a < P; a++) for (let b = a + 1; b < P; b++) {
    let sum = 0, n = 0;
    for (const id of ids) { const x = g.votes[id][a], y = g.votes[id][b]; if (x != null && y != null) { sum += Math.abs(x - y); n++; } }
    if (n >= 3) pairs.push({a, b, p: Math.round((1 - sum / n) * 100), n});
  }
  if (pairs.length) {
    const box = sxEl('div', 'sx-bars');
    for (const x of pairs.sort((u, v) => v.p - u.p)) {
      const r = sxEl('div', 'sx-bar');
      const track = sxEl('div', 'sx-track'), fill = sxEl('div', 'sx-fill'); fill.style.width = x.p + '%'; track.append(fill);
      r.append(sxEl('span', 'sx-pair', `${g.people[x.a]} + ${g.people[x.b]}`), track, sxEl('span', 'sx-num', t('grp_agree_v', {p: x.p, n: x.n})));
      box.append(r);
    }
    head.append(sxEl('p', 'muted sx-hint', t('grp_agree')), box);
  }

  const spread = id => { const v = votes(id).map(([s]) => s); return Math.max(...v) - Math.min(...v); };
  const avg = id => { const v = votes(id); return v.reduce((s, [x]) => s + x, 0) / v.length; };
  const fights = ids.filter(id => votes(id).length >= 2 && spread(id) >= .5).sort((a, b) => spread(b) - spread(a) || avg(b) - avg(a)).slice(0, 8);
  if (fights.length) card(t('grp_fight')).append(sxList(fights.map(id => ({id, sub: who(id)}))));
  const love = ids.filter(id => votes(id).length === P && P > 1 && spread(id) <= .25 && avg(id) >= .75).sort((a, b) => avg(b) - avg(a)).slice(0, 6);
  if (love.length) card(t('grp_love')).append(sxList(love.map(id => ({id, sub: who(id)}))));
  if (!pairs.length && !fights.length) head.append(sxEl('p', 'muted', t('grp_few')));
}

// ☰ → Group tier list: my list plus friends' saved files are averaged into a new list
function openGroup() {
  const people = [{me: true, name: t('grp_me'), on: true}];
  const body = sxEl('div', 'sx grp');
  body.append(sxEl('p', 'muted sx-hint', t('grp_hint')));
  const list = sxEl('div', 'grp-list'), add = sxEl('button', 'btn', t('grp_add'));
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.json,application/json'; inp.hidden = true;
  const row = sxEl('div', 'st-row'); row.append(add);
  // what each person's opinion is taken from
  const modeRow = sxEl('label', 'grp-mode'), sel = document.createElement('select');
  for (const m of ['auto', 'rows', 'cmp']) { const o = document.createElement('option'); o.value = m; o.textContent = t('grp_by_' + m); sel.append(o); }
  modeRow.append(sxEl('span', '', t('grp_by')), sel);
  body.append(list, row, modeRow, sxEl('p', 'muted sx-hint', t('grp_by_hint')), inp);
  const render = () => {
    list.replaceChildren(...people.map((p, i) => {
      const r = sxEl('div', 'grp-row');
      const name = document.createElement('input'); name.type = 'text'; name.className = 'dlg-input'; name.value = p.name; name.maxLength = 40;
      name.oninput = () => p.name = name.value;
      const c = opinionCounts(p);
      const info = sxEl('span', 'muted', (p.me ? t('grp_mine') + ' · ' : '') + t('grp_ranked', {n: c.rows}) + ' · ' + t('grp_compared', {n: c.cmp}));
      if (p.me) {
        const c = document.createElement('input'); c.type = 'checkbox'; c.checked = p.on; c.onchange = () => p.on = c.checked;
        r.append(c);
      } else {
        const x = sxEl('button', 'btn icon-btn', '✕'); x.title = t('sel_del'); x.onclick = () => { people.splice(i, 1); render(); };
        r.append(x);
      }
      r.append(name, info);
      return r;
    }));
  };
  add.onclick = () => inp.click();
  inp.onchange = async () => {
    const files = [...inp.files]; inp.value = '';
    for (const f of files) {
      let data = null;
      try { data = JSON.parse(await f.text()); } catch {}
      if (!data || data.format !== FILE_FORMAT || !data.state || !Array.isArray(data.images)) { toast(t('grp_bad', {name: f.name}), 4000); continue; }
      people.push({name: f.name.replace(/\.tierlist\.json$|\.json$/i, '').slice(0, 40), data});
    }
    render();
  };
  render();
  dialog({title: t('grp_title'), body, ok: t('grp_make'), wide: true, onOk: async () => {
    const use = people.filter(p => !p.me || p.on);
    if (use.length < 2) { toast(t('grp_need2'), 3500); return false; }
    use.forEach((p, i) => p.name = p.name.trim() || t('grp_person', {n: i + 1}));
    await makeGroup(use, sel.value);
  }});
}

// one person's opinion as {id: {score 0..1, label}}.
// rows: the row height; cmp: the place among the pictures they compared; auto: the row, or the place if it is in no row
function opinionOf(p, mode) {
  const s = p.me ? state : p.data.state, recs = p.me ? images : new Map(p.data.images.map(r => [r.id, r]));
  const out = new Map(), tiers = s.tiers || [];
  if (mode !== 'cmp') tiers.forEach((x, ti) => (x.items || []).forEach(id => {
    if (recs.has(id)) out.set(id, {score: tiers.length > 1 ? 1 - ti / (tiers.length - 1) : 1, label: String(x.label || '').split('\n')[0] || '—'});
  }));
  if (mode !== 'rows') {
    const elo = s.elo || {}, rated = Object.keys(elo).filter(id => elo[id]?.n && recs.has(id)).sort((a, b) => elo[b].r - elo[a].r);
    rated.forEach((id, k) => { if (!out.has(id)) out.set(id, {score: rated.length > 1 ? 1 - k / (rated.length - 1) : 1, label: '#' + (k + 1)}); });
  }
  return {out, recs};
}
const opinionCounts = p => {
  const s = p.me ? state : p.data.state, recs = p.me ? images : new Map(p.data.images.map(r => [r.id, r]));
  return {rows: (s.tiers || []).reduce((a, x) => a + (x.items || []).filter(id => recs.has(id)).length, 0),
    cmp: Object.keys(s.elo || {}).filter(id => s.elo[id]?.n && recs.has(id)).length};
};

async function makeGroup(people, mode = 'auto') {
  toast(t('t_building'), 60000);
  // the same game or picture in different files: by Steam app id, otherwise by the name without punctuation
  const keyOf = r => r.steam?.appid ? 'app:' + r.steam.appid : 'n:' + String(r.name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const items = new Map();
  people.forEach((p, pi) => {
    const {out, recs} = opinionOf(p, mode);
    for (const [id, o] of out) {
      const r = recs.get(id), k = keyOf(r);
      let it = items.get(k);
      if (!it) items.set(k, it = {src: r, votes: people.map(() => null), labels: people.map(() => null)});
      it.votes[pi] = o.score; it.labels[pi] = o.label;
    }
  });
  if (!items.size) { toast(t('grp_few'), 4000); return; }
  const base = people[0].me ? state.tiers : people[0].data.state.tiers;
  const tiers = base.map(x => ({id: uid(), label: x.label, color: x.color, items: []}));
  const imgs = [], votes = {}, labels = {};
  const scored = [...items.values()].map(it => {
    const v = it.votes.filter(x => x != null);
    return {...it, avg: v.reduce((a, b) => a + b, 0) / v.length};
  }).sort((a, b) => b.avg - a.avg);
  for (const it of scored) {
    const id = uid(), r = it.src;
    tiers[Math.round((1 - it.avg) * (tiers.length - 1))].items.push(id);
    const note = it.labels.map((l, i) => l == null ? null : `${people[i].name}: ${l}`).filter(Boolean).join(' · ');
    imgs.push({id, name: r.name, note, key: r.key, steam: r.steam, blob: r.blob || b64ToBlob(r.data, r.type)});
    votes[id] = it.votes; labels[id] = it.labels;
  }
  const s = defaultState();
  s.tiers = tiers;
  s.group = {people: people.map(p => p.name), votes, labels, fresh: true};
  await finishImport({name: t('grp_list_name', {names: people.map(p => p.name).join(', ')}), state: s}, imgs, [], 'Group');
}
