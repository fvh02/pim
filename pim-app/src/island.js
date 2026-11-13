// Island renderer. Uses globals from pim.js (STATES, drawPim, mix, lerp).
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtTime = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtBytes = b => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'gerade eben' : s < 3600 ? `vor ${Math.floor(s / 60)} min` : `vor ${Math.floor(s / 3600)} h`; };
const appName = id => (id || '').split(/[!\\/]/).pop().replace(/\.exe$/i, '').replace(/^.*\.(?=[^.]+$)/, '') || 'Player';

const state = { media: null, steam: [], clips: [], uploads: new Map(), flash: null, lastActivity: Date.now(), look: [0, 0.15], sys: null, bt: [], pc: null, prefs: { acc: 'auto', color: null, gameMode: true }, note: null };
const touch = () => { state.lastActivity = Date.now(); };

/* ---------- open / close ---------- */
let open = false, closeTimer = null, tab = 'music';
function setOpen(on) {
  clearTimeout(closeTimer);
  if (open === on) return;
  open = on;
  document.body.classList.toggle('open', on);
  pim.expand(on);
}
function setTab(name) {
  tab = name;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('active', s.dataset.panel === name));
  if (name === 'storage') loadStorage();
}
document.body.addEventListener('mouseenter', () => { clearTimeout(closeTimer); closeTimer = setTimeout(() => setOpen(true), 120); });
document.body.addEventListener('mouseleave', () => {
  clearTimeout(closeTimer);
  // keep the panel while typing in the storage form
  if (document.activeElement && document.activeElement.matches('input, select')) return;
  closeTimer = setTimeout(() => setOpen(false), 450);
});
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
window.addEventListener('keydown', e => { if (e.key === 'Escape') { document.activeElement.blur(); setOpen(false); } });
document.addEventListener('mousemove', e => {
  const r = $('pim').getBoundingClientRect();
  state.look = [Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / 300)), Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / 200))];
});

