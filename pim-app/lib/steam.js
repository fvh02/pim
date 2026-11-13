// Steam download status: reads appmanifest_*.acf files in every Steam library.
// Steam rewrites these files while downloading, so polling them gives progress without any Steam API.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Minimal Valve KeyValues (VDF/ACF) parser: "key" "value" and "key" { ... }.
function parseVdf(text) {
  const tokens = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  let m;
  while ((m = re.exec(text))) tokens.push(m[2] ? { brace: m[2] } : { str: m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"') });
  let i = 0;
  const obj = () => {
    const out = {};
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t.brace === '}') return out;
      if (t.str === undefined) continue;
      const next = tokens[i++];
      if (!next) break;
      out[t.str] = next.brace === '{' ? obj() : next.str;
    }
    return out;
  };
  return obj();
}

function steamRoot() {
  return new Promise(resolve => {
    const fallback = 'C:\\Program Files (x86)\\Steam';
    if (process.platform !== 'win32') return resolve(null);
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true }, (err, out) => {
      const m = !err && /SteamPath\s+REG_SZ\s+(.+)/.exec(out);
      resolve(m ? path.normalize(m[1].trim()) : fallback);
    });
  });
}

function libraries(root) {
  const libs = new Set([root]);
  try {
    const vdf = parseVdf(fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    for (const v of Object.values(vdf.libraryfolders || {})) if (v && v.path) libs.add(path.normalize(v.path));
  } catch { /* no library file: only the root library */ }
  return [...libs];
}

// One snapshot of every app that still has bytes to download.
function scan(libs) {
  const out = [];
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const a = parseVdf(fs.readFileSync(path.join(dir, f), 'utf8')).AppState || {};
        const total = +a.BytesToDownload || 0, done = +a.BytesDownloaded || 0;
        if (total > 0 && done < total) {
          out.push({ appid: a.appid, name: a.name || `App ${a.appid}`, done, total, stateFlags: +a.StateFlags || 0 });
        }
      } catch { /* manifest mid-write: next poll catches it */ }
    }
  }
  return out;
}

// Steam's own download log: the latest "state changed" line per app tells whether it is downloading right now,
// "Current download rate" gives the speed. Only the tail of the file is read.
function parseContentLog(text) {
  const apps = new Map();
  let rate = null;
  for (const line of text.split(/\r?\n/)) {
    let m = /AppID (\d+) (?:state changed|update changed)\s*:\s*(.*)$/.exec(line);
    if (m) {
      const st = m[2];
      const running = /Downloading|Update Running|Staging|Committing|Preallocating/.test(st) && !/Suspended|Paused|Stopping/.test(st);
      apps.set(m[1], running);
      continue;
    }
    m = /download rate:\s*([\d.]+)\s*(Mbps|MB\/s|KB\/s)/i.exec(line);
    if (m) rate = +m[1] * (/Mbps/i.test(m[2]) ? 125000 : /MB/i.test(m[2]) ? 1e6 : 1e3);
  }
  return { running: new Set([...apps].filter(([, r]) => r).map(([id]) => id)), rate };
}
function readTail(file, bytes = 256 * 1024) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size, len = Math.min(size, bytes), buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
}
function steamRunning() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve(true);
    execFile('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], { windowsHide: true }, (err, out) => resolve(!err && /steam\.exe/i.test(out)));
  });
}
function appName(libs, appid) {
  for (const lib of libs) {
    try { return parseVdf(fs.readFileSync(path.join(lib, 'steamapps', `appmanifest_${appid}.acf`), 'utf8')).AppState.name; } catch { /* other library */ }
  }
  return `App ${appid}`;
}

// A download counts as running when Steam's log says so, when its byte count in the manifest moved within
// STALE_MS, or briefly when the manifest flags it (UpdateRunning 256, Downloading 1048576, not Paused 512) and it
// has not been static for STALE_MS. Manifests alone also list queued, paused and leftover updates.
const STALE_MS = 2 * 60 * 1000, RUNNING = 256 | 1048576, PAUSED = 512;

// One poll step: pending manifests + log state + state from the last step -> running downloads and the next state.
function track(pending, prev, now, log = { running: new Set(), rate: null }) {
  const next = new Map(), active = [];
  for (const d of pending) {
    const p = prev.get(d.appid);
    let e;
    if (!p) e = { done: d.done, t: now, speed: 0, moved: 0 }; // first sight: no evidence of movement yet
    // Steam flushes the manifest only now and then: keep the last speed until the byte count moves
    else if (p.done === d.done) e = p;
    else e = { done: d.done, t: now, speed: now > p.t ? Math.max(0, (d.done - p.done) / ((now - p.t) / 1000)) : 0, moved: now };
    next.set(d.appid, e);
    const moving = e.moved && now - e.moved < STALE_MS;
    const logged = log.running.has(String(d.appid));
    const flagged = (d.stateFlags & RUNNING) && !(d.stateFlags & PAUSED) && now - e.t < STALE_MS;
    if (logged || moving || flagged) active.push({ ...d, speed: logged && log.rate != null ? log.rate : moving ? e.speed : 0 });
  }
  return { active, next };
}

// Polls every `ms` and calls onUpdate(list) with the running downloads.
function watch(onUpdate, ms = 3000) {
  let root, libs = null, prev = new Map(), timer = null, stopped = false, running = true, lastProc = 0;
  const tick = async () => {
    if (stopped) return;
    if (!libs) { root = await steamRoot(); libs = root ? libraries(root) : []; }
    const now = Date.now();
    if (now - lastProc > 15000) { lastProc = now; running = await steamRunning(); }
    let list = [];
    if (root && running) {
      const log = parseContentLog(readTail(path.join(root, 'logs', 'content_log.txt')));
      const pending = scan(libs);
      // downloading per log but without byte counts in the manifest yet (fresh install): show it anyway
      for (const id of log.running) if (!pending.some(d => String(d.appid) === id)) pending.push({ appid: id, name: appName(libs, id), done: 0, total: 0, stateFlags: 0 });
      const r = track(pending, prev, now, log);
      prev = r.next; list = r.active;
    }
    onUpdate(list);
    timer = setTimeout(tick, ms);
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { parseVdf, libraries, scan, track, parseContentLog, watch };
