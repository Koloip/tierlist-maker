'use strict';
// Sharing a list of Steam games as a link. Nothing is uploaded: the link itself carries the list name, the rows
// and the game numbers, packed into the part after # (browsers never send that part to the server).
// Whoever opens it gets the names from steamcmd.net and the covers from Steam, and the list is saved
// in their browser as a new one. Pictures that are not Steam games have no public address and stay out.

const SHARE_SITE = 'https://koloip.github.io/tierlist-maker/';  // where links point when the app runs from a file
const SHARE_TAG = '#share=';

/* ================= packing ================= */
// JSON → deflate → base64 that is safe in a URL
async function packShare(obj) {
  const z = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const u8 = new Uint8Array(await new Response(z).arrayBuffer());
  let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// a link can be crafted to inflate into gigabytes, so unpacking stops at 1 MB (a real one is a few KB)
const SHARE_MAX_BYTES = 1 << 20, SHARE_MAX_GAMES = 5000;
async function unpackShare(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const u8 = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  const reader = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = []; let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > SHARE_MAX_BYTES) { reader.cancel(); throw new Error('too big'); }
    parts.push(value);
  }
  return JSON.parse(await new Blob(parts).text());
}
// game numbers from a link: whole positive numbers only, and not more than a real library has
const cleanIds = list => (Array.isArray(list) ? list : []).filter(id => Number.isInteger(id) && id > 0 && id < 1e8).slice(0, SHARE_MAX_GAMES);
const shareBase = () => location.protocol.startsWith('http') ? location.origin + location.pathname : SHARE_SITE;
const appOf = id => images.get(id)?.steam?.appid;

/* ================= making a link ================= */
// {v, n: list name, r: [[label, color, [appid…]]…], p: [appid…] (Unranked, optional)}
function openShare() {
  const inRows = state.tiers.reduce((a, x) => a + x.items.filter(appOf).length, 0), inPool = state.pool.filter(appOf).length;
  if (!inRows && !inPool) { toast(t('sh_none'), 6000); return; }
  const body = sxEl('div', 'sx share');
  body.append(sxEl('p', 'muted sx-hint', t('sh_hint')));
  const pool = document.createElement('label'); pool.className = 'st-check';
  pool.innerHTML = '<input type="checkbox"> <span></span>'; pool.querySelector('span').textContent = t('sh_pool');
  const pc = pool.querySelector('input'); pc.checked = !inRows;  // with empty rows Unranked is all there is
  const area = document.createElement('textarea'); area.className = 'dlg-input share-link'; area.readOnly = true; area.rows = 4;
  const info = sxEl('p', 'muted sx-hint'), warn = sxEl('p', 'sx-hint share-warn');
  const skipped = images.size - [...images.values()].filter(im => im.steam?.appid).length;
  body.append(pool, area, info, warn);
  if (skipped) body.append(sxEl('p', 'muted sx-hint', t('sh_skip', {n: skipped})));
  let link = '';
  const build = async () => {
    const data = {v: 1, n: projName(curProj()), r: state.tiers.map(x => [x.label, x.color, x.items.map(appOf).filter(Boolean)])};
    if (pc.checked) data.p = state.pool.map(appOf).filter(Boolean);
    link = shareBase() + SHARE_TAG + await packShare(data);
    area.value = link;
    info.textContent = t('sh_len', {n: inRows + (pc.checked ? inPool : 0), c: link.length});
    warn.textContent = link.length > 2000 ? t('sh_long') : '';
  };
  pc.onchange = build;
  build();
  dialog({title: t('sh_title'), body, ok: t('sh_copy'), wide: true, onOk: async () => {
    area.select();
    try { await navigator.clipboard.writeText(link); toast(t('t_link_copied')); } catch { document.execCommand('copy'); toast(t('t_link_copied')); }
    return false;  // stays open, the link may be needed again
  }});
}

/* ================= common games of several people ================= */
// Each person makes a link with every game they have launched: #games= {v, n: nickname, g: sorted appids as
// differences, which pack much shorter}. Whoever collects the links gets a list of the games all of them launched.
const GAMES_TAG = '#games=', COMMON_TAG = '#common';
async function packGames(nick, ids) {
  const s = [...new Set(ids)].sort((a, b) => a - b);
  return shareBase() + GAMES_TAG + await packShare({v: 1, n: nick, g: s.map((x, i) => i ? x - s[i - 1] : x)});
}
// every #games= link in a piece of text: [{code, n, ids}]
async function gamesFromText(text) {
  const out = [], seen = new Set();
  for (const m of text.matchAll(/#games=([A-Za-z0-9_-]+)/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    try {
      const d = await unpackShare(m[1]);
      let x = 0; const ids = cleanIds((Array.isArray(d.g) ? d.g : []).slice(0, SHARE_MAX_GAMES).map(v => x += +v));
      if (ids.length) out.push({code: m[1], n: String(d.n || '').slice(0, 40), ids});
    } catch {}
  }
  return out;
}