/* ---------- drag & drop upload ---------- */
let dragDepth = 0;
window.addEventListener('dragenter', e => { e.preventDefault(); if (dragDepth++ === 0) { document.body.classList.add('drag'); setOpen(true); setTab('upload'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drag'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('drag');
  if (e.dataTransfer.files.length) pim.upload(e.dataTransfer.files, $('upTarget').value || null);
});
$('drop').addEventListener('click', () => pim.pickFiles());

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
  $('music').hidden = !on; $('musicEmpty').hidden = on;
  if (!on) return;
  $('mTitle').textContent = m.title || 'Unbekannter Titel';
  $('mArtist').textContent = m.artist || '';
  $('mApp').textContent = appName(m.app);
  $('cover').style.backgroundImage = m.cover ? `url("${m.cover}")` : '';
  $('mPlay').textContent = m.playing ? '⏸' : '▶';
}
pim.onMedia(m => {
  const prev = state.media;
  if (!prev || prev.key !== m.key || prev.playing !== m.playing) touch();
  state.media = m; renderMedia();
});

/* ---------- clipboard ---------- */
function clipItem(c) {
  const li = el('li', 'item clickable clip' + (c.pinned ? ' pinned' : '')); li.title = 'Klicken zum Kopieren';
  const g = el('div', 'grow');
  if (c.type === 'image') { const img = el('img'); img.src = c.thumb; img.alt = `Bild ${c.width}×${c.height}`; g.append(img, el('div', 'sub', `Bild ${c.width}×${c.height} · ${ago(c.at)}`)); }
  else g.append(el('div', 'text', c.text.slice(0, 400)), el('div', 'sub', ago(c.at)));
  const btn = (label, title, fn, on) => { const b = el('button', 'ibtn' + (on ? ' on' : ''), label); b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; };
  li.append(g);
  if (c.type === 'image') li.append(btn('↑', 'Auf Standardspeicher hochladen', () => { pim.clipUpload(c.id); setTab('upload'); }));
  li.append(btn('📌', c.pinned ? 'Lösen' : 'Anheften (wird gespeichert)', () => pim.clipPin(c.id), c.pinned));
  li.append(btn('×', 'Löschen', () => pim.clipDelete(c.id)));
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

/* ---------- volume ---------- */
let volDragging = false;
function renderSys() {
  const v = state.sys;
  $('volume').hidden = !v;
  if (!v) return;
  if (!volDragging) $('vRange').value = Math.round(v.vol * 100);
  $('vOut').textContent = v.muted ? 'aus' : Math.round(v.vol * 100);
  $('vMute').textContent = v.muted || v.vol === 0 ? '🔇' : v.vol < 0.4 ? '🔉' : '🔊';
}
function setVolume(v) {
  v = Math.max(0, Math.min(1, v));
  if (state.sys.muted) pim.mute(false); // moving the slider unmutes, like the Windows flyout
  state.sys = { ...state.sys, vol: v, muted: false };
  pim.volume(v);
  renderSys();
  note(`Lautstärke ${Math.round(v * 100)} %`);
}
$('vRange').addEventListener('pointerdown', () => { volDragging = true; });
window.addEventListener('pointerup', () => { volDragging = false; });
$('vRange').addEventListener('input', e => setVolume(e.target.value / 100));
$('vMute').addEventListener('click', () => { if (state.sys) { pim.mute(!state.sys.muted); state.sys = { ...state.sys, muted: !state.sys.muted }; renderSys(); } });
// mouse wheel over the pill or the header changes the volume; inside open panels it keeps scrolling lists
window.addEventListener('wheel', e => {
  if (!state.sys || (open && !e.target.closest('.bar'))) return;
  e.preventDefault();
  setVolume(state.sys.vol + (e.deltaY < 0 ? 0.02 : -0.02));
}, { passive: false });
pim.onSys(v => { state.sys = v; renderSys(); });

/* ---------- battery ---------- */
const LOW_PC = 0.2, LOW_BT = 15;
function batItem(name, pct, sub) {
  const li = el('li', 'item bat');
  const g = el('div', 'grow'); g.append(el('div', 'name', name));
  if (sub) g.append(el('div', 'sub', sub));
  if (pct != null) {
    const t = el('div', 'bar-track'), f = el('div', 'bar-fill ' + (pct < 20 ? 'low' : pct < 40 ? 'mid' : 'good'));
    f.style.width = pct + '%'; t.append(f); g.append(t);
  }
  li.append(g);
  if (pct != null) li.append(el('span', 'pct', `${pct} %`));
  return li;
}
function renderBattery() {
  const list = $('batList'); list.replaceChildren();
  const b = state.pc;
  // desktops report "charging, 100 %, chargingTime 0" because they have no battery
  if (b && !(b.charging && b.level === 1 && b.chargingTime === 0)) {
    const pct = Math.round(b.level * 100);
    const time = b.charging
      ? (Number.isFinite(b.chargingTime) && b.chargingTime > 0 ? `voll in ${fmtDur(b.chargingTime)}` : 'lädt')
      : (Number.isFinite(b.dischargingTime) ? `noch ${fmtDur(b.dischargingTime)}` : 'Akkubetrieb');
    list.append(batItem('Dieser PC', pct, (b.charging ? '⚡ ' : '') + time));
  }
  for (const d of state.bt) list.append(batItem(d.name, d.level, 'Bluetooth'));
  $('batEmpty').hidden = list.children.length > 0;
  list.hidden = list.children.length === 0;
}
const fmtDur = s => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
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

/* ---------- look: accessory, color, game mode ---------- */
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
  opt('auto', 'Automatisch nach Jahreszeit'); opt('none', 'Keins');
  ACCS.forEach(a => opt(a, ACC_NAMES[a] || a));
  const sw = $('pColors'); sw.replaceChildren();
  COLORS.forEach(c => {
    const b = el('button', 'swatch'); b.style.background = c || STATES.idle.tint;
    b.title = c ? c : 'Standard'; b.setAttribute('aria-label', c ? `Farbe ${c}` : 'Standardfarbe');
    b.setAttribute('aria-pressed', state.prefs.color === c);
    b.addEventListener('click', () => savePrefs({ color: c }));
    sw.append(b);
  });
  const pick = el('input'); pick.type = 'color'; pick.title = 'Eigene Farbe'; pick.value = state.prefs.color || '#eef0f4';
  pick.addEventListener('change', () => savePrefs({ color: pick.value }));
  sw.append(pick);
  $('pGame').checked = state.prefs.gameMode;
}
async function savePrefs(p) { state.prefs = await pim.setPrefs(p); renderLook(); }
$('pAcc').addEventListener('change', e => savePrefs({ acc: e.target.value }));
$('pGame').addEventListener('change', e => savePrefs({ gameMode: e.target.checked }));

/* ---------- steam ---------- */
function renderSteam() {
  const list = $('steamList'); list.replaceChildren();
  for (const d of state.steam) {
    const li = el('li', 'item');
    const g = el('div', 'grow');
    const pct = d.total ? (d.done / d.total) * 100 : 0;
    const track = el('div', 'bar-track'), fill = el('div', 'bar-fill'); fill.style.width = pct.toFixed(1) + '%'; track.append(fill);
    g.append(el('div', 'name', d.name), el('div', 'sub', `${pct.toFixed(1)} % · ${fmtBytes(d.done)} von ${fmtBytes(d.total)}${d.speed ? ' · ' + fmtBytes(d.speed) + '/s' : ''}`), track);
    li.append(g); list.append(li);
  }
  $('steamEmpty').hidden = state.steam.length > 0;
  list.hidden = !state.steam.length;
}
pim.onSteam(list => { if (list.length !== state.steam.length) touch(); state.steam = list; renderSteam(); });
$('steamOpen').addEventListener('click', () => pim.steamOpen());

/* ---------- uploads ---------- */
function renderUploads() {
  const list = $('upList'); list.replaceChildren();
  [...state.uploads.values()].reverse().slice(0, 12).forEach(u => {
    const li = el('li', 'item' + (u.status === 'done' ? ' clickable' : ''));
    const g = el('div', 'grow');
    let sub;
    if (u.status === 'running') sub = el('div', 'sub', `→ ${u.target} · ${u.total ? Math.floor((u.sent / u.total) * 100) + ' %' : '…'}`);
    else if (u.status === 'done') sub = el('div', 'sub ok', `✓ ${u.target} · ${u.kind === 'webdav' ? 'Klicken kopiert den Link' : 'Klicken zeigt die Datei'}`);
    else sub = el('div', 'sub err', `✕ ${u.error}`);
    g.append(el('div', 'name', u.name), sub);
    if (u.status === 'running') { const t = el('div', 'bar-track'), f = el('div', 'bar-fill'); f.style.width = (u.total ? (u.sent / u.total) * 100 : 0) + '%'; t.append(f); g.append(t); }
    if (u.status === 'done') li.addEventListener('click', () => pim.reveal(u.location));
    li.append(g); list.append(li);
  });
}
pim.onUpload(u => {
  const prev = state.uploads.get(u.id) || {};
  state.uploads.set(u.id, { ...prev, ...u });
  if (u.status !== 'running') { touch(); flash(u.status === 'done' ? 'finished' : 'error', 2500); }
  renderUploads();
});

/* ---------- storage targets ---------- */
let targets = { targets: [], defaultTarget: null }, presets = [], editing = null;
function renderTargets() {
  const sel = $('upTarget'); sel.replaceChildren();
  for (const t of targets.targets) { const o = el('option', null, t.name); o.value = t.id; o.selected = t.id === targets.defaultTarget; sel.append(o); }
  if (!targets.targets.length) sel.append(el('option', null, 'Kein Speicher – Tab „Speicher“'));
  const list = $('stList'); list.replaceChildren();
  for (const t of targets.targets) {
    const li = el('li', 'item clickable');
    const r = el('input', 'radio'); r.type = 'radio'; r.name = 'def'; r.checked = t.id === targets.defaultTarget; r.title = 'Standardziel';
    r.addEventListener('click', async e => { e.stopPropagation(); targets = await pim.setDefault(t.id); renderTargets(); });
    const g = el('div', 'grow'); g.append(el('div', 'name', t.name), el('div', 'sub', t.type === 'webdav' ? t.url : t.path));
    const x = el('button', 'x', '×'); x.setAttribute('aria-label', 'Löschen');
    x.addEventListener('click', async e => { e.stopPropagation(); if (confirm(`„${t.name}“ entfernen? Hochgeladene Dateien bleiben erhalten.`)) { targets = await pim.deleteTarget(t.id); if (editing === t.id) fillForm(); renderTargets(); } });
    li.addEventListener('click', () => fillForm(t));
    li.append(r, g, x); list.append(li);
  }
  $('stEmpty').hidden = targets.targets.length > 0;
  list.hidden = !targets.targets.length;
}
function syncType() { document.querySelectorAll('[data-for]').forEach(l => { l.hidden = l.dataset.for !== $('fType').value; }); }
function fillForm(t = {}) {
  editing = t.id || null;
  $('fName').value = t.name || ''; $('fType').value = t.type || 'folder';
  $('fPath').value = t.path || ''; $('fUrl').value = t.url || ''; $('fUser').value = t.user || ''; $('fPass').value = '';
  $('fPass').placeholder = t.hasPass ? 'unverändert lassen' : '';
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
  try { msg(await pim.testTarget(formTarget(), $('fPass').value), true); } catch (e) { msg(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), false); }
});
$('stForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    targets = await pim.saveTarget(formTarget(), $('fPass').value);
    if (!editing) editing = targets.targets[targets.targets.length - 1].id;
    renderTargets(); msg('Gespeichert', true); $('fPass').value = '';
  } catch (err) { msg(String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), false); }
});

