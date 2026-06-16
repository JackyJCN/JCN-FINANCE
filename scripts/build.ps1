# Build standalone index.html for GitHub Pages (output: dist/)
param([switch]$Lite)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root 'dist'
$OutFile = Join-Path $OutDir 'index.html'
$SrcHtml = Join-Path $Root 'index.html'

if (-not (Test-Path $SrcHtml)) { throw 'index.html not found' }
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null

$html = [IO.File]::ReadAllText($SrcHtml, [Text.Encoding]::UTF8)
$html = [regex]::Replace($html, '(?s)\s*<script>\s*\(function \(\) \{\s*var path = location\.pathname.*?\}\)\(\);\s*</script>\s*', "`r`n")

$buildTag = Get-Date -Format 'yyyyMMdd-HHmm'
$html = $html -replace '(<meta name="viewport"[^>]*>)', "`$1`r`n  <meta name=`"dashboard-build`" content=`"$buildTag`">"

$css = [IO.File]::ReadAllText((Join-Path $Root 'css\dashboard.css'), [Text.Encoding]::UTF8)
$html = [regex]::Replace($html, '<link rel="stylesheet" href="css/dashboard\.css(?:\?[^"]*)?">', "<style>`r`n$css`r`n</style>")

if ($Lite) {
  $jsFiles = @('js\config.js','js\filter-ui.js','js\parser.js','js\analytics.js','js\charts.js','js\ai-insights.js','js\app.js')
  $inlineJs = @(
    '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script>'
  )
} else {
  $jsFiles = @('lib\xlsx.full.min.js','lib\echarts.min.js','js\config.js','js\filter-ui.js','js\parser.js','js\analytics.js','js\charts.js','js\ai-insights.js','js\app.js')
  $inlineJs = @()
}

function Sanitize-InlineJs([string]$Code) {
  $Code = $Code -replace '(?i)</script', '<\/script'
  $Code = $Code -replace '(?i)</style', '<\/style'
  $Code = $Code -replace '(?i)</head', '<\/head'
  $Code = $Code -replace '(?i)<body', '<\body'
  return $Code
}

foreach ($f in $jsFiles) {
  $path = Join-Path $Root $f
  if (-not (Test-Path $path)) { throw "Missing: $f" }
  $code = Sanitize-InlineJs ([IO.File]::ReadAllText($path, [Text.Encoding]::UTF8))
  $inlineJs += "<script>`r`n$code`r`n</script>"
}

$pattern = '(?s)\s*<script src="lib/xlsx\.full\.min\.js(?:\?[^"]*)?"></script>.*?<script src="js/app\.js(?:\?[^"]*)?"></script>\s*'
$replacement = "`r`n$(($inlineJs -join "`r`n"))`r`n"
$html = (New-Object System.Text.RegularExpressions.Regex($pattern)).Replace($html, $replacement, 1)
[IO.File]::WriteAllText($OutFile, $html, [Text.UTF8Encoding]::new($false))
'' | Set-Content (Join-Path $OutDir '.nojekyll') -Encoding ascii

Write-Host "[build] dist/index.html $([math]::Round((Get-Item $OutFile).Length/1KB,1)) KB ($buildTag)"
