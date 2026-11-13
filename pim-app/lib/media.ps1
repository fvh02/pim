# Pim media bridge. Reads the Windows media session (SMTC: Spotify, Apple Music, browsers, VLC, ...)
# and prints one JSON line per second. Reads commands from stdin: toggle | next | prev.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

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

while ($true) {
  if ($read.IsCompleted) {
    $cmd = $read.Result
    if ($null -eq $cmd) { exit 0 } # Electron closed the pipe
    $s = $mgr.GetCurrentSession()
    if ($s) {
      try {
        switch ($cmd.Trim()) {
          'toggle' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
          'next' { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
          'prev' { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
        }
      } catch {}
    }
    $read = $stdin.ReadLineAsync()
  }

  $out = @{ active = $false }
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
      $out = @{
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
      if ($sendCover) { $out.cover = $cover; $sendCover = $false }
    }
  } catch { $out = @{ active = $false; error = $_.Exception.Message } }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  $null = $read.Wait(700) # wakes early when a command arrives
}
