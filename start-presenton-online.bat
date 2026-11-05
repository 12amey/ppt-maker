@echo off
title Presenton Online Launcher
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0start-presenton-online.ps1"
pause
