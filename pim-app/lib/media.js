// Runs media.ps1 as a long-lived child process and relays its JSON lines.
const { spawn } = require('child_process');
const path = require('path');

function start(onState) {
  if (process.platform !== 'win32') { onState({ active: false, error: 'Nur unter Windows verfügbar' }); return { send() {}, stop() {} }; }
  // electron-builder unpacks *.ps1 next to app.asar so PowerShell can read it.
  const script = path.join(__dirname, 'media.ps1').replace('app.asar', 'app.asar.unpacked');
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
          if (s.key !== key) { key = s.key; cover = null; }
          if ('cover' in s) cover = s.cover;
          onState({ ...s, cover });
        } catch { /* partial or non-JSON line from PowerShell */ }
      }
    });
    child.stderr.on('data', d => console.error('[media]', String(d).trim()));
    child.on('exit', () => { child = null; if (!stopped) setTimeout(run, 3000); });
  };
  run();

  return {
    send(cmd) { if (child && ['toggle', 'next', 'prev'].includes(cmd)) child.stdin.write(cmd + '\n'); },
    stop() { stopped = true; if (child) child.kill(); },
  };
}

module.exports = { start };
