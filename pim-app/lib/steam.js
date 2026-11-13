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

// Polls every `ms` and calls onUpdate(list) with bytes/second computed from the previous poll.
function watch(onUpdate, ms = 3000) {
  let libs = null, prev = new Map(), timer = null, stopped = false;
  const tick = async () => {
    if (stopped) return;
    if (!libs) { const root = await steamRoot(); libs = root ? libraries(root) : []; }
    const now = Date.now();
    const next = new Map();
    const list = scan(libs).map(d => {
      const p = prev.get(d.appid);
      // Steam flushes the manifest only every few seconds: keep the last speed until the byte count moves.
      if (p && p.done === d.done) { next.set(d.appid, p); return { ...d, speed: p.speed }; }
      const speed = p && now > p.t ? Math.max(0, (d.done - p.done) / ((now - p.t) / 1000)) : 0;
      next.set(d.appid, { done: d.done, t: now, speed });
      return { ...d, speed };
    });
    prev = next;
    onUpdate(list);
    timer = setTimeout(tick, ms);
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { parseVdf, libraries, scan, watch };
