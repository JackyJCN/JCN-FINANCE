@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Deploying to GitHub Pages...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-github.ps1"
echo.
pause
