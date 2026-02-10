#!/usr/bin/env node
/**
 * Kills any process on port 3001, then starts the backend.
 * Run: node restart-server.js
 */
const { execSync, spawn } = require('child_process');
const path = require('path');

const PORT = 3001;

function killPort() {
  try {
    if (process.platform === 'win32') {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 1"`,
        { stdio: 'inherit', cwd: path.join(__dirname) }
      );
    } else {
      execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'inherit' });
    }
  } catch (_) {}
}

killPort();
const child = spawn(process.execPath, ['server.js'], {
  stdio: 'inherit',
  cwd: __dirname
});
child.on('exit', (code) => process.exit(code));
