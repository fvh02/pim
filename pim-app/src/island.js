// Island renderer. Uses globals from pim.js (STATES, ACCS, drawPim, mix, lerp, hex) and drop.js (drawDrop).
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtBytes = b => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(0) + ' MB' : Math.round(b / 1e3) + ' KB');
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'gerade eben' : s < 3600 ? `vor ${Math.floor(s / 60)} min` : `vor ${Math.floor(s / 3600)} h`; };
const errText = e => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/* ---------- icons (24×24, filled) ---------- */
const ICONS = {
  prev: '<path d="M6 5h2.2v14H6zM19 5.5v13L9.5 12z"/>',
  next: '<path d="M15.8 5H18v14h-2.2zM5 5.5l9.5 6.5L5 18.5z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>',
  back10: '<path d="M12 4V1L7 5l5 4V6a7 7 0 1 1-7 7H3a9 9 0 1 0 9-9z"/><text x="12" y="16.6" font-size="7.5" font-weight="700" text-anchor="middle" font-family="Segoe UI, sans-serif">10</text>',
  fwd10: '<path d="M12 4V1l5 4-5 4V6a7 7 0 1 0 7 7h2a9 9 0 1 1-9-9z"/><text x="12" y="16.6" font-size="7.5" font-weight="700" text-anchor="middle" font-family="Segoe UI, sans-serif">10</text>',
  trash: '<path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/>',
  external: '<path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H7v10h10v-4h2v6H5z"/>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
  signal: '<path d="M12 17a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0-5a7 7 0 0 1 5 2l-1.4 1.4a5 5 0 0 0-7.2 0L7 14a7 7 0 0 1 5-2zm0-5a12 12 0 0 1 8.5 3.5l-1.4 1.4a10 10 0 0 0-14.2 0L3.5 10.5A12 12 0 0 1 12 7z"/>',
  refresh: '<path d="M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4z"/>',
  download: '<path d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z"/>',
  pin: '<path d="M14 2.5 21.5 10l-1.8 1-3.2 3.2.9 5.3-1.6 1.6-4.3-4.3L6 22.3 4.7 21l5.5-5.5-4.3-4.3 1.6-1.6 5.3.9L16 7.3z"/>',
  upload: '<path d="M11 21h2v-9.2l3.3 3.3 1.4-1.4L12 8l-5.7 5.7 1.4 1.4 3.3-3.3zM5 3h14v2H5z"/>',
  close: '<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/>',
  music: '<path d="M9 17.5a3 3 0 1 1-2-2.8V5.3L19 3v11.5a3 3 0 1 1-2-2.8V7.6L9 9.1z"/>',
  clip: '<path fill-rule="evenodd" d="M9 2h6v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm-1 9v2h8v-2zm0 4v2h5v-2z"/>',
  pad: '<path fill-rule="evenodd" d="M7 7h10a5 5 0 0 1 4.9 6l-.7 3.4a2.5 2.5 0 0 1-4.3 1.1L14.5 15h-5l-2.4 2.5a2.5 2.5 0 0 1-4.3-1.1L2.1 13A5 5 0 0 1 7 7zm0 3v1.5H5.5V13H7v1.5h1.5V13H10v-1.5H8.5V10zm9 .5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>',
  drive: '<path fill-rule="evenodd" d="M4 4h16v7H4zm0 9h16v7H4zm12-6.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm0 9a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>',
  battery: '<path fill-rule="evenodd" d="M3 7h15a1 1 0 0 1 1 1v2h2v4h-2v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1 2v6h9V9z"/>',
  face: '<path fill-rule="evenodd" d="M12 3.5c5.5 0 9.5 2.5 9.5 8.5S17.5 20.5 12 20.5 2.5 18 2.5 12 6.5 3.5 12 3.5zm-3 6a1.3 1.6 0 1 0 0 3.2 1.3 1.6 0 0 0 0-3.2zm6 0a1.3 1.6 0 1 0 0 3.2 1.3 1.6 0 0 0 0-3.2z"/>',
};
function setIcon(btn, name) {
  if (btn.dataset.icon === name && btn.firstChild) return;
  btn.dataset.icon = name;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`; // static markup from ICONS only
  if (btn.title) btn.setAttribute('aria-label', btn.title);
}
function iconButton(name, title, fn, cls = 'icon sm') {
  const b = el('button', cls); b.type = 'button'; b.title = title; setIcon(b, name);
  b.addEventListener('click', e => { e.stopPropagation(); fn(); });
  return b;
}
document.querySelectorAll('[data-icon]').forEach(b => setIcon(b, b.dataset.icon));

/* text that does not fit scrolls while hovered */
document.addEventListener('mouseover', e => {
  const m = e.target.closest && e.target.closest('.marq');
  if (!m || m.classList.contains('run')) return;
  const d = m.scrollWidth - m.clientWidth;
  if (d <= 2) return;
  m.style.setProperty('--d', `-${d + 4}px`); m.style.setProperty('--dur', `${Math.max(2.5, d / 28)}s`);
  m.classList.add('run');
  m.addEventListener('mouseleave', () => m.classList.remove('run'), { once: true });
});

const state = { media: null, steam: [], clips: [], uploads: new Map(), flash: null, look: [0, 0.15], sys: null, bt: [], pc: null, prefs: { acc: 'auto', color: null, gameMode: true, updateNotify: true }, note: null, update: null, hover: false };
/* Sleep: 5 min without mouse movement -> yawn -> sleep. Moving the mouse again -> surprised -> wave -> idle.
   Copying something counts as activity too (keyboard users). */
const SLEEP_AFTER = 5 * 60 * 1000, YAWN_MS = 3500, SURPRISE_MS = 1100, WAVE_MS = 2400;
const rest = { phase: 'awake', since: 0, lastMove: Date.now() };
function touch() {
  rest.lastMove = Date.now();
  if (rest.phase === 'yawn' || rest.phase === 'asleep') { rest.phase = 'waking'; rest.since = Date.now(); }
}
function restState(now) {
  if (rest.phase === 'awake' && now - rest.lastMove > SLEEP_AFTER) { rest.phase = 'yawn'; rest.since = now; }
  if (rest.phase === 'yawn' && now - rest.since > YAWN_MS) rest.phase = 'asleep';
  if (rest.phase === 'waking' && now - rest.since > SURPRISE_MS + WAVE_MS) rest.phase = 'awake';
  if (rest.phase === 'yawn') return 'yawn';
  if (rest.phase === 'asleep') return 'sleeping';
  if (rest.phase === 'waking') return now - rest.since < SURPRISE_MS ? 'surprised' : 'greeting';
  return 'idle';
}

/* ---------- menus, size, open / close ---------- */
// w: window width per menu; h: fixed height, otherwise measured from the content
const MENUS = [
  { id: 'music', name: 'Musik', icon: 'music', w: 380 },
  { id: 'clips', name: 'Zwischenablage', icon: 'clip', w: 640, h: 360 },
  { id: 'steam', name: 'Steam', icon: 'pad', w: 480 },
  { id: 'storage', name: 'Speicher', icon: 'drive', w: 420 },
  { id: 'battery', name: 'Akku', icon: 'battery', w: 320 },
  { id: 'look', name: 'Pim', icon: 'face', w: 320 },
];
const PILL = { w: 320, h: 46 }, DROP = { w: 320, h: 118 }, HEADER = 54;
let open = false, menu = 0, closeTimer = null, dropping = false;

MENUS.forEach((m, i) => {
  const b = iconButton(m.icon, m.name, () => setMenu(i), '');
  $('menus').append(b);
});
function setMenu(i) {
  menu = (i + MENUS.length) % MENUS.length;
  const m = MENUS[menu];
  $('menuName').textContent = m.name;
  [...$('menus').children].forEach((b, j) => b.setAttribute('aria-current', j === menu));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('active', s.dataset.panel === m.id));
  if (m.id === 'storage') loadStorage();
  fit();
}
// The visible island animates to the size of the current menu (CSS). The window itself is the invisible "box":
// while a menu is open it keeps the largest size seen since opening, so switching to a smaller menu does not
// leave the cursor outside the window and close everything. It shrinks back to the pill once closed.
let box = { ...PILL }, shrinkTimer = null;
function menuSize() {
  const m = MENUS[menu];
  $('body').style.width = `${m.w}px`; // measure at the target width, not the current one
  const sec = document.querySelector('section.active');
  return { w: m.w, h: m.h || Math.min(440, HEADER + sec.scrollHeight + 18) };
}
function fit() {
  clearTimeout(shrinkTimer);
  const s = dropping ? DROP : open ? menuSize() : PILL;
  $('island').style.width = `${s.w}px`; $('island').style.height = `${s.h}px`;
  if (open || dropping) {
    box = { w: Math.max(box.w, s.w), h: Math.max(box.h, s.h) };
    pim.size(box);
  } else {
    box = { ...PILL };
    shrinkTimer = setTimeout(() => pim.size(PILL), 240); // after the island has animated back to the pill
  }
}
function setOpen(on) {
  clearTimeout(closeTimer);
  if (open === on) return;
  open = on;
  document.body.classList.toggle('open', on);
  fit();
}
// Hovering the pill opens it (short delay, so passing the top edge does not pop it open).
document.body.addEventListener('mouseenter', () => {
  state.hover = true;
  clearTimeout(closeTimer);
  if (!open && !dropping) closeTimer = setTimeout(() => setOpen(true), 150);
});
document.body.addEventListener('mouseleave', () => {
  state.hover = false;
  clearTimeout(closeTimer);
  if (document.activeElement && document.activeElement.matches('input, select')) return; // keep the panel while typing
  closeTimer = setTimeout(() => setOpen(false), 450);
});
window.addEventListener('keydown', e => { if (e.key === 'Escape') { document.activeElement.blur(); setOpen(false); } });
// Eyes follow the mouse anywhere on screen; main sends the cursor in window coordinates.
pim.onCursor(p => {
  touch(); // main only sends when the cursor moved
  const r = $('pim').getBoundingClientRect();
  state.look = [Math.max(-1, Math.min(1, (p.x - r.left - r.width / 2) / 420)), Math.max(-1, Math.min(1, (p.y - r.top - r.height / 2) / 260))];
});

// Wheel: over Pim it sets the volume; over a list that can scroll it scrolls; anywhere else it switches menus.
let wheelLock = 0;
window.addEventListener('wheel', e => {
  if (e.ctrlKey) e.preventDefault(); // no Chromium zoom
  if (e.target.closest('#pim')) {
    if (!state.sys) return;
    e.preventDefault();
    setVolume(state.sys.vol + (e.deltaY < 0 ? 0.02 : -0.02));
    return;
  }
  if (!open) return;
  const list = e.target.closest('.list');
  if (list && list.scrollHeight > list.clientHeight + 1) return;
  e.preventDefault();
  const now = Date.now();
  if (now - wheelLock < 220) return; // one menu per notch, also on touchpads
  wheelLock = now;
  setMenu(menu + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });

/* ---------- volume (wheel on the pill) ---------- */
function setVolume(v) {
  v = Math.max(0, Math.min(1, v));
  if (state.sys.muted) pim.mute(false);
  state.sys = { ...state.sys, vol: v, muted: false };
  pim.volume(v);
  note(`Lautstärke ${Math.round(v * 100)} %`);
}
pim.onSys(v => { state.sys = v; });

/* ---------- drag & drop: box, then paper plane ---------- */
const dropCanvas = $('drop'), dctx = dropCanvas.getContext('2d');
let dragDepth = 0, dragLeaveTimer = null, anim = null; // anim: { phase, start }
function startDrop() {
  clearTimeout(dragLeaveTimer);
  if (dropping) return;
  dropping = true; anim = { phase: 'open', start: performance.now() };
  document.body.classList.add('dropping');
  clearTimeout(closeTimer); open = false; document.body.classList.remove('open');
  fit();
}
function endDrop() { dropping = false; anim = null; document.body.classList.remove('dropping'); fit(); }
window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; startDrop(); });
window.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
window.addEventListener('dragleave', () => {
  if (--dragDepth > 0) return;
  dragDepth = 0;
  // the window resizes under the cursor; wait a moment before treating this as "left"
  dragLeaveTimer = setTimeout(() => { if (anim && anim.phase === 'open') endDrop(); }, 150);
});
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; clearTimeout(dragLeaveTimer);
  if (!e.dataTransfer.files.length) return endDrop();
  anim = { phase: 'closing', start: performance.now() };
  pim.upload(Array.from(e.dataTransfer.files), null); // a FileList does not survive the context bridge, an array of Files does
});
function drawDropFrame(now) {
  const b = dropCanvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const cw = Math.round(b.width * dpr), ch = Math.round(b.height * dpr);
  if (dropCanvas.width !== cw || dropCanvas.height !== ch) { dropCanvas.width = cw; dropCanvas.height = ch; } // the window grows while dragging
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0); dctx.clearRect(0, 0, b.width, b.height);
  const DUR = { open: Infinity, closing: 240, plane: 720 };
  let p = (now - anim.start) / DUR[anim.phase];
  if (p >= 1 && anim.phase === 'closing') { anim = { phase: 'plane', start: now }; p = 0; }
  else if (p >= 1 && anim.phase === 'plane') { endDrop(); return; }
  drawDrop(dctx, b.width, b.height, anim.phase, Math.min(1, p), now / 1000);
}

/* ---------- music ---------- */
document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => pim.media(b.dataset.cmd)));
function mediaPos() {
  const m = state.media;
  if (!m || !m.duration) return 0;
  const p = m.position + (m.playing ? (Date.now() - m.updated) / 1000 : 0);
  return Math.min(m.duration, Math.max(0, p));
}
function renderMedia() {
  const m = state.media, on = !!(m && m.active && (m.title || m.artist));
  const was = $('music').hidden;
  $('music').hidden = !on; $('musicEmpty').hidden = on;
  if (on) {
    $('mTitle').textContent = m.title || 'Unbekannter Titel';
    $('mArtist').textContent = m.artist || '';
    $('cover').style.backgroundImage = m.cover ? `url("${m.cover}")` : '';
    setIcon($('mPlay'), m.playing ? 'pause' : 'play');
  }
  if (was === on && MENUS[menu].id === 'music') fit();
}
pim.onMedia(m => {
  const prev = state.media;
  state.media = m; renderMedia();
});

/* ---------- clipboard ---------- */
function clipItem(c) {
  const li = el('li', 'item clickable clip' + (c.pinned ? ' pinned' : '')); li.title = 'Klicken zum Kopieren';
  const g = el('div', 'grow');
  if (c.type === 'image') { const img = el('img'); img.src = c.thumb; img.alt = `Bild ${c.width}×${c.height}`; g.append(img, el('div', 'sub', `Bild ${c.width}×${c.height} · ${ago(c.at)}`)); }
  else g.append(el('div', 'text', c.text.slice(0, 400)), el('div', 'sub', ago(c.at)));
  li.append(g);
  if (c.type === 'image') li.append(iconButton('upload', 'Auf Standardspeicher hochladen', () => pim.clipUpload(c.id)));
  const pin = iconButton('pin', c.pinned ? 'Lösen' : 'Anheften (wird gespeichert)', () => pim.clipPin(c.id));
  if (c.pinned) pin.classList.add('on');
  li.append(pin, iconButton('close', 'Löschen', () => pim.clipDelete(c.id)));
  li.addEventListener('click', () => { pim.clipCopy(c.id); flash('finished', 900); });
  return li;
}
function renderClips() {
  const list = $('clipList'); list.replaceChildren();
  const pinned = state.clips.filter(c => c.pinned), recent = state.clips.filter(c => !c.pinned);
  if (pinned.length) { list.append(el('li', 'group', 'Angeheftet')); pinned.forEach(c => list.append(clipItem(c))); if (recent.length) list.append(el('li', 'group', 'Verlauf')); }
  recent.forEach(c => list.append(clipItem(c)));
  $('clipEmpty').hidden = state.clips.length > 0;
  list.hidden = state.clips.length === 0;
  $('clipCount').textContent = recent.length === 1 ? '1 Eintrag' : `${recent.length} Einträge`;
}
pim.onClips(({ clips, fresh }) => { state.clips = clips; renderClips(); if (fresh) { touch(); flash('surprised', 1200); } });
$('clipClear').addEventListener('click', () => pim.clipClear());

/* ---------- steam: one row per game, updated in place so the hover scroll keeps running ---------- */
const steamRows = new Map();
function renderSteam() {
  const list = $('steamList');
  const ids = new Set(state.steam.map(d => d.appid));
  for (const [id, row] of steamRows) if (!ids.has(id)) { row.li.remove(); steamRows.delete(id); }
  for (const d of state.steam) {
    let row = steamRows.get(d.appid);
    if (!row) {
      row = { li: el('li', 'item dl'), name: el('div', 'name marq'), track: el('div', 'bar-track'), fill: el('div', 'bar-fill'), size: el('span', 'num'), speed: el('span', 'num speed') };
      row.track.append(row.fill); row.li.append(row.name, row.track, row.size, row.speed);
      list.append(row.li); steamRows.set(d.appid, row);
    }
    const pct = d.total ? (d.done / d.total) * 100 : 0;
    row.name.textContent = d.name; row.name.title = d.name;
    row.fill.style.width = pct.toFixed(1) + '%';
    row.size.textContent = `${fmtBytes(d.done)} / ${fmtBytes(d.total)}`;
    row.speed.textContent = d.speed ? fmtBytes(d.speed) + '/s' : '–';
  }
  $('steamEmpty').hidden = state.steam.length > 0;
  list.hidden = !state.steam.length;
}
pim.onSteam(list => {
  const changed = list.length !== state.steam.length;
  state.steam = list; renderSteam();
  if (changed && MENUS[menu].id === 'steam') fit();
});
$('steamOpen').addEventListener('click', () => pim.steamOpen());

/* ---------- uploads: no menu, status in the pill ---------- */
pim.onUpload(u => {
  const prev = state.uploads.get(u.id) || {};
  state.uploads.set(u.id, { ...prev, ...u });
  if (u.status === 'done') { flash('finished', 2500); note(`✓ ${u.name} → ${u.target}`, 3500); state.uploads.delete(u.id); }
  if (u.status === 'error') { flash('error', 3000); note(`✕ ${u.name}: ${u.error}`, 6000); state.uploads.delete(u.id); }
});

/* ---------- battery ---------- */
const LOW_PC = 0.2, LOW_BT = 15;
const fmtDur = s => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
function batItem(name, pct, sub) {
  const li = el('li', 'item bat');
  const top = el('div', 'top'); top.append(el('span', 'name', name), el('span', 'sub', sub), el('span', 'pct', `${pct} %`));
  const t = el('div', 'bar-track'), f = el('div', 'bar-fill ' + (pct < 20 ? 'low' : pct < 40 ? 'mid' : 'good'));
  f.style.width = pct + '%'; t.append(f);
  li.append(top, t);
  return li;
}
function renderBattery() {
  const list = $('batList'), before = list.children.length; list.replaceChildren();
  const b = state.pc;
  // desktops report "charging, 100 %, chargingTime 0" because they have no battery
  if (b && !(b.charging && b.level === 1 && b.chargingTime === 0)) {
    const time = b.charging
      ? (Number.isFinite(b.chargingTime) && b.chargingTime > 0 ? `⚡ voll in ${fmtDur(b.chargingTime)}` : '⚡ lädt')
      : (Number.isFinite(b.dischargingTime) ? `noch ${fmtDur(b.dischargingTime)}` : '');
    list.append(batItem('Dieser PC', Math.round(b.level * 100), time));
  }
  for (const d of state.bt) list.append(batItem(d.name, d.level, ''));
  $('batEmpty').hidden = list.children.length > 0;
  list.hidden = list.children.length === 0;
  if (before !== list.children.length && MENUS[menu].id === 'battery') fit();
}
function lowBattery() {
  const b = state.pc;
  if (b && !b.charging && b.level < LOW_PC) return { name: 'Akku', level: Math.round(b.level * 100) };
  const d = state.bt.find(x => x.level < LOW_BT);
  return d ? { name: d.name, level: d.level } : null;
}
if (navigator.getBattery) navigator.getBattery().then(b => {
  state.pc = b;
  for (const ev of ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange']) b.addEventListener(ev, renderBattery);
  renderBattery();
}).catch(() => {});
pim.onBt(list => { state.bt = list; renderBattery(); });

/* ---------- look: accessory, color, game mode, updates ---------- */
const ACC_NAMES = { beanie: 'Mütze', 'santa hat': 'Weihnachtsmütze', 'party hat': 'Partyhut', crown: 'Krone', 'witch hat': 'Hexenhut', sunglasses: 'Sonnenbrille', glasses: 'Brille', scarf: 'Schal', pumpkin: 'Kürbis', bow: 'Schleife' };
const COLORS = [null, '#9cc0ff', '#c1b0ff', '#a6e5cc', '#ffcf8a', '#ff9ba6', '#8fe2ee'];
function seasonalAcc(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 12 && day === 31) || (m === 1 && day === 1)) return 'party hat';
  if (m === 12) return 'santa hat';
  if (m === 10 && day >= 24) return 'witch hat';
  if (m === 1 || m === 2) return 'beanie';
  return null;
}
const currentAcc = () => (state.prefs.acc === 'auto' ? seasonalAcc() : ACCS.includes(state.prefs.acc) ? state.prefs.acc : null);
function renderLook() {
  const sel = $('pAcc'); sel.replaceChildren();
  const opt = (v, t) => { const o = el('option', null, t); o.value = v; o.selected = state.prefs.acc === v; sel.append(o); };
  opt('auto', 'Nach Jahreszeit'); opt('none', 'Keins');
  ACCS.forEach(a => opt(a, ACC_NAMES[a] || a));
  const sw = $('pColors'); sw.replaceChildren();
  COLORS.forEach(c => {
    const b = el('button', 'swatch'); b.type = 'button'; b.style.background = c || STATES.idle.tint;
    b.title = c ? c : 'Standard'; b.setAttribute('aria-label', c ? `Farbe ${c}` : 'Standardfarbe');
    b.setAttribute('aria-pressed', state.prefs.color === c);
    b.addEventListener('click', () => savePrefs({ color: c }));
    sw.append(b);
  });
  const pick = el('input'); pick.type = 'color'; pick.title = 'Eigene Farbe'; pick.value = state.prefs.color || '#eef0f4';
  pick.addEventListener('change', () => savePrefs({ color: pick.value }));
  sw.append(pick);
  $('pGame').checked = state.prefs.gameMode;
  $('pNotify').checked = state.prefs.updateNotify !== false;
}
async function savePrefs(p) { state.prefs = await pim.setPrefs(p); renderLook(); }
$('pAcc').addEventListener('change', e => savePrefs({ acc: e.target.value }));
$('pGame').addEventListener('change', e => savePrefs({ gameMode: e.target.checked }));
$('pNotify').addEventListener('change', e => savePrefs({ updateNotify: e.target.checked }));

function renderUpdate() {
  const u = state.update;
  if (!u) return;
  const v = `Version ${u.version}`;
  const [text, icon, title] = {
    idle: [v, 'refresh', 'Nach Updates suchen'],
    checking: [`${v} · prüfe …`, null],
    current: [`${v} · aktuell`, 'refresh', 'Erneut prüfen'],
    downloading: [`Lade ${u.next} … ${u.percent || 0} %`, null],
    ready: [`${u.next} bereit`, 'refresh', 'Jetzt neu starten und aktualisieren'],
    portable: [`${u.next} verfügbar`, 'download', 'Installer herunterladen (portable Version aktualisiert sich nicht selbst)'],
    error: [`Update-Fehler: ${u.message}`, 'refresh', 'Erneut prüfen'],
    dev: [`${v} · Entwicklung`, null],
  }[u.status] || [v, null];
  $('uText').textContent = text; $('uText').title = text;
  const b = $('uBtn');
  b.hidden = !icon;
  if (icon) { b.title = title; setIcon(b, icon); b.classList.toggle('primary', u.status === 'ready'); }
}
$('uBtn').addEventListener('click', () => (['ready', 'portable'].includes(state.update.status) ? pim.updateInstall() : pim.updateCheck()));
pim.onUpdate(u => {
  state.update = u; renderUpdate();
});

/* ---------- storage targets ---------- */
let targets = { targets: [], defaultTarget: null }, presets = [], editing = null;
function renderTargets() {
  const list = $('stList'); list.replaceChildren();
  for (const t of targets.targets) {
    const li = el('li', 'item clickable');
    const r = el('input', 'radio'); r.type = 'radio'; r.name = 'def'; r.checked = t.id === targets.defaultTarget; r.title = 'Standardziel für Uploads';
    r.addEventListener('click', async e => { e.stopPropagation(); targets = await pim.setDefault(t.id); renderTargets(); });
    const g = el('div', 'grow'); g.append(el('div', 'name', t.name), el('div', 'sub', t.type === 'webdav' ? t.url : t.path));
    const x = iconButton('close', 'Entfernen', async () => { if (confirm(`„${t.name}“ entfernen? Hochgeladene Dateien bleiben erhalten.`)) { targets = await pim.deleteTarget(t.id); if (editing === t.id) fillForm(); renderTargets(); } });
    li.addEventListener('click', () => fillForm(t));
    li.append(r, g, x); list.append(li);
  }
  $('stEmpty').hidden = targets.targets.length > 0;
  list.hidden = !targets.targets.length;
  if (MENUS[menu].id === 'storage') fit();
}
function syncType() { document.querySelectorAll('[data-for]').forEach(l => { l.hidden = l.dataset.for !== $('fType').value; }); if (MENUS[menu].id === 'storage') fit(); }
function fillForm(t = {}) {
  editing = t.id || null;
  $('fName').value = t.name || ''; $('fType').value = t.type || 'folder';
  $('fPath').value = t.path || ''; $('fUrl').value = t.url || ''; $('fUser').value = t.user || ''; $('fPass').value = '';
  $('fPass').placeholder = t.hasPass ? 'unverändert' : '';
  $('fHint').textContent = t.hint || ''; $('fMsg').textContent = ''; $('fMsg').className = 'msg';
  syncType();
}
const formTarget = () => ({ id: editing, name: $('fName').value, type: $('fType').value, path: $('fPath').value, url: $('fUrl').value, user: $('fUser').value });
const msg = (text, ok) => { $('fMsg').textContent = text; $('fMsg').className = 'msg ' + (ok ? 'ok' : 'err'); };
async function loadStorage() {
  [targets, presets] = await Promise.all([pim.targets(), pim.presets()]);
  const sel = $('fPreset'); sel.replaceChildren(el('option', null, '–'));
  presets.forEach((p, i) => { const o = el('option', null, p.name + (p.exists === true ? ' ✓ gefunden' : '')); o.value = i; sel.append(o); });
  renderTargets();
}
$('fPreset').addEventListener('change', e => { const p = presets[e.target.value]; if (p) fillForm({ ...p, id: null, name: p.id === 'custom' ? '' : p.name }); });
$('fType').addEventListener('change', syncType);
$('fPick').addEventListener('click', async () => { const p = await pim.pickFolder(); if (p) $('fPath').value = p; });
$('stNew').addEventListener('click', () => { fillForm(); $('fPreset').value = '–'; $('fName').focus(); });
$('fTest').addEventListener('click', async () => {
  msg('Teste …', true);
  try { msg(await pim.testTarget(formTarget(), $('fPass').value), true); } catch (e) { msg(errText(e), false); }
});
$('stForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    targets = await pim.saveTarget(formTarget(), $('fPass').value);
    if (!editing) editing = targets.targets[targets.targets.length - 1].id;
    renderTargets(); msg('Gespeichert', true); $('fPass').value = '';
  } catch (err) { msg(errText(err), false); }
});

/* ---------- mascot and pill status ---------- */
function flash(name, ms) { state.flash = { name, until: Date.now() + ms }; }
function note(text, ms = 1200) { state.note = { text, until: Date.now() + ms }; }
// a newer version is on the way or waiting to be installed, and the user wants to hear about it
const updatePending = () => state.prefs.updateNotify !== false && !!state.update && ['downloading', 'ready', 'portable'].includes(state.update.status);
function mascotState() {
  const now = Date.now();
  if ([...state.uploads.values()].some(u => u.status === 'running')) return 'upload';
  if (state.flash && state.flash.until > now) return state.flash.name;
  if (updatePending()) return 'finished'; // stays until the update is installed
  if (lowBattery()) return 'rate limit';
  if (state.steam.length) return 'working';
  if (state.media && state.media.playing) return 'dancing';
  return restState(now); // idle, or the yawn / sleep / wake-up sequence
}
function statusLine() {
  const up = [...state.uploads.values()].find(u => u.status === 'running');
  if (up) return `↑ ${up.name} ${up.total ? Math.floor((up.sent / up.total) * 100) + ' %' : ''}`;
  if (state.note && state.note.until > Date.now()) return state.note.text;
  const low = lowBattery();
  if (low) return `🪫 ${low.name} ${low.level} %`;
  if (state.steam.length) { const d = state.steam[0]; return `⬇ ${d.name} ${Math.floor((d.done / d.total) * 100)} %`; }
  const m = state.media;
  if (m && m.active && m.title) return `${m.title}${m.artist ? ' – ' + m.artist : ''}`;
  if (updatePending()) return state.update.status === 'downloading' ? `Lade Update ${state.update.next} …` : `Update ${state.update.next} bereit`;
  return '';
}

const FOLLOW = new Set(['idle', 'surprised', 'greeting', 'finished', 'proud', 'error', 'upload']);
const canvas = $('pim'), ctx = canvas.getContext('2d');
const r = { tint: null, morph: 0, look: [0, 0], w: 0, h: 0, dpr: 1 };
new ResizeObserver(() => {
  const b = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  r.w = b.width; r.h = b.height; r.dpr = dpr;
  canvas.width = Math.round(b.width * dpr); canvas.height = Math.round(b.height * dpr);
}).observe(canvas);

const t0 = performance.now();
let lastUi = 0;
function loop(now) {
  if (dropping && anim) drawDropFrame(now);
  const t = reduced ? 1.3 : (now - t0) / 1000;
  const name = mascotState();
  let st = STATES[name];
  if (name === 'idle' && state.prefs.color) st = { ...st, rgb: hex(state.prefs.color) };
  const acc = currentAcc();
  r.tint = r.tint ? mix(r.tint, st.rgb, 0.08) : st.rgb.slice();
  r.morph = lerp(r.morph, st.morph || 0, 0.1);
  // idle and short reactions watch the cursor; busy states keep their own scripted gaze (see drawPim)
  const look = FOLLOW.has(name) || dropping ? state.look : [0, 0.15];
  r.look[0] = lerp(r.look[0], look[0], 0.12); r.look[1] = lerp(r.look[1], look[1], 0.12);
  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.clearRect(0, 0, r.w, r.h);
  const R = Math.min(r.w / 2.7, r.h / (acc ? 3.1 : 2.3)); // hats need headroom; R = 0 before the first layout
  if (R > 0) drawPim(ctx, { cx: r.w / 2, cy: r.h * (acc ? 0.6 : 0.5), R, t, st: { ...st, fx: null }, acc, n: 2.7, morph: r.morph, look: r.look, tint: r.tint, seed: 0.8, glow: 0 });

  if (now - lastUi > 250) { // text and progress bars do not need 60 fps
    lastUi = now;
    $('statusText').textContent = statusLine();
    $('menuName').textContent = state.note && state.note.until > Date.now() && state.note.text.startsWith('Lautstärke') ? state.note.text : MENUS[menu].name;
    $('eq').hidden = !(state.media && state.media.playing);
    const m = state.media;
    if (m && m.duration) $('mFill').style.width = (mediaPos() / m.duration) * 100 + '%';
  }
  requestAnimationFrame(loop);
}

/* ---------- start ---------- */
setMenu(0);
fillForm();
pim.targets().then(t => { targets = t; renderTargets(); });
pim.snapshot().then(s => {
  if (s.justUpdated) flash('dancing', 10000); // first start after an update installed
  Object.assign(state, { update: s.update, media: s.media, steam: s.steam || [], clips: s.clips || [], sys: s.sys, bt: s.bt || [], prefs: s.prefs || state.prefs });
  renderMedia(); renderSteam(); renderClips(); renderBattery(); renderLook(); renderUpdate();
});
setInterval(renderClips, 60000); // refresh "vor x min"
requestAnimationFrame(loop);
