// Island renderer. Uses globals from pim.js (STATES, drawPim, mix, lerp).
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtTime = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtBytes = b => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'gerade eben' : s < 3600 ? `vor ${Math.floor(s / 60)} min` : `vor ${Math.floor(s / 3600)} h`; };
const appName = id => (id || '').split(/[!\\/]/).pop().replace(/\.exe$/i, '').replace(/^.*\.(?=[^.]+$)/, '') || 'Player';

const state = { media: null, steam: [], clips: [], uploads: new Map(), flash: null, lastActivity: Date.now(), look: [0, 0.15] };
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
function renderClips() {
  const list = $('clipList'); list.replaceChildren();
  state.clips.forEach((c, i) => {
    const li = el('li', 'item clickable clip'); li.title = 'Klicken zum Kopieren';
    const g = el('div', 'grow'); g.append(el('div', 'text', c.text.slice(0, 400)), el('div', 'sub', ago(c.at) + (i === 0 ? ' · aktuell' : '')));
    const x = el('button', 'x', '×'); x.setAttribute('aria-label', 'Löschen');
    x.addEventListener('click', e => { e.stopPropagation(); pim.clipDelete(i); });
    li.addEventListener('click', () => { pim.clipCopy(i); flash('finished', 900); });
    li.append(g, x); list.append(li);
  });
  $('clipEmpty').hidden = state.clips.length > 0;
  $('clipList').hidden = state.clips.length === 0;
  $('clipCount').textContent = state.clips.length === 1 ? '1 Eintrag' : `${state.clips.length} Einträge`;
}
pim.onClips(({ clips, fresh }) => { state.clips = clips; renderClips(); if (fresh) { touch(); flash('surprised', 1200); } });
$('clipClear').addEventListener('click', () => pim.clipClear());

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
function mascotState() {
  const now = Date.now();
  if ([...state.uploads.values()].some(u => u.status === 'running')) return 'upload';
  if (state.flash && state.flash.until > now) return state.flash.name;
  if (state.steam.length) return 'working';
  if (state.media && state.media.playing) return 'dancing';
  if (now - state.lastActivity > 5 * 60 * 1000) return 'sleeping';
  return 'idle';
}
function statusLine() {
  const up = [...state.uploads.values()].find(u => u.status === 'running');
  if (up) return `↑ ${up.name} ${up.total ? Math.floor((up.sent / up.total) * 100) + ' %' : ''}`;
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
  const st = STATES[mascotState()];
  r.tint = r.tint ? mix(r.tint, st.rgb, 0.08) : st.rgb.slice();
  r.morph = lerp(r.morph, st.morph || 0, 0.1);
  r.look[0] = lerp(r.look[0], state.look[0], 0.1); r.look[1] = lerp(r.look[1], state.look[1], 0.1);
  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  ctx.clearRect(0, 0, r.w, r.h);
  const R = Math.min(r.w / 2.7, r.h / 2.3);
  if (R > 0) drawPim(ctx, { cx: r.w / 2, cy: r.h * 0.5, R, t, st: { ...st, fx: null }, acc: null, n: 2.7, morph: r.morph, look: r.look, tint: r.tint, seed: 0.8, glow: 0 });

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
pim.snapshot().then(s => { state.media = s.media; state.steam = s.steam || []; state.clips = s.clips || []; renderMedia(); renderSteam(); renderClips(); });
setInterval(renderClips, 60000); // refresh "vor x min"
requestAnimationFrame(loop);
