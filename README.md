<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/10uI-yfNcRoDtZgiOsvxKI0qMx5pR5W7x

## Moving to a new PC

- **Paths:** The `.reg` files and scripts in this repo are set for **`c:\software`**. If you unzip the project elsewhere, edit `client-setup/setup.reg`, `client-setup/register-protocol.reg`, and `scripts/allow-network-access.ps1` with your project path.
- **Node:** Use Node 18 or 20 LTS so `better-sqlite3` can use prebuilt binaries. After `npm install`, if the server fails with `NODE_MODULE_VERSION`, install [Node 20 LTS](https://nodejs.org/), remove `node_modules`, run `npm install` again, then `npm start` and `npm run dev`.

## Run Locally

**Prerequisites:**  Node.js **18 or 20 LTS** (recommended). The app uses `better-sqlite3`, which ships prebuilt binaries for Node 18–22. If you use Node 24+, run `npm rebuild better-sqlite3` and ensure **Visual Studio Build Tools** (Desktop development with C++) is installed, or switch to Node 20 LTS.


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Client Setup (Open Folder on Your PC)

The **Open Folder** button uses a custom URL protocol (`flotex-open://`) so the folder opens in File Explorer on the user’s local PC using the network path (e.g. `\\THIS_PC_NAME\Import Shipment Documents\...`). Each user must set up their Windows PC once.

### 1. Create folder and script (this PC)

- On this PC the project is at **`c:\software`**. The script is at **`c:\software\client-setup\opener.ps1`**; the provided `.reg` files point to it.
- To use a different folder, create **`C:\Flotex`** and copy `client-setup/opener.ps1` there as **`C:\Flotex\opener.ps1`**, then edit the `.reg` to use `C:\\Flotex\\opener.ps1`. Script content:

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
- This registers the `flotex-open` protocol and points it at `c:\software\client-setup\opener.ps1` (on this PC).

### Result

- Clicking **Open Folder** in the app will open the shipment documents folder on the user’s machine.
- If the protocol is not installed or the folder doesn’t open, the app shows a message and copies the path to the clipboard for manual pasting in Explorer or Run.
