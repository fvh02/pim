// Runs bridge.ps1 as a long-lived child process and relays its JSON lines.
const { spawn } = require('child_process');
const path = require('path');

const COMMANDS = new Set(['toggle', 'next', 'prev']);

function start(onState) {
  if (process.platform !== 'win32') { onState({ media: { active: false, error: 'Nur unter Windows verfügbar' } }); return { send() {}, stop() {} }; }
  // electron-builder unpacks *.ps1 next to app.asar so PowerShell can read it.
  const script = path.join(__dirname, 'bridge.ps1').replace('app.asar', 'app.asar.unpacked');
  let child = null, stopped = false, cover = null, key = null;

  const run = () => {
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const s = JSON.parse(line);
          const m = s.media || {};
          if (m.key !== key) { key = m.key; cover = null; }
          if ('cover' in m) cover = m.cover;
          onState({ ...s, media: { ...m, cover } });
        } catch { /* partial or non-JSON line from PowerShell */ }
      }
    });
    child.stderr.on('data', d => console.error('[bridge]', String(d).trim()));
    child.on('exit', () => { child = null; if (!stopped) setTimeout(run, 3000); });
  };
  run();

  return {
    // cmd: 'toggle' | 'next' | 'prev' | 'back' | 'fwd' (±10 s) | ['vol', 0..1] | ['mute', bool]
    send(cmd) {
      if (!child) return;
      if (COMMANDS.has(cmd)) child.stdin.write(cmd + '\n');
      else if (cmd === 'back' || cmd === 'fwd') child.stdin.write(`seek ${cmd === 'back' ? -10 : 10}\n`);
      else if (Array.isArray(cmd) && cmd[0] === 'vol' && Number.isFinite(cmd[1])) child.stdin.write(`vol ${Math.max(0, Math.min(1, cmd[1])).toFixed(3)}\n`);
      else if (Array.isArray(cmd) && cmd[0] === 'mute') child.stdin.write(`mute ${cmd[1] ? 1 : 0}\n`);
    },
    stop() { stopped = true; if (child) child.kill(); },
  };
}

module.exports = { start };