function openCommonGames(prefill = '') {
  const body = sxEl('div', 'sx common-games');
  const how = sxEl('ol', 'cg-how');
  for (const k of ['cg_how1', 'cg_how2', 'cg_how3']) how.append(sxEl('li', '', t(k)));
  // a ready message for the chat: the link opens this same dialog at the friend's end
  const invite = sxEl('button', 'btn', t('cg_invite'));
  invite.onclick = async () => {
    const msg = t('cg_invite_text', {url: shareBase() + COMMON_TAG});
    try { await navigator.clipboard.writeText(msg); toast(t('t_cg_invite'), 3500); } catch { toast(msg, 15000); }
  };
  const ir = sxEl('div', 'st-row'); ir.append(invite);
  body.append(how, ir);

  // part 1: my own link
  body.append(sxEl('h4', '', '1. ' + t('cg_mine')));
  const nick = document.createElement('input'); nick.type = 'text'; nick.className = 'dlg-input'; nick.maxLength = 40; nick.placeholder = t('cg_nick');
  try { nick.value = localStorage.getItem('tierlist.nick') || ''; } catch {}
  const nr = sxEl('label', 'tw-row'); nr.append(sxEl('span', '', t('cg_nick_lbl')), nick);
  const mine = document.createElement('textarea'); mine.className = 'dlg-input share-link'; mine.readOnly = true; mine.rows = 3; mine.hidden = true;
  const copy = sxEl('button', 'btn primary', t('sh_copy')); copy.hidden = true;
  const mineInfo = sxEl('span', 'muted', '');
  let myIds = null;
  const makeMine = async () => {
    if (!myIds) return;
    try { localStorage.setItem('tierlist.nick', nick.value.trim()); } catch {}
    const link = await packGames(nick.value.trim() || t('grp_me'), myIds);
    mine.value = link; mine.hidden = copy.hidden = false;
    mineInfo.textContent = t('cg_mine_n', {n: myIds.length, c: link.length});
    // I count as one of the players: my entry goes into the list below and is replaced when the nickname changes
    const [me] = await gamesFromText(link);
    people = [{...me, mine: true}, ...people.filter(p => !p.mine)];
    render();
  };
  nick.oninput = () => { clearTimeout(nick.t); nick.t = setTimeout(makeMine, 400); };
  copy.onclick = async () => { mine.select(); try { await navigator.clipboard.writeText(mine.value); } catch { document.execCommand('copy'); } toast(t('t_link_copied')); };
  const cr = sxEl('div', 'st-row'); cr.append(copy, mineInfo);
  body.append(nr, localconfigStep(t('cg_file'), async f => {
    if (!f) return;
    try { myIds = (await playedFromConfig(f)).map(p => p.appid); } catch { toast(t('st_imp_bad_cfg'), 5000); return; }
    makeMine();
  }), mine, cr);

  // part 2: one field and an Add button; the added people are listed below it
  body.append(sxEl('h4', '', '2. ' + t('cg_all')), sxEl('p', 'muted sx-hint', t('cg_all_hint')));
  const link = document.createElement('input'); link.type = 'text'; link.className = 'dlg-input'; link.placeholder = t('cg_link_ph');
  const addBtn = sxEl('button', 'btn primary', t('cg_add'));
  const ar = sxEl('div', 'cg-add'); ar.append(link, addBtn);
  const who = sxEl('div', 'cg-list'), res = sxEl('p', 'cg-res');
  body.append(ar, who, res);
  let people = [];
  const render = () => {
    who.replaceChildren(...people.map((p, i) => {
      const r = sxEl('div', 'cg-person');
      r.append(sxEl('b', '', (p.n || t('grp_person', {n: i + 1})) + (p.mine ? ' ' + t('cg_you') : '')), sxEl('span', 'muted', t('cg_games_n', {n: p.ids.length})));
      const x = sxEl('button', 'btn icon-btn', '✕'); x.title = t('sel_del');
      x.onclick = () => { people.splice(i, 1); render(); };
      r.append(x);
      return r;
    }));
    res.textContent = people.length < 2 ? t('cg_need2') : t('cg_common', {n: commonIds(people).length, p: people.length});
  };
  // adds every link found in the text (a pasted chat message may hold several)
  const add = async text => {
    const found = await gamesFromText(text);
    if (!found.length) { if (text.trim()) toast(t('cg_bad_link'), 4500); return; }
    let added = 0;
    for (const p of found) if (!people.some(x => x.code === p.code)) { people.push(p); added++; }
    if (!added) toast(t('cg_dup'), 3000);
    render();
  };
  addBtn.onclick = async () => { await add(link.value); link.value = ''; link.focus(); };
  // Enter adds the link instead of closing the dialog
  link.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addBtn.click(); } };
  render();
  if (prefill) add(prefill);
  dialog({title: t('cg_title'), body, ok: t('cg_make'), wide: true, onOk: async () => {
    if (link.value.trim()) { await add(link.value); link.value = ''; }
    if (people.length < 2) { toast(t('cg_need2'), 3500); return false; }
    if (!commonIds(people).length) { toast(t('cg_none'), 4000); return false; }
    makeCommonList(people);
  }});
}
const commonIds = people => people.length ? people[0].ids.filter(id => people.every(p => p.ids.includes(id))) : [];

