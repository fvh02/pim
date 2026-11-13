// Runs one of Pim's PowerShell scripts once and parses its JSON output.
const { execFile } = require('child_process');
const path = require('path');

function runPs(script, args = [], timeout = 20000) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('Nur unter Windows verfügbar'));
    const file = path.join(__dirname, script).replace('app.asar', 'app.asar.unpacked'); // scripts are unpacked next to app.asar
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args.map(String)], { windowsHide: true, timeout }, (err, out, errOut) => {
      if (err) return reject(new Error(String(errOut || err.message).split('\n').find(l => l.trim()) || 'Fehler'));
      try { resolve(JSON.parse(String(out).trim() || 'null')); } catch { reject(new Error('Unerwartete Antwort')); }
    });
  });
}

module.exports = { runPs };
