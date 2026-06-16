# Local static server (PowerShell only, no install required)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Port = if ($env:PORT) { [int]$env:PORT } else { 8765 }

$Mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.js'='application/javascript; charset=utf-8'; '.json'='application/json'
  '.xlsx'='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  '.xls'='application/vnd.ms-excel'; '.md'='text/markdown; charset=utf-8'
}

function Get-FreePort([int]$Start) {
  for ($p = $Start; $p -lt $Start + 20; $p++) {
    $l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $p)
    try { $l.Start(); $l.Stop(); return $p } catch { try { $l.Stop() } catch {} }
  }
  throw "No free port from $Start"
}

function Send($ctx, [byte[]]$b, [string]$t, [int]$s=200) {
  $r = $ctx.Response; $r.StatusCode = $s; $r.ContentType = $t
  $r.Headers.Add('Cache-Control','no-cache'); $r.ContentLength64 = $b.Length
  $r.OutputStream.Write($b,0,$b.Length); $r.OutputStream.Close()
}

$Port = Get-FreePort $Port
$Url = "http://127.0.0.1:$Port/"
Write-Host "`n  Dashboard: $Url`n  Ctrl+C to stop`n"
Start-Process $Url
$Http = New-Object Net.HttpListener
$Http.Prefixes.Add($Url); $Http.Start()
try {
  while ($Http.IsListening) {
    $ctx = $Http.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
      if ($path -eq '/') { $path = '/index.html' }
      $file = [IO.Path]::GetFullPath([IO.Path]::Combine($Root, $path.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)))
      if (-not $file.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { Send $ctx ([Text.Encoding]::UTF8.GetBytes('Forbidden')) 'text/plain' 403; continue }
      if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Send $ctx ([Text.Encoding]::UTF8.GetBytes('Not Found')) 'text/plain' 404; continue }
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $type = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
      Send $ctx ([IO.File]::ReadAllBytes($file)) $type
    } catch { try { Send $ctx ([Text.Encoding]::UTF8.GetBytes('Error')) 'text/plain' 500 } catch {} }
  }
} finally { $Http.Stop(); $Http.Close() }
