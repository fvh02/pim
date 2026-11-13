// Pim: notch-style island at the top edge of the Windows screen.
const { app, BrowserWindow, ipcMain, screen, clipboard, Tray, Menu, nativeImage, dialog, shell, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const bridge = require('./lib/bridge');
const battery = require('./lib/battery');
const updater = require('./lib/updater');
const steam = require('./lib/steam');
const upload = require('./lib/upload');

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('de.pim.island');

const SIZE = { collapsed: { w: 300, h: 38 }, expanded: { w: 640, h: 360 } };
let win = null, tray = null, expanded = false;

/* ---------- settings (userData/settings.json) ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { targets: [], defaultTarget: null, pins: [], prefs: { acc: 'auto', color: null, gameMode: true } };
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = { ...settings, ...saved, prefs: { ...settings.prefs, ...saved.prefs } };
  } catch { /* first start */ }
}
function saveSettings() {
  const tmp = settingsFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2)); // write-then-rename: a crash never leaves half a file
  fs.renameSync(tmp, settingsFile());
}
const publicTargets = () => ({
  defaultTarget: settings.defaultTarget,
  targets: settings.targets.map(({ passEnc, ...t }) => ({ ...t, hasPass: !!passEnc })), // passwords never reach the renderer
});
const passOf = t => (t && t.passEnc ? safeStorage.decryptString(Buffer.from(t.passEnc, 'base64')) : '');

/* ---------- window ---------- */
function place() {
  if (!win) return;
  const d = screen.getPrimaryDisplay().bounds;
  const s = expanded ? SIZE.expanded : SIZE.collapsed;
  win.setBounds({ x: Math.round(d.x + (d.width - s.w) / 2), y: d.y, width: s.w, height: s.h });
}

