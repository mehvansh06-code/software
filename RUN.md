# How to Run EXIM

## Quick start (both backend + frontend)

**Terminal 1 – Backend (API)**  
```bash
cd c:\software
node restart-server.js
```
Leave this running. It clears port 3001 if needed, then starts the API.

**Terminal 2 – Frontend (app)**  
```bash
cd c:\software
npm run dev
```
Leave this running. Opens at http://localhost:3000

---

## If you get "Port 3001 already in use"

**Option A – Use the restart script (recommended)**  
```bash
node restart-server.js
```
This frees port 3001 and starts the server.

**Option B – Free the port manually in PowerShell**  
```powershell
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
node server.js
```

---

## URLs

| What        | URL                          |
|------------|-------------------------------|
| **App**    | http://localhost:3000         |
| **API**    | http://localhost:3001         |
| **Network**| http://YOUR_LOCAL_IP:3000 (app) / :3001 (API) |

---

## Stopping

- In each terminal press **Ctrl+C** to stop that process.
- Stopping the backend (Ctrl+C) releases port 3001 so the next run works.

---

## Database backup and restore

### Create backup now

Option 1 (recommended for you): double-click `Backup-Now.bat`

Option 2 (terminal):
```bash
cd c:\software
npm run backup:db
```

Backups are stored in:
`c:\software\backups`

### Restore from backup

Important: stop backend first before restore.

Option 1 (recommended for you): double-click `Restore-Database.bat` and enter backup file path.

Option 2 (terminal):
```bash
cd c:\software
set RESTORE_CONFIRM=YES && npm run restore:db -- --file backups\ledger-YYYY-MM-DD_HH-mm-ss.db
```

Notes:
- Restore script makes a safety copy before replacing database.
- After restore, start backend again.

### Automatic daily backup (Windows Task Scheduler)

1. Right-click `Setup-Daily-Backup-Task.bat` and Run as Administrator.
2. Enter time in `HH:MM` (24-hour format). Example: `23:00`.
3. Task name created: `EXIM_Daily_DB_Backup`.

To remove this scheduler:
- Run `Remove-Daily-Backup-Task.bat` as Administrator.
