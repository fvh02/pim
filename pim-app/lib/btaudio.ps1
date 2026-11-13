# Pim Bluetooth audio: list paired Bluetooth audio devices, connect or disconnect them.
# Usage: btaudio.ps1 list | btaudio.ps1 connect <name> | btaudio.ps1 disconnect <name>. Prints JSON.
# Uses the same request as the Windows "Connect" button: KSPROPERTY_ONESHOT_RECONNECT / _DISCONNECT on the
# Bluetooth audio driver (KSPROPSETID_BtAudio). Works without admin rights; the device must be paired once in Windows.
param([string]$cmd = 'list', [string]$name = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PimBt {
  [StructLayout(LayoutKind.Sequential)] struct IFACE { public int cbSize; public Guid cls; public int flags; public IntPtr reserved; }
  [StructLayout(LayoutKind.Sequential)] struct DEVINFO { public int cbSize; public Guid cls; public int devInst; public IntPtr reserved; }
  [DllImport("setupapi.dll", SetLastError = true)] static extern IntPtr SetupDiGetClassDevs(ref Guid cls, IntPtr enumerator, IntPtr hwnd, int flags);
  [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr devInfo, ref Guid cls, int index, ref IFACE data);
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref IFACE data, IntPtr detail, int size, out int required, ref DEVINFO info);
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool SetupDiGetDeviceRegistryProperty(IntPtr set, ref DEVINFO info, int prop, out int type, byte[] buf, int size, out int required);
  [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool DeviceIoControl(IntPtr h, uint code, byte[] inBuf, int inSize, IntPtr outBuf, int outSize, out int returned, IntPtr ov);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  static Guid KSCATEGORY_AUDIO = new Guid("6994AD04-93EF-11D0-A3CC-00A0C9223196");
  static Guid KSPROPSETID_BtAudio = new Guid("7FA06C40-B8F6-4C7E-8556-E8C33A12E54D");

  // name -> device paths (one headset has several: stereo and hands-free)
  public static Dictionary<string, List<string>> Devices() {
    var res = new Dictionary<string, List<string>>();
    Guid cls = KSCATEGORY_AUDIO;
    IntPtr set = SetupDiGetClassDevs(ref cls, IntPtr.Zero, IntPtr.Zero, 0x12); // DIGCF_PRESENT | DIGCF_DEVICEINTERFACE
    try {
      for (int i = 0; ; i++) {
        var iface = new IFACE(); iface.cbSize = Marshal.SizeOf(iface);
        if (!SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref cls, i, ref iface)) break;
        var info = new DEVINFO(); info.cbSize = Marshal.SizeOf(info);
        int need; SetupDiGetDeviceInterfaceDetail(set, ref iface, IntPtr.Zero, 0, out need, ref info);
        IntPtr buf = Marshal.AllocHGlobal(need);
        try {
          Marshal.WriteInt32(buf, IntPtr.Size == 8 ? 8 : 6);
          if (!SetupDiGetDeviceInterfaceDetail(set, ref iface, buf, need, out need, ref info)) continue;
          string path = Marshal.PtrToStringUni(new IntPtr(buf.ToInt64() + 4));
          string p = path.ToLowerInvariant();
          if (!(p.Contains("bthenum") || p.Contains("bthhfenum") || p.Contains("bthleenum"))) continue;
          string name = Prop(set, ref info, 0xC) ?? Prop(set, ref info, 0) ?? "Bluetooth-Gerät"; // FRIENDLYNAME, DEVICEDESC
          name = name.Replace(" Hands-Free AG Audio", "").Replace(" Hands-Free", "").Replace(" Stereo", "").Replace(" Avrcp Transport", "").Trim();
          if (!res.ContainsKey(name)) res[name] = new List<string>();
          res[name].Add(path);
        } finally { Marshal.FreeHGlobal(buf); }
      }
    } finally { SetupDiDestroyDeviceInfoList(set); }
    return res;
  }
  static string Prop(IntPtr set, ref DEVINFO info, int prop) {
    var b = new byte[1024]; int t, need;
    if (!SetupDiGetDeviceRegistryProperty(set, ref info, prop, out t, b, b.Length, out need)) return null;
    return Encoding.Unicode.GetString(b, 0, Math.Max(0, need - 2));
  }
  // id 0 = reconnect, 1 = disconnect
  public static bool Send(string path, int id) {
    IntPtr h = CreateFile(path, 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (h == new IntPtr(-1)) return false;
    try {
      var prop = new byte[24];
      Array.Copy(KSPROPSETID_BtAudio.ToByteArray(), prop, 16);
      BitConverter.GetBytes(id).CopyTo(prop, 16);
      BitConverter.GetBytes(1).CopyTo(prop, 20); // KSPROPERTY_TYPE_GET
      int ret;
      return DeviceIoControl(h, 0x2F0003, prop, prop.Length, IntPtr.Zero, 0, out ret, IntPtr.Zero); // IOCTL_KS_PROPERTY
    } finally { CloseHandle(h); }
  }
}
'@
$devs = [PimBt]::Devices()
if ($cmd -eq 'list') {
  ConvertTo-Json -Compress -InputObject @($devs.Keys | Sort-Object | ForEach-Object { [pscustomobject]@{ name = $_ } })
  exit 0
}
if (-not $devs.ContainsKey($name)) { throw "Gerät nicht gefunden: $name" }
$id = if ($cmd -eq 'disconnect') { 1 } else { 0 }
$ok = $false
foreach ($p in $devs[$name]) { if ([PimBt]::Send($p, $id)) { $ok = $true } }
if (-not $ok) { throw 'Windows hat abgelehnt. Ist Bluetooth an und das Gerät in der Nähe?' }
'{"ok":true}'
