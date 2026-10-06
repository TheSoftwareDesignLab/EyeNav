# EyeNav

Real-time eye tracking and voice-controlled web browsing with automated test script generation. A Chrome extension plus a Python backend that fuses gaze (Tobii Pro SDK) and on-device speech recognition (Vosk), and records interactions as Gherkin scenarios that replay with Kraken + WebdriverIO.

Supported on **macOS** and **Windows**.

## Requirements

| | Version | Notes |
|---|---|---|
| Python | **3.10** | `tobii-research 2.1.0` only ships wheels for 3.10 |
| Google Chrome | 114+ | Side panel API |
| Node.js | 18+ | Only for the extension unit tests and Kraken replay |
| Java JDK | 17 | Only for Kraken replay |
| Tobii eye tracker | — | Optional: voice control and recording work without it |
| Microphone | — | For voice commands |

## Installation

### 1. Clone

```bash
git clone https://github.com/TheSoftwareDesignLab/EyeNav.git
cd EyeNav
```

### 2. Backend

From `backend/`:

**macOS**
```bash
python3.10 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Windows (PowerShell)**
```powershell
py -3.10 -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The macOS-only packages in `requirements.txt` (`pyobjc-*`, `rubicon-objc`) are skipped automatically on Windows.

The Vosk speech models (English and Spanish) download themselves to `~/.cache/vosk/` the first time voice control starts, so that first run needs internet access.

### 3. Voice commands

`commands.json` at the repository root is the source of truth; copy it into the extension and the backend after editing it:

**macOS**
```bash
./copy-commands.sh
```

**Windows (PowerShell)**
```powershell
Copy-Item commands.json extension\commands.json
Copy-Item commands.json backend\commands.json
```

### 4. Chrome extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `extension/`
4. Check that the extension id is `ineabieboinnonmihnblhngmfhbdilkl` (fixed by the `key` in `manifest.json`). The backend only accepts requests from that id; if yours differs, set `EYENAV_EXTENSION_ID=<your-id>` before starting the backend (`$env:EYENAV_EXTENSION_ID="<your-id>"` in PowerShell).

## Usage

Start the backend from the repository root (with the venv active):

```bash
python backend/main.py
```

It serves HTTP on `127.0.0.1:5001` and WebSocket on `localhost:5002`.

**OS permissions (first run)**
- macOS: *System Settings → Privacy & Security* — allow your terminal **Microphone** and **Accessibility** (the backend moves the cursor).
- Windows: *Settings → Privacy & security → Microphone* — turn on **Let desktop apps access your microphone**.

Then open any web page, open EyeNav from its toolbar icon (popup or side panel), choose a mode and press **Play**. A session only starts on Play.

Recorded scenarios are written to `backend/test_sessions/` as `.feature` files.

### Voice commands and the browser

Back/forward use Chrome's own shortcuts for each OS: <kbd>Cmd</kbd>+<kbd>[</kbd> / <kbd>Cmd</kbd>+<kbd>]</kbd> on macOS, <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd> on Windows. Dictated text is pasted with <kbd>Cmd</kbd>+<kbd>V</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd>.

### Click locators

Generated click steps target, in order of priority: `href`, `id`, then a computed XPath. Every click is preceded by a step that scrolls the element into view.

## Replaying with Kraken

From `testing/`:

```bash
npm install
```

`npm install` also applies the EyeNav patch in `patches/` to `kraken-node`. Copy recorded scenarios into `features/` (`./copy.sh` on macOS, or copy `backend/test_sessions/*.feature` by hand on Windows). Mobile replay additionally needs Appium, the Android SDK and the APK details in `testing/mobile.json`.

## Tests

Backend (no microphone, Vosk model or eye tracker needed), from `backend/`:

```bash
venv/bin/python3 -m unittest discover -s tests -t .
```

On Windows use `venv\Scripts\python -m unittest discover -s tests -t .`

Extension logic, from the repository root:

```bash
node --test testing/unit
```

## Platform notes

- Recordings hold what the user typed and dictated. On macOS the backend makes `test_sessions/`, `transcriptions/` and `events/` owner-only (`0700`/`0600`). Windows ignores these POSIX modes, so the files get the default permissions of your user profile folder.
- `cleanup.sh`, `copy-commands.sh` and `testing/copy.sh` are Bash scripts; on Windows use Git Bash, WSL, or the PowerShell equivalents above.
