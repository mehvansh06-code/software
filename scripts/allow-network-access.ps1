# Run this script as Administrator on the laptop (where Node + Vite run) to allow other PCs on the network to connect.
# Right-click PowerShell -> Run as Administrator, then: cd D:\software\scripts; .\allow-network-access.ps1

$ports = @(3000, 3001)
foreach ($port in $ports) {
  $name = "Flotex Port $port"
  $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Rule '$name' already exists."
  } else {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow
    Write-Host "Added firewall rule: $name (TCP $port)"
  }
}
Write-Host "Done. Other PCs can now reach this machine on ports 3000 (app) and 3001 (API)."
