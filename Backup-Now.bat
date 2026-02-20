@echo off
cd /d "%~dp0"
echo Creating database backup...
node scripts\backup-db.js
if errorlevel 1 (
  echo Backup failed.
  pause
  exit /b 1
)
echo Backup completed.
pause

