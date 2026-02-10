@echo off
title Gujarat Flotex - Backend Server
cd /d "%~dp0"
echo Restarting backend (port 3001)...
call npm run restart
pause
