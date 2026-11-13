// Bluetooth device battery (headsets, earbuds) from the Windows device property DEVPKEY_Bluetooth_Battery.
// Separate short PowerShell run every minute: Get-PnpDevice takes seconds and must not stall the bridge loop.
// shortcut: only devices that report battery to Windows (most Bluetooth audio). BLE mice/keyboards and Xbox pads often do not; add GATT reads if needed.
const { execFile } = require('child_process');

const BATTERY = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2';
const CONNECTED = '{83DA6326-97A6-4088-9453-A1923F573B29} 15';
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$d = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'BTHENUM*' -or $_.InstanceId -like 'BTHLE*' }
$out = @()
if ($d) {
  $props = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName '${BATTERY}','${CONNECTED}'
  foreach ($g in ($props | Group-Object InstanceId)) {
    $bat = ($g.Group | Where-Object KeyName -eq '${BATTERY}').Data
    if ($null -ne $bat) {
      $conn = ($g.Group | Where-Object KeyName -eq '${CONNECTED}').Data
      $out += [pscustomobject]@{ name = ($d | Where-Object InstanceId -eq $g.Name | Select-Object -First 1).FriendlyName; level = [int]$bat; connected = $conn }
    }
  }
}
ConvertTo-Json -Compress -InputObject @($out)
`;

// PowerShell rows -> one entry per device name, connected ones only.
function parseDevices(json) {
  let rows;
  try { rows = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];
  const byName = new Map();
  for (const r of rows) {
    if (!r || !r.name || r.connected === false || !(r.level >= 0 && r.level <= 100)) continue;
    // one headset shows up as several device nodes (hands-free, A2DP, ...)
    byName.set(r.name, Math.max(byName.get(r.name) ?? 0, r.level));
  }
  return [...byName].map(([name, level]) => ({ name, level })).sort((a, b) => a.name.localeCompare(b.name));
}

function watch(onUpdate, ms = 60000) {
  if (process.platform !== 'win32') { onUpdate([]); return () => {}; }
  let timer = null, stopped = false;
  const tick = () => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { windowsHide: true, timeout: 30000 }, (_err, out) => {
      if (stopped) return;
      onUpdate(parseDevices(String(out || '').trim()));
      timer = setTimeout(tick, ms);
    });
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { parseDevices, watch };
