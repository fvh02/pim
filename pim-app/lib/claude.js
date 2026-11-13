// Claude Code status: Claude Code hooks POST their event JSON to a small HTTP server on 127.0.0.1.
// PermissionRequest hooks wait for the answer from the notch (Allow / Deny) for up to WAIT_MS, then fall back to
// Claude's normal prompt in the terminal.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47811, WAIT_MS = 25000;
const MARK = '/pim-hook'; // identifies Pim's entries in ~/.claude/settings.json
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'PermissionRequest', 'Stop', 'SessionEnd'];
const SEARCH_TOOLS = /^(Grep|Glob|WebSearch|WebFetch|Read|LS)$/;

// hook event -> what Pim shows
function describe(ev) {
  const tool = ev.tool_name || '';
  const input = ev.tool_input || {};
  const detail = input.command || input.file_path || input.pattern || input.url || input.query || input.description || '';
  switch (ev.hook_event_name) {
    case 'SessionStart': return { state: 'greeting', text: 'Sitzung gestartet' };
    case 'UserPromptSubmit': return { state: 'thinking', text: 'Denkt nach' };
    case 'PreToolUse': return { state: SEARCH_TOOLS.test(tool) ? 'searching' : 'working', text: tool, detail };
    case 'PostToolUse': return { state: 'thinking', text: 'Denkt nach' };
    case 'Notification': return /permission/i.test(ev.message || '') ? { state: 'approval', text: 'Braucht deine Freigabe', detail: ev.message } : { state: 'question', text: ev.message || 'Wartet auf dich' };
    case 'PermissionRequest': return { state: 'approval', text: `Freigabe: ${tool}`, detail };
    case 'Stop': return { state: 'finished', text: 'Fertig' };
    case 'SessionEnd': return { state: 'idle', text: 'Sitzung beendet', ended: true };
    default: return null;
  }
}

function start(token, onEvent) {
  const pending = new Map(); // id -> { res, timer }
  let seq = 0;
  const answer = (id, behavior) => {
    const p = pending.get(id);
    if (!p) return false;
    pending.delete(id); clearTimeout(p.timer);
    p.res.end(behavior ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior } } }) : '{}');
    onEvent({ type: 'permission-closed', id });
    return true;
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'POST' || url.pathname !== MARK || url.searchParams.get('t') !== token) { res.writeHead(404); return res.end(); }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let ev;
      try { ev = JSON.parse(body); } catch { res.writeHead(400); return res.end(); }
      const d = describe(ev);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (!d) return res.end('{}');
      const base = { type: 'status', session: ev.session_id, cwd: ev.cwd, at: Date.now(), ...d };
      if (ev.hook_event_name !== 'PermissionRequest') { onEvent(base); return res.end('{}'); }
      const id = ++seq;
      pending.set(id, { res, timer: setTimeout(() => answer(id, null), WAIT_MS) });
      res.on('close', () => { if (!res.writableEnded) answer(id, null); }); // curl gave up: drop the card
      onEvent({ ...base, type: 'permission', id, tool: ev.tool_name, waitMs: WAIT_MS });
    });
  });
  server.on('error', e => onEvent({ type: 'error', message: e.code === 'EADDRINUSE' ? `Port ${PORT} ist belegt` : e.message }));
  server.listen(PORT, '127.0.0.1');
  return { answer, stop: () => server.close() };
}

// The hook command: send the event on stdin to Pim; "|| true" keeps Claude quiet when Pim is not running.
const hookCommand = token => `curl -s -m 30 -X POST -H "Content-Type: application/json" --data-binary @- "http://127.0.0.1:${PORT}${MARK}?t=${token}" || true`;

// Adds Pim's hooks to ~/.claude/settings.json (backup first), replacing older Pim entries; other hooks stay.
function install(token, file = path.join(os.homedir(), '.claude', 'settings.json')) {
  let cfg = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    cfg = raw.trim() ? JSON.parse(raw) : {}; // invalid JSON throws: never overwrite a file we cannot read
    fs.copyFileSync(file, file + '.pim-backup');
  } else fs.mkdirSync(path.dirname(file), { recursive: true });
  cfg.hooks = cfg.hooks || {};
  for (const ev of EVENTS) {
    const keep = (cfg.hooks[ev] || []).map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !String(h.command || '').includes(MARK)) })).filter(g => g.hooks.length);
    const entry = { hooks: [{ type: 'command', command: hookCommand(token), timeout: 40 }] };
    if (/ToolUse|PermissionRequest/.test(ev)) entry.matcher = '*';
    cfg.hooks[ev] = [...keep, entry];
  }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, file);
  return file;
}
const installed = (file = path.join(os.homedir(), '.claude', 'settings.json')) => {
  try { return fs.readFileSync(file, 'utf8').includes(MARK); } catch { return false; }
};

module.exports = { start, install, installed, describe, hookCommand, PORT };