/* ---------- mascot ---------- */
function flash(name, ms) { state.flash = { name, until: Date.now() + ms }; }
function note(text, ms = 1200) { state.note = { text, until: Date.now() + ms }; }
function mascotState() {
  const now = Date.now();
  if ([...state.uploads.values()].some(u => u.status === 'running')) return 'upload';
  if (state.flash && state.flash.until > now) return state.flash.name;
  if (lowBattery()) return 'rate limit';
  if (state.steam.length) return 'working';
  if (state.media && state.media.playing) return 'dancing';
  if (now - state.lastActivity > 5 * 60 * 1000) return 'sleeping';
  return 'idle';
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
  return '';
}

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
  const t = reduced ? 1.3 : (now - t0) / 1000;
  const name = mascotState();
  let st = STATES[name];
  if (name === 'idle' && state.prefs.color) st = { ...st, rgb: hex(state.prefs.color) };
  const acc = currentAcc();
  r.tint = r.tint ? mix(r.tint, st.rgb, 0.08) : st.rgb.slice();
  r.morph = lerp(r.morph, st.morph || 0, 0.1);
  r.look[0] = lerp(r.look[0], state.look[0], 0.1); r.look[1] = lerp(r.look[1], state.look[1], 0.1);
  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.clearRect(0, 0, r.w, r.h);
  const R = Math.min(r.w / 2.7, r.h / (acc ? 3.1 : 2.3)); // hats need headroom
  if (R > 0) drawPim(ctx, { cx: r.w / 2, cy: r.h * (acc ? 0.6 : 0.5), R, t, st: { ...st, fx: null }, acc, n: 2.7, morph: r.morph, look: r.look, tint: r.tint, seed: 0.8, glow: 0 });

  if (now - lastUi > 250) { // text and progress bars do not need 60 fps
    lastUi = now;
    $('statusText').textContent = statusLine();
    $('eq').hidden = !(state.media && state.media.playing);
    const m = state.media;
    if (m && m.duration) { const p = mediaPos(); $('mFill').style.width = (p / m.duration) * 100 + '%'; $('mPos').textContent = fmtTime(p); $('mDur').textContent = fmtTime(m.duration); }
  }
  requestAnimationFrame(loop);
}

/* ---------- start ---------- */
setTab('music');
fillForm();
pim.targets().then(t => { targets = t; renderTargets(); });
pim.snapshot().then(s => {
  Object.assign(state, { media: s.media, steam: s.steam || [], clips: s.clips || [], sys: s.sys, bt: s.bt || [], prefs: s.prefs || state.prefs });
  renderMedia(); renderSteam(); renderClips(); renderSys(); renderBattery(); renderLook();
});
setInterval(renderClips, 60000); // refresh "vor x min"
requestAnimationFrame(loop);
