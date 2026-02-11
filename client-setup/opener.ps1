# Flotex Open Folder - Custom URL protocol handler
# Accepts one argument: the full URL (e.g. flotex-open://\\Server\Share\Path or flotex-open://C:\Folder With Spaces)
# Robust against spaces and special characters.

param([string]$Uri = $args[0])

if (-not $Uri -or $Uri -eq '') {
  exit 1
}

# Strip the "flotex-open://" prefix and any trailing slashes added by the browser
$path = $Uri -replace '^flotex-open://', '' -replace '/+$', ''

# Use [System.Uri]::UnescapeDataString to fix spaces (%20) and other encoded characters
try {
  $path = [System.Uri]::UnescapeDataString($path)
} catch {
  $path = $path -replace '%20', ' ' -replace '%5C', '\' -replace '%2F', '/'
}

# Normalize to Windows backslashes and trim
$path = ($path -replace '/', '\').Trim()
if (-not $path) { exit 1 }

# Check if the path exists (folder or file)
if (-not (Test-Path -LiteralPath $path)) {
  exit 1
}

# Open in Explorer (quoted path for robustness with spaces and special characters)
Invoke-Item -LiteralPath $path
