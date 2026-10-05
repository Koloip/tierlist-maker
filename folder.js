'use strict';
// Keeping a list in an ordinary folder on disk (File System Access API: Chrome and Edge on a computer).
// The folder holds tierlist.json (rows, ratings, notes) and one file per picture in images/ and spin/.
// With "pictures only in the folder" the browser keeps no copy of the tier list pictures, which frees its storage;
// they are read back from the folder on start. app.js calls loadFolderImages() during init and scheduleFolder() after saves.

const HAS_FS = 'showDirectoryPicker' in window;
const dirKey = id => 'dir:' + id;
const curProj = () => meta.projects.find(p => p.id === project);
const keepBlobs = () => !curProj()?.dirOnly;
let dirHandle = null, folderTimer = 0, folderBusy = false, folderDirty = false, permAsked = false;

const EXT = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a'};
const fileOf = r => r.id + '.' + (EXT[r.blob?.type] || 'bin');

async function writeFile(dir, name, data) {
  const w = await (await dir.getFileHandle(name, {create: true})).createWritable();
  await w.write(data); await w.close();
}
async function fileNames(dir) {
  const out = new Set();
  for await (const [name, h] of dir.entries()) if (h.kind === 'file') out.add(name);
  return out;
}
const granted = async h => (await h.queryPermission({mode: 'readwrite'})) === 'granted';

/* ================= writing ================= */
function scheduleFolder() {
  if (!dirHandle) return;
  clearTimeout(folderTimer); folderTimer = setTimeout(syncFolder, 1200);
}
// writes new pictures, removes files of deleted ones and rewrites tierlist.json
async function syncFolder() {
  if (!dirHandle || !state) return false;
  if (folderBusy) { folderDirty = true; return false; }
  if (!await granted(dirHandle)) {
    // a new permission can only be asked after a click, so the user gets a button
    if (!permAsked) {
      permAsked = true;
      toast(t('t_folder_perm'), 15000, {label: t('folder_allow'), fn: async () => {
        if ((await dirHandle.requestPermission({mode: 'readwrite'})) === 'granted') { permAsked = false; syncFolder(); }
      }});
    }
    return false;
  }
  folderBusy = true;
  let ok = true;
  try {
    for (const [sub, map] of [['images', images], ['spin', simgs]]) {
      const dir = await dirHandle.getDirectoryHandle(sub, {create: true});
      const have = await fileNames(dir), want = new Set();
      for (const r of map.values()) { const f = fileOf(r); want.add(f); if (!have.has(f)) await writeFile(dir, f, r.blob); }
      for (const f of have) if (!want.has(f)) await dir.removeEntry(f).catch(() => {});
    }
    const list = map => [...map.values()].map(r => ({id: r.id, name: r.name, note: r.note || '', key: r.key, steam: r.steam, type: r.blob.type, file: fileOf(r)}));
    await writeFile(dirHandle, 'tierlist.json', JSON.stringify({format: FILE_FORMAT, version: 2, name: projName(curProj()), state, images: list(images), spin: list(simgs)}));
  } catch (e) { ok = false; toast(t('t_folder_fail', {e: e.message || e}), 6000); }
  folderBusy = false;
  if (folderDirty) { folderDirty = false; scheduleFolder(); }
  return ok;
}

