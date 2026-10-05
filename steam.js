'use strict';
// Steam import, all in the browser. The person picks the userdata folder of their Steam client, and in it
// userdata/<number>/config/localconfig.vdf tells which games were launched, minutes played and the last launch.
// Names, types and cover file names come from steamcmd.net (a public mirror of Steam's app data) by game number,
// the covers from Steam's picture server; both allow requests from any site.
// The result is a new list; every picture carries steam: {appid, min, last}.

const STEAM_CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/';
const STEAM_LANG = {ru: 'russian', uk: 'ukrainian', de: 'german', fr: 'french', es: 'spanish', pt: 'brazilian', pl: 'polish', tr: 'turkish', zh: 'schinese', ja: 'japanese'};

/* ================= file formats ================= */
// text KeyValues: "key" "value" and "key" { ... }; keys are lowercased for lookups
function parseVdfText(text) {
  const root = {}, stack = [];
  let cur = root, key = null;
  for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"|([{}])/g)) {
    if (m[2] === '{') { const child = {}; if (key != null) cur[key.toLowerCase()] = child; stack.push(cur); cur = child; key = null; }
    else if (m[2] === '}') cur = stack.pop() || root;
    else { const s = m[1].replace(/\\(.)/g, '$1'); if (key == null) key = s; else { cur[key.toLowerCase()] = s; key = null; } }
  }
  return root;
}
const lowerKeys = o => o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), lowerKeys(v)])) : o;
// a 600x900 cover from a wide picture: the picture itself in the middle over a blurred, darkened copy of it
async function tallFromWide(blob) {
  const bm = await createImageBitmap(blob), W = 600, H = 900;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const k = H / bm.height, bw = bm.width * k;
  ctx.filter = 'blur(24px) brightness(.55)';
  ctx.drawImage(bm, (W - bw) / 2, 0, bw, H);
  ctx.filter = 'none';
  const h = bm.height * W / bm.width;
  ctx.drawImage(bm, 0, (H - h) / 2, W, h);
  bm.close();
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(), 'image/jpeg', .9));
}

