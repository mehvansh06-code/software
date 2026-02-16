@echo off
REM Allow other PCs to connect to the app (3000) and API (3001).
REM Double-click runs this; UAC will ask for admin once.

NET SESSION >nul 2>&1
if %errorLevel% == 0 ( goto runRules ) else ( goto askAdmin )

:askAdmin
echo Requesting administrator rights...
powershell -Command "Start-Process '%~f0' -Verb RunAs"
exit /b

:runRules
cd /d "%~dp0"
netsh advfirewall firewall delete rule name="Flotex App (Vite 3000)" >nul 2>&1
netsh advfirewall firewall delete rule name="Flotex API (Node 3001)" >nul 2>&1
netsh advfirewall firewall add rule name="Flotex App (Vite 3000)" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="Flotex API (Node 3001)" dir=in action=allow protocol=TCP localport=3001
echo.
echo Done. Other PCs can reach this machine at http://THIS_PC_IP:3000 and :3001 (replace THIS_PC_IP with this PC's IP address)
echo.
pause
