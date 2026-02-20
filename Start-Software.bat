@echo off
setlocal
title Start EXIM Software

set "ROOT=%~dp0"
cd /d "%ROOT%"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or not in PATH.
  pause
  exit /b 1
)

echo Cleaning old processes on ports 3000 and 3001...
for %%P in (3000 3001) do (
  for /f "tokens=5" %%A in ('netstat -aon ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /F /PID %%A >nul 2>nul
  )
)

echo Starting backend on http://localhost:3001 ...
start "EXIM Backend (3001)" /D "%ROOT%" cmd /k "node server.js"

echo Waiting for backend to become ready...
set "BACKEND_READY="
for /L %%I in (1,1,45) do (
  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3001/api/status' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "BACKEND_READY=1"
    goto :backend_ready
  )
  timeout /t 1 /nobreak >nul
)

:backend_ready
if not defined BACKEND_READY (
  echo Backend did not start in time.
  echo Check the "EXIM Backend (3001)" window for the real error.
  echo Frontend not started.
  pause
  exit /b 1
)

echo Starting frontend on http://localhost:3000 ...
start "EXIM Frontend (3000)" /D "%ROOT%" cmd /k "npm.cmd run dev -- --host 127.0.0.1 --port 3000"

timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo Software started.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:3000
echo.
echo Close both opened command windows to stop the software.
pause
