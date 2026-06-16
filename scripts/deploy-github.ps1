# Push source + deploy GitHub Pages via Actions
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$remote = 'https://github.com/JackyJCN/JCN-FINANCE.git'
if (-not (Test-Path '.git')) { git init | Out-Null }

git remote remove origin 2>$null
git remote add origin $remote

git add index.html css js lib scripts docs .github .nojekyll README.md .gitignore *.bat 2>$null

$msg = 'deploy ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
git -c user.name='JackyJCN' -c user.email='jackyjcn@users.noreply.github.com' commit -m $msg 2>$null

git branch -M main 2>$null
git -c user.name='JackyJCN' -c user.email='jackyjcn@users.noreply.github.com' push -u origin main --force 2>&1

Write-Host ''
Write-Host '[deploy] https://jackyjcn.github.io/JCN-FINANCE/'
Write-Host 'If blank: Settings -> Pages -> Source: GitHub Actions'
Write-Host ''