/* ================= the dialog ================= */
function steamPaths() {
  const p = navigator.userAgentData?.platform || navigator.platform || '';
  if (/mac/i.test(p)) return {root: '~/Library/Application Support/Steam', sep: '/'};
  if (/linux/i.test(p)) return {root: '~/.steam/steam', sep: '/'};
  return {root: 'C:\\Program Files (x86)\\Steam', sep: '\\'};
}
// The games file sits in userdata/<account number>/config/, and nobody knows their number. So the person picks
// (or drags in) the whole userdata folder and the file is found inside; picking the file itself stays as a fallback.
function localconfigStep(title, onFile) {
  const {root, sep} = steamPaths(), path = [root, 'userdata'].join(sep);
  const box = sxEl('div', 'steam-step steam-drop');
  box.append(sxEl('b', '', title));
  const pathRow = sxEl('div', 'steam-path');
  const copy = sxEl('button', 'btn', t('st_imp_copy'));
  copy.onclick = () => navigator.clipboard?.writeText(path).then(() => toast(t('t_copied_path')), () => {});
  pathRow.append(sxEl('code', '', path), copy);
  box.append(pathRow, sxEl('div', 'muted sx-hint', t('st_folder_tip')));
  const dir = document.createElement('input'); dir.type = 'file'; dir.webkitdirectory = true; dir.hidden = true;
  const one = document.createElement('input'); one.type = 'file'; one.accept = '.vdf'; one.hidden = true;
  const pickDir = sxEl('button', 'btn primary', t('st_folder_btn')), manual = sxEl('button', 'btn', t('st_manual'));
  const status = sxEl('span', 'steam-status', '');
  const done = found => {
    status.textContent = found ? '✓ ' + (found.acc ? t('st_found', {id: found.acc}) : found.file.name) : t('st_notfound');
    status.classList.toggle('bad', !found);
    box.classList.toggle('ok', !!found);
    onFile(found ? found.file : null);
  };
  pickDir.onclick = () => dir.click();
  manual.onclick = () => one.click();
  dir.onchange = () => { const list = [...dir.files].map(f => ({file: f, path: f.webkitRelativePath})); dir.value = ''; done(pickConfig(list)); };
  one.onchange = () => { const f = one.files[0]; one.value = ''; if (f) done({file: f, acc: ''}); };
  // dropping a folder on the block: it must not reach the page, which would add the files as pictures
  box.ondragover = e => { e.preventDefault(); e.stopPropagation(); box.classList.add('over'); };
  box.ondragleave = () => box.classList.remove('over');
  box.ondrop = async e => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); done(pickConfig(await configsFromDrop(e.dataTransfer))); };
  const row = sxEl('div', 'st-row'); row.append(pickDir, manual, status);
  box.append(row, sxEl('div', 'muted sx-hint', t('st_drop')), sxEl('div', 'muted sx-hint', t('st_manual_tip')), dir, one);
  return box;
}
// the newest */config/localconfig.vdf of a picked folder: {file, acc: account number}
function pickConfig(list) {
  const c = list.filter(x => /(^|\/)config\/localconfig\.vdf$/i.test(x.path)).sort((a, b) => b.file.lastModified - a.file.lastModified)[0];
  if (!c) return null;
  const acc = c.path.split('/').slice(-3)[0];
  return {file: c.file, acc: /^\d+$/.test(acc) ? acc : ''};
}
// a dropped folder is walked only along the way to the file (Steam → userdata → number → config), not through the games
async function configsFromDrop(dt) {
  const out = [], roots = [...(dt.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  const list = d => new Promise(res => { const r = d.createReader(), all = []; const next = () => r.readEntries(b => { if (!b.length) return res(all); all.push(...b); next(); }, () => res(all)); next(); });
  const walk = async (en, depth) => {
    if (en.isFile) {
      if (/^localconfig\.vdf$/i.test(en.name)) out.push({file: await new Promise((r, j) => en.file(r, j)).catch(() => null), path: en.fullPath.replace(/^\//, '')});
      return;
    }
    if (depth > 4) return;
    const go = depth === 0 || /^(userdata|config|steam|\d+)$/i.test(en.name);
    if (go) for (const c of await list(en)) await walk(c, depth + 1);
  };
  for (const r of roots) await walk(r, 0);
  return out.filter(x => x.file);
}
// every app ever launched on this account: [{appid, min, last}]; throws on a wrong file
async function playedFromConfig(file) {
  const list = parseVdfText(await file.text()).userlocalconfigstore?.software?.valve?.steam?.apps;
  if (!list) throw new Error('localconfig');
  const out = [];
  for (const [id, a] of Object.entries(list)) {
    const min = +a.playtime || 0, last = +a.lastplayed || 0;
    if (/^\d+$/.test(id) && (min > 0 || last > 0) && id !== '228980') out.push({appid: +id, min, last});
  }
  return out;
}

function openSteamImport() {
  let cfg = null;
  const body = sxEl('div', 'sx steam-imp');
  body.append(sxEl('p', 'muted sx-hint', t('st_imp_hint')));
  body.append(sxEl('p', 'muted sx-hint', t('st_imp_net')));
  body.append(localconfigStep(t('st_imp_cfg'), f => cfg = f));
  // with friends only the games everyone has played are wanted: a separate, simpler way
  const common = sxEl('button', 'btn', t('cg_from_import'));
  common.onclick = () => { closeDialog(); openCommonGames(); };
  const all = document.createElement('label'); all.className = 'st-check';
  all.innerHTML = '<input type="checkbox"> <span></span>'; all.querySelector('span').textContent = t('st_imp_all');
  const cr = sxEl('div', 'st-row steam-common'); cr.append(sxEl('span', 'muted', t('cg_from_import_q')), common);
  body.append(all, cr);
  dialog({title: t('st_imp_title'), body, ok: t('st_imp_go'), wide: true, onOk: async () => {
    if (!cfg) { toast(t('st_imp_need'), 3500); return false; }
    importSteam(cfg, all.querySelector('input').checked);
  }});
}

/* ================= names and covers ================= */
// apps the local file doesn't know (or all of them, for a shared link) are asked from steamcmd.net,
// a public mirror of the same Steam data; apps: Map appid -> common section, filled in place
async function lookupApps(ids, apps, label) {
  let done = 0;
  for (let i = 0; i < ids.length; i += 8) {
    toast(t(label, {n: done, of: ids.length}), 60000);
    await Promise.all(ids.slice(i, i + 8).map(async id => {
      try { const j = await (await fetch('https://api.steamcmd.net/v1/info/' + id)).json(); const c = j?.data?.[id]?.common; if (c?.name) apps.set(id, lowerKeys(c)); } catch {}
    }));
    done = Math.min(ids.length, i + 8);
  }
}
// name and cover addresses of one game in the person's language
function steamGame(appid, c) {
  const sl = STEAM_LANG[lang] || 'english', pick = o => o && (o[sl] || o.english || Object.values(o)[0]);
  const name = String(c.name_localized?.[sl] || c.name).replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
  // the cover's file name has a hash in it for newer games; older ones still have the plain one
  const cap = c.library_assets_full?.library_capsule, urls = [];
  for (const size of ['image2x', 'image']) { const f = pick(cap?.[size]); if (f) urls.push(STEAM_CDN + appid + '/' + f); }
  urls.push(`${STEAM_CDN}${appid}/library_600x900_2x.jpg`, `${STEAM_CDN}${appid}/library_600x900.jpg`);
  return {appid, name, urls, header: STEAM_CDN + appid + '/' + (pick(c.header_image) || 'header.jpg')};
}
// downloads the covers 8 at a time; returns blobs in the order of games (null where none was found)
async function steamCovers(games, label) {
  const load = async u => {
    // only real pictures are kept, whatever the address turned out to point at
    try { const r = await fetch(u); if (r.ok) { const b = await r.blob(); if (b.size > 2000 && /^image\/(jpeg|png|webp)$/.test(b.type)) return b; } } catch {}
    return null;
  };
  const get = async g => {
    for (const u of g.urls) { const b = await load(u); if (b) return b; }
    // some old games have no tall cover at all: one is made from the wide store picture
    const h = await load(g.header);
    return h && tallFromWide(h).catch(() => null);
  };
  const out = [];
  for (let i = 0; i < games.length; i += 8) {
    out.push(...await Promise.all(games.slice(i, i + 8).map(get)));
    toast(t(label, {n: out.length, of: games.length}), 60000);
  }
  return out;
}

async function importSteam(cfgFile, all) {
  const apps = new Map();
  let played;
  try { played = await playedFromConfig(cfgFile); } catch { toast(t('st_imp_bad_cfg'), 5000); return; }
  await lookupApps(played.map(p => p.appid), apps, 'st_imp_lookup');

  const games = [];
  for (const p of played) {
    const c = apps.get(p.appid); if (!c?.name) continue;
    const type = String(c.type || '').toLowerCase();
    if (!all && type !== 'game' && type !== 'mod') continue;
    games.push({...p, ...steamGame(p.appid, c)});
  }
  if (!games.length) { toast(t('st_imp_none'), 5000); return; }
  games.sort((a, b) => b.min - a.min);
  const blobs = await steamCovers(games, 'st_imp_progress'), imgs = [];
  games.forEach((g, k) => {
    if (blobs[k]) imgs.push({id: 's' + g.appid, name: g.name, note: '', key: 'steam:' + g.appid, steam: {appid: g.appid, min: g.min, last: g.last}, blob: blobs[k]});
  });
  if (!imgs.length) { toast(t('st_imp_none'), 5000); return; }
  const s = defaultState();
  s.pool = imgs.map(r => r.id);
  await finishImport({name: 'Steam', state: s}, imgs, [], 'Steam');
}
