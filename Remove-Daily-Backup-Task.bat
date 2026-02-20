@echo off
setlocal

set "TASK_NAME=EXIM_Daily_DB_Backup"

echo Removing task: %TASK_NAME%
schtasks /Delete /TN "%TASK_NAME%" /F

if errorlevel 1 (
  echo Task not found or could not be removed.
  pause
  exit /b 1
)

echo Task removed.
pause
exit /b 0

