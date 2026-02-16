@echo off
title Start Flotex
cd /d c:\software

start "Flotex Server" cmd /k "node server.js"
timeout /t 3 /nobreak >nul
start "Flotex App" cmd /k "npm run dev"

echo.
echo Two windows opened: one for the server, one for the app.
echo In your browser go to: http://localhost:3000
echo Close the two windows when you are done.
pause