async function makeCommonList(people) {
  const ids = commonIds(people), apps = new Map();
  await lookupApps(ids, apps, 'sh_names');
  // only games: tools, soundtracks and demos that everybody happens to have are left out
  const games = ids.filter(id => /^(game|mod)$/i.test(apps.get(id)?.type || '')).map(id => steamGame(id, apps.get(id)))
    .sort((a, b) => collator.compare(a.name, b.name));
  if (!games.length) { toast(t('cg_none'), 5000); return; }
  const blobs = await steamCovers(games, 'sh_covers'), imgs = [];
  games.forEach((g, k) => { if (blobs[k]) imgs.push({id: 's' + g.appid, name: g.name, note: '', key: 'steam:' + g.appid, steam: {appid: g.appid}, blob: blobs[k]}); });
  if (!imgs.length) { toast(t('cg_none'), 5000); return; }
  const s = defaultState();
  s.pool = imgs.map(r => r.id);
  const names = people.map((p, i) => p.n || t('grp_person', {n: i + 1})).join(', ');
  await finishImport({name: t('cg_list_name', {names}).slice(0, 80), state: s}, imgs, [], 'Steam');
}

/* ================= opening a link ================= */
async function checkShareLink() {
  if (location.hash === COMMON_TAG) {  // an invitation: just the dialog
    history.replaceState(null, '', location.pathname + location.search);
    openCommonGames();
    return;
  }
  if (location.hash.startsWith(GAMES_TAG)) {
    // someone's games link: open the collecting dialog with it already in
    const link = location.href;
    history.replaceState(null, '', location.pathname + location.search);
    openCommonGames(link);
    return;
  }
  if (!location.hash.startsWith(SHARE_TAG)) return;
  const code = location.hash.slice(SHARE_TAG.length);
  // the link is used once; a reload must not open it again
  history.replaceState(null, '', location.pathname + location.search);
  let data;
  try {
    data = await unpackShare(code);
    if (!Array.isArray(data.r)) throw 0;
    // only the expected shape goes on: at most 30 rows, plain text labels, game numbers
    data = {n: String(data.n || 'Steam').slice(0, 80), p: cleanIds(data.p),
      r: data.r.slice(0, 30).map(x => [String(x?.[0] ?? '').slice(0, 200), String(x?.[1] ?? ''), cleanIds(x?.[2])])};
  } catch { toast(t('sh_bad'), 5000); return; }
  const n = data.r.reduce((a, x) => a + x[2].length, 0) + (data.p || []).length;
  const body = sxEl('p', 'muted', t('sh_open_body', {n, r: data.r.filter(x => x[2].length).length}));
  dialog({title: t('sh_open_title', {name: data.n || 'Steam'}), body, ok: t('sh_open'), onOk: () => { openShared(data); }});
}
addEventListener('hashchange', checkShareLink);

async function openShared(data) {
  const all = cleanIds([...new Set([...data.r.flatMap(x => x[2]), ...(data.p || [])])]);
  const apps = new Map();
  await lookupApps(all, apps, 'sh_names');
  const games = all.filter(id => apps.get(id)?.name).map(id => steamGame(id, apps.get(id)));
  const blobs = await steamCovers(games, 'sh_covers'), imgs = [], got = new Set();
  games.forEach((g, k) => {
    if (!blobs[k]) return;
    got.add(g.appid);
    imgs.push({id: 's' + g.appid, name: g.name, note: '', key: 'steam:' + g.appid, steam: {appid: g.appid}, blob: blobs[k]});
  });
  if (!imgs.length) { toast(t('sh_bad'), 5000); return; }
  const s = defaultState(), ids = list => list.filter(id => got.has(id)).map(id => 's' + id);
  s.tiers = data.r.map(([label, color, list]) => ({id: uid(), label: String(label), color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#888888', items: ids(list)}));
  s.pool = ids(data.p || []);
  await finishImport({name: String(data.n || 'Steam').slice(0, 80), state: s}, imgs, [], 'Steam');
}
