@echo off
title Stop Presenton
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0stop-all-servers.ps1"
timeout /t 3