/* ================= reading ================= */
async function readFolder(h) {
  const data = JSON.parse(await (await (await h.getFileHandle('tierlist.json')).getFile()).text());
  if (data.format !== FILE_FORMAT || !data.state) throw new Error('format');
  const read = async (sub, list) => {
    const dir = await h.getDirectoryHandle(sub).catch(() => null), out = [];
    for (const r of list || []) {
      try { const f = await (await dir.getFileHandle(r.file)).getFile(); out.push({...r, blob: f.slice(0, f.size, safeType(r.type))}); } catch {}
    }
    return out;
  };
  return {data, images: await read('images', data.images), spin: await read('spin', data.spin)};
}
// for a list kept only in the folder: asks for permission if needed and loads its pictures; false when the page reloads
async function loadFolderImages(p) {
  dirHandle = await tx('kv', 'readonly', s => s.get(dirKey(p.id))) || null;
  const others = meta.projects.filter(x => x.id !== p.id);
  while (true) {
    if (dirHandle && !await granted(dirHandle)) {
      const choice = await new Promise(res => dialog({
        title: t('folder_perm', {name: projName(p)}), ok: t('folder_open'), danger: false,
        cancel: others.length ? t('folder_other') : t('cancel'),
        onOk: async () => { if ((await dirHandle.requestPermission({mode: 'readwrite'})) !== 'granted') return false; res('ok'); },
        onCancel: () => res('cancel'),
      }));
      if (choice === 'cancel') { if (others.length) { await switchProject(others[0].id); return false; } continue; }
    }
    try {
      if (!dirHandle) throw new Error('no folder');
      const {images: recs} = await readFolder(dirHandle);
      recs.forEach(r => images.set(r.id, {id: r.id, project: p.id, name: r.name, note: r.note, key: r.key, ...(r.steam && {steam: r.steam}), blob: r.blob, url: URL.createObjectURL(r.blob)}));
      return true;
    } catch {
      // the folder was moved or deleted: let the user point at it again
      const picked = await new Promise(res => dialog({
        title: t('folder_missing', {name: projName(p)}), ok: t('folder_pick'), danger: false,
        cancel: others.length ? t('folder_other') : t('cancel'),
        onOk: async () => { const h = await showDirectoryPicker({id: 'tierlist', mode: 'readwrite'}).catch(() => null); if (!h) return false; res(h); },
        onCancel: () => res(null),
      }));
      if (picked) { dirHandle = picked; await tx('kv', 'readwrite', s => s.put(picked, dirKey(p.id))); p.dir = picked.name; await saveMeta(); }
      else if (others.length) { await switchProject(others[0].id); return false; }
    }
  }
}

/* ================= connecting ================= */
async function connectFolder() {
  const h = await showDirectoryPicker({id: 'tierlist', mode: 'readwrite'}).catch(() => null);
  if (!h) return;
  let hasList = false;
  try { await h.getFileHandle('tierlist.json'); hasList = true; } catch {}
  if (hasList) {
    // a folder with a saved list is opened as a new list instead of being overwritten
    if (!await ask(t('folder_has_list', {name: h.name}), t('folder_open'), false)) return;
    toast(t('t_importing'), 60000);
    try { const r = await readFolder(h); await finishImport(r.data, r.images, r.spin, h.name, h); }
    catch { toast(t('t_bad_file'), 4000); }
    return;
  }
  dirHandle = h;
  await tx('kv', 'readwrite', s => s.put(h, dirKey(project)));
  curProj().dir = h.name; await saveMeta();
  toast(t('t_folder_saving'), 60000);
  if (await syncFolder()) toast(t('t_folder_done'));
  openStorage();
}
async function disconnectFolder() {
  const p = curProj();
  if (p.dirOnly) await setFolderOnly(false);
  dirHandle = null;
  await tx('kv', 'readwrite', s => s.delete(dirKey(project)));
  delete p.dir; await saveMeta();
  openStorage();
}
// on: everything is written to the folder first, then the browser copies of the pictures are dropped
async function setFolderOnly(on) {
  const p = curProj();
  if (on) {
    toast(t('t_folder_saving'), 60000);
    if (!await syncFolder()) return;
    const dir = await dirHandle.getDirectoryHandle('images'), have = await fileNames(dir);
    if ([...images.values()].some(r => !have.has(fileOf(r)))) { toast(t('t_folder_fail', {e: 'images'}), 6000); return; }
    await tx('images', 'readwrite', s => images.forEach((r, id) => s.delete(id)));
    await tx('thumbs', 'readwrite', s => images.forEach((r, id) => s.delete(id)));
    p.dirOnly = true;
  } else {
    await tx('images', 'readwrite', s => images.forEach(r => s.put({...recOf(r), project})));
    delete p.dirOnly;
  }
  await saveMeta();
  toast(t('t_folder_done'));
}

