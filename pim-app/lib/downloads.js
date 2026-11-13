// Browser downloads: browsers write a temporary file into the download folder while downloading
// (Chrome, Edge, Brave, Opera: ".crdownload"; Firefox: ".part"; old Edge: ".partial") and rename it when done.
// Polling those files gives name, bytes so far and speed. The final size is not known (browsers keep it internally).
// shortcut: only watches the Windows Downloads folder; add more folders if downloads are saved elsewhere.
const fs = require('fs');
const path = require('path');

const TEMP = [
  { ext: '.crdownload', source: 'Browser' },
  { ext: '.part', source: 'Firefox' },
  { ext: '.partial', source: 'Edge' },
];

function listTemp(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const f of names) {
    const t = TEMP.find(x => f.toLowerCase().endsWith(x.ext));
    if (!t) continue;
    try {
      const st = fs.statSync(path.join(dir, f));
      if (!st.isFile()) continue;
      // Chrome: "Unbestätigt 123456.crdownload" until the user confirms; Firefox: "name.ext.part" or "random.part"
      out.push({ id: 'f:' + f, file: f, name: f.slice(0, -t.ext.length), source: t.source, done: st.size });
    } catch { /* renamed meanwhile */ }
  }
  return out;
}

// One poll step: temp files now + state from the last step -> downloads with speed, finished names, next state.
function track(files, prev, now, dir) {
  const next = new Map(), active = [], finished = [];
  for (const f of files) {
    const p = prev.get(f.id);
    const speed = p && now > p.t ? Math.max(0, (f.done - p.done) / ((now - p.t) / 1000)) : 0;
    // keep a smoothed speed so the number does not flicker between polls
    const e = { done: f.done, t: now, speed: p ? p.speed * 0.6 + speed * 0.4 : 0, name: f.name };
    next.set(f.id, e);
    active.push({ id: f.id, source: f.source, name: f.name, done: f.done, total: 0, speed: e.speed });
  }
  for (const [id, p] of prev) {
    // temp file gone and the final file exists -> finished (gone without a final file -> cancelled)
    if (!next.has(id) && dir && fs.existsSync(path.join(dir, p.name))) finished.push({ id, name: p.name, done: p.done });
  }
  return { active, finished, next };
}

function watch(dir, onUpdate, onFinished, ms = 1500) {
  let prev = new Map(), stopped = false, timer = null;
  const tick = () => {
    if (stopped) return;
    const r = track(listTemp(dir), prev, Date.now(), dir);
    prev = r.next;
    onUpdate(r.active);
    for (const f of r.finished) onFinished(f);
    timer = setTimeout(tick, ms);
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { listTemp, track, watch };
