'use strict';
// Twitch chat voting in Compare and Tournament. The chat is read anonymously through Twitch's public chat
// websocket: no login and no keys, and nothing is ever written to the chat. Viewers write 1 or 2 for the
// left or the right picture; each viewer has one vote per pair and the last one counts. The counts show on
// the cards. With "decide automatically" the majority picks once the time is up (a tie waits a bit longer).
// app.js and tour.js call twPaint() after drawing a pair.

const TW_KEY = 'tierlist.twitch';
const tw = {ws: null, channel: '', joined: false, manual: false, votes: new Map(), key: '', until: 0, retry: 0,
  ...(() => { try { return JSON.parse(localStorage.getItem(TW_KEY)) || {}; } catch { return {}; } })()};
tw.auto ??= false; tw.secs ??= 20;
const twSave = () => { try { localStorage.setItem(TW_KEY, JSON.stringify({channel: tw.channel, auto: tw.auto, secs: tw.secs})); } catch {} };

/* ================= connection ================= */
function twConnect(channel) {
  twDisconnect();
  tw.channel = channel.toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/[^a-z0-9_]/g, '');
  if (!tw.channel) return;
  tw.manual = false; twSave();
  const ws = tw.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  ws.onopen = () => {
    ws.send('PASS SCHMOOPIIE');
    ws.send('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000)));  // the anonymous read-only login
    ws.send('JOIN #' + tw.channel);
  };
  ws.onmessage = e => {
    for (const line of String(e.data).split('\r\n')) {
      if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
      if (/ 366 /.test(line) && !tw.joined) { tw.joined = true; tw.retry = 0; toast(t('t_tw_on', {ch: tw.channel})); twPaint(); continue; }
      const m = /^:(\w+)!\S+ PRIVMSG #\S+ :(.*)$/.exec(line);
      const v = m && /^\s*([12])\b/.exec(m[2]);
      if (v) twVote(m[1], +v[1] - 1);
    }
  };
  ws.onclose = () => {
    const was = tw.joined; tw.joined = false; tw.ws = null; twPaint();
    if (tw.manual) return;
    if (!was && tw.retry >= 2) { toast(t('t_tw_fail'), 5000); return; }
    tw.retry++; setTimeout(() => !tw.manual && !tw.ws && twConnect(tw.channel), 3000);  // dropped: try again
  };
}
function twDisconnect() {
  tw.manual = true; tw.joined = false;
  if (tw.ws) { tw.ws.onclose = null; tw.ws.close(); tw.ws = null; }
  tw.votes.clear(); twPaint();
}

/* ================= votes ================= */
// the pair on screen: Compare's pair or the tournament's current match
function twCurrent() {
  if (view === 'cmp' && pair) return {key: 'c' + pair.join('|'), cards: document.querySelectorAll('#arena .card'), pick: side => vote(side), draw: () => vote(.5)};
  if (view === 'tour' && state.tour && !tourHidden()) {
    const c = curMatch();
    if (c) return {key: `t${c.r}_${c.m}`, cards: document.querySelectorAll('#tourStage .card'), pick: side => tourPick(side), draw: null};
  }
  return null;
}
function twSync(cur) {
  if (cur && cur.key !== tw.key) { tw.key = cur.key; tw.votes.clear(); tw.until = Date.now() + tw.secs * 1000; }
}
function twVote(user, side) {
  const cur = twCurrent(); if (!cur) return;
  twSync(cur);
  tw.votes.set(user, side);
  twPaint();
}
const twCounts = () => { const c = [0, 0]; for (const s of tw.votes.values()) c[s]++; return c; };

// numbers on the cards and the button text
function twPaint() {
  const on = !!tw.joined;
  document.querySelectorAll('.tw-btn').forEach(b => { b.classList.toggle('on', on); b.textContent = on ? '● #' + tw.channel : t('tw_btn'); });
  document.querySelectorAll('.tw-badge').forEach(e => e.remove());
  const cur = on && twCurrent(); if (!cur) return;
  twSync(cur);
  const c = twCounts(), sum = c[0] + c[1];
  cur.cards.forEach((card, i) => {
    const b = sxEl('div', 'tw-badge' + (sum && c[i] > c[1 - i] ? ' lead' : ''));
    b.append(sxEl('b', '', c[i]), sxEl('span', '', sum ? Math.round(c[i] / sum * 100) + '%' : ''));
    const fill = sxEl('i'); fill.style.width = (sum ? c[i] / sum * 100 : 0) + '%'; b.append(fill);
    card.append(b);
  });
  const left = tw.auto ? Math.max(0, Math.ceil((tw.until - Date.now()) / 1000)) : null;
  document.querySelectorAll('.tw-btn').forEach(b => b.textContent = '● #' + tw.channel + ' · ' + t('tw_votes', {n: sum}) + (left != null ? ' · ' + left + ' ' + t('tw_sec') : ''));
}
// automatic decision: when the time is up and there are votes; no votes or a tie in the tournament waits longer
setInterval(() => {
  // keeps going in a background tab too: on a stream the browser window is often behind OBS
  if (!tw.joined || !tw.auto) return;
  const cur = twCurrent(); if (!cur) return;
  twSync(cur);
  if (Date.now() < tw.until) { twPaint(); return; }
  const [a, b] = twCounts();
  if (a === b && (!a || !cur.draw)) { tw.until = Date.now() + 5000; twPaint(); return; }
  a === b ? cur.draw() : cur.pick(a > b ? 0 : 1);
}, 500);

/* ================= the dialog ================= */
function openTwitch() {
  const body = sxEl('div', 'sx tw-dlg');
  body.append(sxEl('p', 'muted sx-hint', t('tw_hint')));
  const ch = document.createElement('input'); ch.type = 'text'; ch.className = 'dlg-input'; ch.placeholder = 'twitch.tv/…'; ch.value = tw.channel;
  const l1 = sxEl('label', 'tw-row'); l1.append(sxEl('span', '', t('tw_channel')), ch);
  const auto = document.createElement('input'); auto.type = 'checkbox'; auto.checked = tw.auto;
  const secs = document.createElement('input'); secs.type = 'number'; secs.min = 5; secs.max = 300; secs.value = tw.secs; secs.style.width = '70px';
  const l2 = sxEl('label', 'tw-row'); l2.append(auto, sxEl('span', '', t('tw_auto')), secs, sxEl('span', '', t('tw_sec')));
  body.append(l1, l2);
  const apply = () => { tw.auto = auto.checked; tw.secs = Math.max(5, Math.min(300, +secs.value || 20)); tw.until = Date.now() + tw.secs * 1000; twSave(); };
  if (tw.joined) {
    const off = sxEl('button', 'btn danger', t('tw_disconnect'));
    off.onclick = () => { twDisconnect(); closeDialog(); };
    const r = sxEl('div', 'st-row'); r.append(off); body.append(r);
  }
  dialog({title: t('tw_title'), body, ok: tw.joined ? t('ok') : t('tw_connect'), onOk: () => {
    apply();
    const name = ch.value.trim();
    if (!name) { ch.focus(); return false; }
    if (!tw.joined || name.toLowerCase() !== tw.channel) twConnect(name);
    twPaint();
  }});
}
