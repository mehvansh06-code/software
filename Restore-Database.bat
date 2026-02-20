@echo off
cd /d "%~dp0"
echo WARNING: Make sure backend server is stopped before restore.
set /p BKP=Enter backup file path (e.g. backups\ledger-2026-02-20_10-30-00.db): 
if "%BKP%"=="" (
  echo No file entered.
  pause
  exit /b 1
)
set RESTORE_CONFIRM=YES
node scripts\restore-db.js --file "%BKP%"
if errorlevel 1 (
  echo Restore failed.
  pause
  exit /b 1
)
echo Restore completed.
pause

