# Pim system bridge. One long-lived PowerShell process, one JSON line per tick:
#   media     Windows media session (SMTC: Spotify, Apple Music, browsers, VLC, ...)
#   vol/muted master volume of the default output device (Core Audio)
#   busy      a fullscreen game, fullscreen video or presentation is in front (game mode)
#   clipSeq   clipboard sequence number, so Electron reads the clipboard only when it changed
# Commands on stdin: toggle | next | prev | vol <0..1> | mute <0|1>
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int _RegisterControlChangeNotify(); int _UnregisterControlChangeNotify(); int _GetChannelCount(); int _SetMasterVolumeLevel();
  int SetMasterVolumeLevelScalar(float level, Guid ctx);
  int _GetMasterVolumeLevel();
  int GetMasterVolumeLevelScalar(out float level);
  int _SetChannelVolumeLevel(); int _SetChannelVolumeLevelScalar(); int _GetChannelVolumeLevel(); int _GetChannelVolumeLevelScalar();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
  int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int _EnumAudioEndpoints(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

public static class PimSys {
  static IAudioEndpointVolume Endpoint() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out dev)); // eRender, eMultimedia
    var iid = typeof(IAudioEndpointVolume).GUID; IAudioEndpointVolume v;
    Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out v)); // CLSCTX_ALL
    return v;
  }
  public static float GetVolume() { float v; Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void SetVolume(float v) { Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), Guid.Empty)); }
  public static bool GetMute() { bool m; Marshal.ThrowExceptionForHR(Endpoint().GetMute(out m)); return m; }
  public static void SetMute(bool m) { Marshal.ThrowExceptionForHR(Endpoint().SetMute(m, Guid.Empty)); }

  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  // 2 = busy (fullscreen app), 3 = Direct3D fullscreen game, 4 = presentation mode
  public static bool Busy() { int s; return SHQueryUserNotificationState(out s) == 0 && (s == 2 || s == 3 || s == 4); }

  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
}
'@

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$stdin = [Console]::In
$read = $stdin.ReadLineAsync()
$lastKey = ''
$cover = $null
$sendCover = $false

while ($true) {
  if ($read.IsCompleted) {
    $cmd = $read.Result
    if ($null -eq $cmd) { exit 0 } # Electron closed the pipe
    $parts = $cmd.Trim() -split ' '
    try {
      switch ($parts[0]) {
        'vol' { [PimSys]::SetVolume([float]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture)) }
        'mute' { [PimSys]::SetMute($parts[1] -eq '1') }
        default {
          $s = $mgr.GetCurrentSession()
          if ($s) {
            switch ($parts[0]) {
              'toggle' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
              'next' { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
              'prev' { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
            }
          }
        }
      }
    } catch {}
    $read = $stdin.ReadLineAsync()
  }

  $media = @{ active = $false }
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $info = $s.GetPlaybackInfo()
      $tl = $s.GetTimelineProperties()
      $key = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) {
        $lastKey = $key
        $cover = $null
        $sendCover = $true # cover goes out once per track, not every tick
        if ($p.Thumbnail) {
          try {
            $stream = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            $ms = New-Object IO.MemoryStream
            [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream).CopyTo($ms)
            $cover = 'data:image/png;base64,' + [Convert]::ToBase64String($ms.ToArray())
          } catch {}
        }
      }
      $media = @{
        active   = $true
        app      = $s.SourceAppUserModelId
        title    = $p.Title
        artist   = $p.Artist
        album    = $p.AlbumTitle
        playing  = ($info.PlaybackStatus.ToString() -eq 'Playing')
        position = $tl.Position.TotalSeconds
        duration = $tl.EndTime.TotalSeconds
        updated  = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
        key      = $key
      }
      if ($sendCover) { $media.cover = $cover; $sendCover = $false }
    }
  } catch { $media = @{ active = $false; error = $_.Exception.Message } }

  $out = @{ media = $media; clipSeq = [PimSys]::GetClipboardSequenceNumber(); busy = [PimSys]::Busy() }
  try { $out.vol = [math]::Round([PimSys]::GetVolume(), 3); $out.muted = [PimSys]::GetMute() } catch {} # no output device

  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
  $null = $read.Wait(500) # wakes early when a command arrives
}
