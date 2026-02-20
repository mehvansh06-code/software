@echo off
setlocal
cd /d "%~dp0"

set "TASK_NAME=EXIM_Daily_DB_Backup"
set "NODE_EXE=node"
set "BACKUP_CMD=cd /d \"%~dp0\" && \"%NODE_EXE%\" scripts\\backup-db.js"

echo ---------------------------------------------
echo EXIM Daily Backup Task Setup
echo Task name: %TASK_NAME%
echo ---------------------------------------------
echo.
set /p RUN_TIME=Enter daily backup time (24h format, HH:MM) [default 23:00]:
if "%RUN_TIME%"=="" set "RUN_TIME=23:00"

schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if %errorlevel%==0 (
  echo Existing task found. Recreating...
  schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1
)

schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /SC DAILY ^
  /ST %RUN_TIME% ^
  /RL HIGHEST ^
  /F ^
  /TR "cmd /c %BACKUP_CMD%"

if errorlevel 1 (
  echo.
  echo Failed to create scheduled task.
  echo Run this file as Administrator and try again.
  pause
  exit /b 1
)

echo.
echo Task created successfully.
echo It will run daily at %RUN_TIME%.
echo.
schtasks /Query /TN "%TASK_NAME%" /V /FO LIST
echo.
pause
exit /b 0

