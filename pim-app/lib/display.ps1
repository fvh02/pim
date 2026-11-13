# Pim display brightness. Usage: display.ps1 list | display.ps1 set <id> <0..100>
# Laptop panels via WMI, external monitors via DDC/CI (VCP code 0x10). Prints JSON.
param([string]$cmd = 'list', [string]$id = '', [int]$value = -1)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class PimDdc {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PHYSICAL_MONITOR { public IntPtr h; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string name; }
  delegate bool EnumProc(IntPtr hMon, IntPtr hdc, IntPtr rect, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, EnumProc cb, IntPtr data);
  [DllImport("dxva2.dll")] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr h, out uint n);
  [DllImport("dxva2.dll")] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr h, uint n, [Out] PHYSICAL_MONITOR[] arr);
  [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint n, PHYSICAL_MONITOR[] arr);
  [DllImport("dxva2.dll")] static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr h, byte code, IntPtr type, out uint cur, out uint max);
  [DllImport("dxva2.dll")] static extern bool SetVCPFeature(IntPtr h, byte code, uint value);
  static List<PHYSICAL_MONITOR> All() {
    var list = new List<PHYSICAL_MONITOR>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (hMon, hdc, r, d) => {
      uint n; if (GetNumberOfPhysicalMonitorsFromHMONITOR(hMon, out n) && n > 0) { var arr = new PHYSICAL_MONITOR[n]; if (GetPhysicalMonitorsFromHMONITOR(hMon, n, arr)) list.AddRange(arr); }
      return true;
    }, IntPtr.Zero);
    return list;
  }
  // "index|name|percent" per monitor that answers DDC/CI
  public static string[] List() {
    var all = All(); var res = new List<string>();
    for (int i = 0; i < all.Count; i++) { uint cur, max; if (GetVCPFeatureAndVCPFeatureReply(all[i].h, 0x10, IntPtr.Zero, out cur, out max) && max > 0) res.Add(i + "|" + all[i].name + "|" + (cur * 100 / max)); }
    DestroyPhysicalMonitors((uint)all.Count, all.ToArray());
    return res.ToArray();
  }
  public static bool Set(int index, int pct) {
    var all = All(); bool ok = false;
    if (index >= 0 && index < all.Count) { uint cur, max; if (GetVCPFeatureAndVCPFeatureReply(all[index].h, 0x10, IntPtr.Zero, out cur, out max) && max > 0) ok = SetVCPFeature(all[index].h, 0x10, (uint)(pct * max / 100)); }
    DestroyPhysicalMonitors((uint)all.Count, all.ToArray());
    return ok;
  }
}
'@
if ($cmd -eq 'set') {
  $v = [math]::Max(0, [math]::Min(100, $value))
  if ($id -eq 'internal') {
    Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 0; Brightness = [byte]$v } | Out-Null
  } elseif ($id -like 'ddc:*') {
    if (-not [PimDdc]::Set([int]$id.Substring(4), $v)) { throw 'Monitor antwortet nicht (DDC/CI im Monitormenü aktivieren)' }
  }
  '{"ok":true}'
  exit 0
}
$out = @()
try { $b = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1; if ($b) { $out += [pscustomobject]@{ id = 'internal'; name = 'Eingebauter Bildschirm'; value = [int]$b.CurrentBrightness } } } catch {}
foreach ($line in [PimDdc]::List()) { $p = $line -split '\|', 3; $out += [pscustomobject]@{ id = "ddc:$($p[0])"; name = $(if ($p[1]) { $p[1] } else { 'Monitor' }); value = [int]$p[2] } }
ConvertTo-Json -Compress -InputObject @($out)
