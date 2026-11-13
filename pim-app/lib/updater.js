// Self-update from GitHub Releases (fvh02/pim) via electron-updater.
// The installed version (Pim-Setup-x.y.z.exe) downloads updates in the background and installs them in place.
// The portable exe cannot replace itself: it only reports the new version and links to the release.
const { app, shell } = require('electron');

const RELEASES = 'https://github.com/fvh02/pim/releases/latest';
const EVERY = 6 * 60 * 60 * 1000;

function start(onState) {
  let state = { status: 'idle', version: app.getVersion() };
  const set = s => { state = { ...state, ...s }; onState(state); };
  const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;

  if (!app.isPackaged) {
    set({ status: 'dev', message: 'Updates nur in der installierten Version' });
    return { check() {}, install() {}, get: () => state };
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = !portable;
  autoUpdater.autoInstallOnAppQuit = true; // a downloaded update also installs on the next normal quit
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', message: null }));
  autoUpdater.on('update-not-available', () => set({ status: 'current', checkedAt: Date.now() }));
  autoUpdater.on('update-available', info => set({ status: portable ? 'portable' : 'downloading', next: info.version, percent: 0 }));
  autoUpdater.on('download-progress', p => set({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', info => set({ status: 'ready', next: info.version }));
  autoUpdater.on('error', e => set({ status: 'error', message: String((e && e.message) || e).split('\n')[0] }));

  const check = () => autoUpdater.checkForUpdates().catch(() => { /* reported via 'error' */ });
  setTimeout(check, 15000);
  setInterval(check, EVERY);

  return {
    check,
    install() {
      if (state.status === 'ready') autoUpdater.quitAndInstall(true, true); // silent install, then restart Pim
      else if (state.status === 'portable') shell.openExternal(RELEASES);
    },
    get: () => state,
  };
}

module.exports = { start };