function createWindow() {
  win = new BrowserWindow({
    ...SIZE.collapsed, frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.loadFile(path.join(__dirname, 'src', 'island.html'));
  win.once('ready-to-show', () => { place(); applyVisibility(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  screen.on('display-metrics-changed', place);
  screen.on('display-added', place);
  screen.on('display-removed', place);
}
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

/* ---------- visibility: tray toggle and game mode ---------- */
let userHidden = false, busy = false;
function applyVisibility() {
  if (!win) return;
  const hide = userHidden || (busy && settings.prefs.gameMode);
  if (hide && win.isVisible()) win.hide();
  if (!hide && !win.isVisible()) win.showInactive();
}

/* ---------- tray ---------- */
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.setToolTip('Pim');
  const build = () => Menu.buildFromTemplate([
    { label: 'Pim anzeigen', type: 'checkbox', checked: !userHidden, click: i => { userHidden = !i.checked; applyVisibility(); } },
    upd.get().status === 'ready'
      ? { label: `Update ${upd.get().next} installieren und neu starten`, click: () => upd.install() }
      : { label: 'Nach Updates suchen', click: () => upd.check() },
    { label: 'Mit Windows starten', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() },
  ]);
  tray.on('click', () => { userHidden = !userHidden; applyVisibility(); });
  tray.on('right-click', () => tray.popUpContextMenu(build()));
}

/* ---------- clipboard history ----------
   Unpinned entries live in memory only: copied passwords never touch the disk.
   Pinned entries are saved: text in settings.json, images as PNG in userData/pins. */
const MAX_CLIPS = 50, MAX_IMAGES = 10; // images cost memory, so fewer of them
let clips = [], lastSig = '';
const pinDir = () => path.join(app.getPath('userData'), 'pins');
const pinFile = id => path.join(pinDir(), `${id}.png`);
const sigOf = c => (c.type === 'text' ? 't:' + c.text : 'i:' + c.hash);
const pushClips = fresh => send('clips', { clips: clips.map(({ img, ...c }) => c), fresh });

function imageEntry(img) {
  const { width, height } = img.getSize();
  const thumb = (width > 320 ? img.resize({ width: 320 }) : img).toDataURL();
  return { type: 'image', img, width, height, thumb, hash: crypto.createHash('sha1').update(img.toBitmap()).digest('hex') };
}
function readClipboard() {
  const text = clipboard.readText();
  if (text && text.trim()) return { type: 'text', text }; // text wins: Office copies cells as text and as a picture
  if (clipboard.availableFormats().some(f => f.startsWith('image/'))) {
    const img = clipboard.readImage();
    if (!img.isEmpty()) return imageEntry(img);
  }
  return null;
}
function trimClips(list) {
  let n = 0, imgs = 0;
  return list.filter(c => c.pinned || (++n <= MAX_CLIPS && (c.type !== 'image' || ++imgs <= MAX_IMAGES)));
}
function pollClipboard() {
  const e = readClipboard();
  if (!e || sigOf(e) === lastSig) return;
  lastSig = sigOf(e);
  const old = clips.find(c => sigOf(c) === lastSig);
  const entry = old ? { ...old, at: Date.now() } : { ...e, id: crypto.randomUUID(), at: Date.now(), pinned: false };
  clips = trimClips([entry, ...clips.filter(c => c !== old)]);
  pushClips(true);
}
function savePins() {
  settings.pins = clips.filter(c => c.pinned).map(c => (c.type === 'text' ? { id: c.id, type: 'text', text: c.text, at: c.at } : { id: c.id, type: 'image', at: c.at }));
  saveSettings();
}
function loadPins() {
  for (const p of settings.pins || []) {
    if (!p || !/^[\w-]+$/.test(p.id)) continue;
    if (p.type === 'text' && typeof p.text === 'string') clips.push({ id: p.id, type: 'text', text: p.text, at: p.at, pinned: true });
    if (p.type === 'image') {
      const img = nativeImage.createFromPath(pinFile(p.id));
      if (!img.isEmpty()) clips.push({ ...imageEntry(img), id: p.id, at: p.at, pinned: true });
    }
  }
}
function setPinned(c, on) {
  c.pinned = on;
  if (c.type === 'image') {
    if (on) { fs.mkdirSync(pinDir(), { recursive: true }); fs.writeFileSync(pinFile(c.id), c.img.toPNG()); } else fs.rmSync(pinFile(c.id), { force: true });
  }
}

/* ---------- uploads ---------- */
async function runUploads(files, targetId) {
  const target = settings.targets.find(t => t.id === (targetId || settings.defaultTarget)) || settings.targets[0];
  for (const file of files) {
    const id = crypto.randomUUID(), name = path.basename(file);
    if (!target) { send('upload', { id, name, status: 'error', error: 'Kein Speicher eingerichtet (Tab „Speicher“)' }); continue; }
    send('upload', { id, name, target: target.name, status: 'running', sent: 0, total: 0 });
    let last = 0;
    try {
      const r = await upload.uploadFile(file, target, passOf(target), (sent, total) => {
        const now = Date.now();
        if (now - last > 120 || sent === total) { last = now; send('upload', { id, name, target: target.name, status: 'running', sent, total }); }
      });
      send('upload', { id, name: r.name, target: target.name, status: 'done', location: r.location, kind: target.type });
    } catch (e) {
      send('upload', { id, name, target: target.name, status: 'error', error: e.message });
    }
  }
}

/* ---------- IPC ---------- */
function ipc() {
  const str = v => typeof v === 'string';
  ipcMain.on('expand', (_e, on) => { if (expanded !== !!on) { expanded = !!on; place(); } });
  ipcMain.on('media', (_e, cmd) => sys.send(cmd));
  ipcMain.on('steam:open', () => shell.openExternal('steam://open/downloads'));

  const clipById = id => clips.find(c => c.id === id);
  ipcMain.on('clip:copy', (_e, id) => {
    const c = clipById(id); if (!c) return;
    if (c.type === 'text') clipboard.writeText(c.text); else clipboard.writeImage(c.img);
    lastSig = sigOf(c);
    clips = [c, ...clips.filter(x => x !== c)];
    pushClips();
  });
  ipcMain.on('clip:delete', (_e, id) => {
    const c = clipById(id); if (!c) return;
    if (c.pinned) { setPinned(c, false); clips = clips.filter(x => x !== c); savePins(); } else clips = clips.filter(x => x !== c);
    pushClips();
  });
  ipcMain.on('clip:pin', (_e, id) => {
    const c = clipById(id); if (!c) return;
    setPinned(c, !c.pinned);
    clips = trimClips(clips); savePins(); pushClips();
  });
  ipcMain.on('clip:clear', () => { clips = clips.filter(c => c.pinned); pushClips(); }); // pinned entries stay
  ipcMain.on('clip:upload', (_e, id) => {
    const c = clipById(id); if (!c || c.type !== 'image') return;
    const dir = path.join(os.tmpdir(), 'Pim'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `Bild ${new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-')}.png`);
    fs.writeFileSync(file, c.img.toPNG());
    runUploads([file]);
  });

  ipcMain.on('update:check', () => upd.check());
  ipcMain.on('update:install', () => upd.install());
  ipcMain.on('volume', (_e, v) => { if (typeof v === 'number') sys.send(['vol', v]); });
  ipcMain.on('mute', (_e, on) => sys.send(['mute', !!on]));
  ipcMain.handle('prefs:set', (_e, p) => {
    const next = { ...settings.prefs };
    if (p && str(p.acc) && /^[a-z ]{1,20}$/.test(p.acc)) next.acc = p.acc;
    if (p && 'color' in p) next.color = str(p.color) && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : null;
    if (p && typeof p.gameMode === 'boolean') next.gameMode = p.gameMode;
    settings.prefs = next; saveSettings(); applyVisibility();
    return next;
  });

  ipcMain.handle('snapshot', () => ({ ...snap, update: upd.get(), clips: clips.map(({ img, ...c }) => c), prefs: settings.prefs }));
  ipcMain.handle('targets:list', () => publicTargets());
  ipcMain.handle('targets:presets', () => upload.presets());
  ipcMain.handle('targets:save', (_e, t, pass) => {
    if (!t || !str(t.name) || !t.name.trim() || !['folder', 'webdav'].includes(t.type)) throw new Error('Name und Typ fehlen');
    if (t.type === 'folder' && !(str(t.path) && t.path.trim())) throw new Error('Pfad fehlt');
    if (t.type === 'webdav') upload.davUrl(t.url, 'x'); // throws on bad URL
    const old = settings.targets.find(x => x.id === t.id);
    const clean = { id: old ? old.id : crypto.randomUUID(), name: t.name.trim(), type: t.type, path: str(t.path) ? t.path.trim() : '', url: str(t.url) ? t.url.trim() : '', user: str(t.user) ? t.user : '' };
    if (str(pass) && pass) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows-Verschlüsselung nicht verfügbar, Passwort nicht gespeichert');
      clean.passEnc = safeStorage.encryptString(pass).toString('base64');
    } else if (old && old.passEnc && clean.user) clean.passEnc = old.passEnc;
    settings.targets = old ? settings.targets.map(x => (x === old ? clean : x)) : [...settings.targets, clean];
    if (!settings.defaultTarget) settings.defaultTarget = clean.id;
    saveSettings();
    return publicTargets();
  });
  ipcMain.handle('targets:delete', (_e, id) => {
    settings.targets = settings.targets.filter(t => t.id !== id);
    if (settings.defaultTarget === id) settings.defaultTarget = settings.targets[0] ? settings.targets[0].id : null;
    saveSettings();
    return publicTargets();
  });
  ipcMain.handle('targets:default', (_e, id) => {
    if (settings.targets.some(t => t.id === id)) { settings.defaultTarget = id; saveSettings(); }
    return publicTargets();
  });
  ipcMain.handle('targets:test', async (_e, t, pass) => {
    const old = settings.targets.find(x => x.id === t.id);
    return upload.testTarget(t, str(pass) && pass ? pass : passOf(old));
  });

  ipcMain.handle('pick:folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('pick:files', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
    if (!r.canceled) runUploads(r.filePaths);
  });
  ipcMain.on('upload', (_e, files, targetId) => {
    if (Array.isArray(files)) runUploads(files.filter(f => str(f) && path.isAbsolute(f)), str(targetId) ? targetId : null);
  });
  ipcMain.on('reveal', (_e, location) => {
    if (!str(location)) return;
    if (/^https?:\/\//.test(location)) clipboard.writeText(location); // WebDAV: copy the link
    else shell.showItemInFolder(location);
  });
}

let sys = { send() {}, stop() {} };
let upd = { check() {}, install() {}, get: () => ({ status: 'idle', version: app.getVersion() }) };
const snap = { media: null, steam: [], sys: null, bt: [] }; // last values, for a renderer that (re)loads late
let bridgeSeen = 0, clipSeq = null;
app.whenReady().then(() => {
  loadSettings();
  loadPins();
  createWindow();
  createTray();
  ipc();
  sys = bridge.start(s => {
    if (s.clipSeq !== undefined) bridgeSeen = Date.now(); // only a live bridge replaces clipboard polling
    snap.media = s.media; send('media', s.media);
    if ('vol' in s && (!snap.sys || snap.sys.vol !== s.vol || snap.sys.muted !== s.muted)) { snap.sys = { vol: s.vol, muted: s.muted }; send('sys', snap.sys); }
    if (!!s.busy !== busy) { busy = !!s.busy; applyVisibility(); }
    if (s.clipSeq !== undefined && s.clipSeq !== clipSeq) { clipSeq = s.clipSeq; pollClipboard(); } // Windows tells us when the clipboard changed
  });
  steam.watch(list => { snap.steam = list; send('steam', list); });
  battery.watch(list => { snap.bt = list; send('bt', list); });
  upd = updater.start(u => send('update', u));
  setInterval(() => { if (Date.now() - bridgeSeen > 3000) pollClipboard(); }, 700); // fallback without the bridge
});
app.on('second-instance', () => { userHidden = false; applyVisibility(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => sys.stop());
