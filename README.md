<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/10uI-yfNcRoDtZgiOsvxKI0qMx5pR5W7x

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Client Setup (Open Folder on Your PC)

The **Open Folder** button uses a custom URL protocol (`flotex-open://`) so the folder opens in File Explorer on the user’s local PC using the network path (e.g. `\\LAPTOP-RMPRPKLJ\Import Shipment Documents\...`). Each user must set up their Windows PC once.

### 1. Create folder and script

- Create the folder: **`C:\Flotex`**
- Create a file **`C:\Flotex\opener.ps1`** with the following content (or copy from `client-setup/opener.ps1` in this repo):

```powershell
# Flotex Open Folder - Custom URL protocol handler
# Accepts one argument: the full URL (e.g. flotex-open://\\Server\Share\Path)
param([string]$Uri = $args[0])

if (-not $Uri -or $Uri -eq '') { exit 1 }

$path = $Uri -replace '^flotex-open://', '' -replace '/+$', ''
try { $path = [System.Uri]::UnescapeDataString($path) }
catch { $path = $path -replace '%20', ' ' -replace '%5C', '\' -replace '%2F', '/' }

$path = ($path -replace '/', '\').Trim()
if (-not $path) { exit 1 }
if (-not (Test-Path -LiteralPath $path)) { exit 1 }

Invoke-Item -LiteralPath $path
```

### 2. Register the protocol

- Double-click **`client-setup/setup.reg`** (or `client-setup/register-protocol.reg`) to merge it into the Windows Registry.
- When Windows prompts, confirm to allow the merge.
- This registers the `flotex-open` protocol and points it at `C:\Flotex\opener.ps1`.

### Result

- Clicking **Open Folder** in the app will open the shipment documents folder on the user’s machine.
- If the protocol is not installed or the folder doesn’t open, the app shows a message and copies the path to the clipboard for manual pasting in Explorer or Run.
