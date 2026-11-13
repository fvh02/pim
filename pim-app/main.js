// Pim: notch-style island at the top edge of the Windows screen.
const { app, BrowserWindow, ipcMain, screen, clipboard, Tray, Menu, nativeImage, dialog, shell, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const media = require('./lib/media');
const steam = require('./lib/steam');
const upload = require('./lib/upload');

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('de.pim.island');

const SIZE = { collapsed: { w: 300, h: 38 }, expanded: { w: 640, h: 360 } };
let win = null, tray = null, expanded = false;

/* ---------- settings (userData/settings.json) ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { targets: [], defaultTarget: null };
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { /* first start */ }
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
  win.once('ready-to-show', () => { place(); win.showInactive(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  screen.on('display-metrics-changed', place);
  screen.on('display-added', place);
  screen.on('display-removed', place);
}
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

/* ---------- tray ---------- */
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.setToolTip('Pim');
  const build = () => Menu.buildFromTemplate([
    { label: 'Pim anzeigen', type: 'checkbox', checked: win.isVisible(), click: i => (i.checked ? win.showInactive() : win.hide()) },
    { label: 'Mit Windows starten', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() },
  ]);
  tray.on('click', () => (win.isVisible() ? win.hide() : win.showInactive()));
  tray.on('right-click', () => tray.popUpContextMenu(build()));
}

/* ---------- clipboard history (memory only: copied passwords never touch the disk) ---------- */
const MAX_CLIPS = 50;
let clips = [], lastClip = '';
function pollClipboard() {
  const t = clipboard.readText();
  if (t && t !== lastClip && t.trim()) {
    lastClip = t;
    clips = [{ text: t, at: Date.now() }, ...clips.filter(c => c.text !== t)].slice(0, MAX_CLIPS);
    send('clips', { clips, fresh: true });
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
  ipcMain.on('media', (_e, cmd) => mediaCtl.send(cmd));
  ipcMain.on('steam:open', () => shell.openExternal('steam://open/downloads'));

  ipcMain.on('clip:copy', (_e, i) => { const c = clips[i]; if (c) { lastClip = c.text; clipboard.writeText(c.text); clips = [c, ...clips.filter(x => x !== c)]; send('clips', { clips }); } });
  ipcMain.on('clip:delete', (_e, i) => { clips = clips.filter((_c, j) => j !== i); send('clips', { clips }); });
  ipcMain.on('clip:clear', () => { clips = []; send('clips', { clips }); });

  ipcMain.handle('snapshot', () => ({ ...snap, clips }));
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

let mediaCtl = { send() {} };
const snap = { media: null, steam: [] }; // last values, for a renderer that (re)loads late
app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createTray();
  ipc();
  mediaCtl = media.start(s => { snap.media = s; send('media', s); });
  steam.watch(list => { snap.steam = list; send('steam', list); });
  setInterval(pollClipboard, 700);
});
app.on('second-instance', () => win && win.showInactive());
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => mediaCtl.stop && mediaCtl.stop());