/* ================= the Storage dialog ================= */
async function openStorage() {
  const p = curProj(), body = document.createElement('div'); body.className = 'storage';
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const line = (text, cls = 'muted') => { const d = document.createElement('p'); d.className = cls; d.textContent = text; body.appendChild(d); return d; };
  const btn = (text, fn, cls = 'btn') => { const b = document.createElement('button'); b.className = cls; b.textContent = text; b.onclick = fn; return b; };
  const row = (...els) => { const d = document.createElement('div'); d.className = 'st-row'; d.append(...els); body.appendChild(d); return d; };
  if (est?.usage != null) line(t('st_usage', {mb: (est.usage / 1048576).toFixed(1)}), 'st-big');
  line(t('st_note'));

  const h = document.createElement('h4'); h.textContent = t('folder_connect').replace(/…$/, ''); body.appendChild(h);
  if (!HAS_FS) line(t('folder_unsupported'));
  else if (!dirHandle) {
    line(t('folder_hint'));
    row(btn(t('folder_connect'), () => { closeDialog(); connectFolder(); }, 'btn primary'));
  } else {
    line(t('folder_name', {name: dirHandle.name}), 'st-folder');
    row(btn(t('folder_sync'), async () => { toast(t('t_folder_saving'), 60000); if (await syncFolder()) toast(t('t_folder_done')); }),
      btn(t('folder_disconnect'), () => { closeDialog(); disconnectFolder(); }));
    const l = document.createElement('label'); l.className = 'st-check';
    l.innerHTML = '<input type="checkbox"> <span></span>'; l.querySelector('span').textContent = t('folder_only');
    const c = l.querySelector('input'); c.checked = !!p.dirOnly;
    c.onchange = async () => { c.disabled = true; await setFolderOnly(c.checked); c.checked = !!curProj().dirOnly; c.disabled = false; };
    body.appendChild(l);
  }

  const h2 = document.createElement('h4'); h2.textContent = t('st_title'); body.appendChild(h2);
  row(btn(t('st_clean'), async () => { toast(t('t_cleaned', {n: await cleanLeftovers()}), 3500); closeDialog(); openStorage(); }));
  line(t('st_clean_hint'), 'muted st-hint');
  row(btn(t('st_wipe'), wipeAll, 'btn danger'));
  line(t('st_wipe_hint'), 'muted st-hint');
  dialog({title: t('st_title'), body, ok: null, cancel: t('close'), wide: true});
}
// records of lists that no longer exist (and kv keys of them) are removed
async function cleanLeftovers() {
  const ids = new Set(meta.projects.map(p => p.id));
  let n = 0;
  const alive = new Set();
  for (const store of ['images', 'spin']) {
    const all = await tx(store, 'readonly', s => s.getAllKeys());
    const dead = (await tx(store, 'readonly', s => s.getAll())).filter(r => !ids.has(projOf(r))).map(r => r.id);
    n += dead.length;
    await tx(store, 'readwrite', s => dead.forEach(id => s.delete(id)));
    const d = new Set(dead); all.forEach(id => d.has(id) || alive.add(id));
  }
  // small copies of pictures that are gone; the open list may be kept in a folder, so its pictures count as alive
  images.forEach((r, id) => alive.add(id));
  const deadThumbs = (await tx('thumbs', 'readonly', s => s.getAllKeys())).filter(id => !alive.has(id));
  await tx('thumbs', 'readwrite', s => deadThumbs.forEach(id => s.delete(id)));
  n += deadThumbs.length;
  const keys = await tx('kv', 'readonly', s => s.getAllKeys());
  const deadKeys = keys.filter(k => /^(state|dir):/.test(k) && !ids.has(k.split(':')[1]));
  n += deadKeys.length;
  await tx('kv', 'readwrite', s => deadKeys.forEach(k => s.delete(k)));
  return n;
}
async function wipeAll() {
  closeDialog();
  if (!await ask(t('c_st_wipe'), t('sel_del'))) return;
  clearTimeout(saveTimer); state = null; db.close();
  await new Promise(res => { const r = indexedDB.deleteDatabase('tierlist-maker'); r.onsuccess = r.onerror = r.onblocked = res; });
  location.reload();
}
