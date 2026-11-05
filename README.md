# EyeNav

Real-time eye tracking and voice-controlled web browsing with automated test script generation. A Chrome extension plus a Python backend that fuses gaze (Tobii Pro SDK) and on-device speech recognition (Vosk), and records interactions as Gherkin scenarios that replay with Kraken + WebdriverIO.

Supported on **macOS** and **Windows**.

## Requirements

| | Version | Notes |
|---|---|---|
| Python | **3.10** | `tobii-research 2.1.0` only ships wheels for 3.10 |
| Google Chrome | 114+ | Side panel API |
| Node.js | 18+ | For the clean environment (recording and replay), the extension unit tests and Kraken replay |
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

These recordings are gitignored and not backed up anywhere, so a deleted one is gone for good. Copy the ones you want to keep into `testing/features/` (`testing/copy.sh`). Set `EYENAV_DATA_DIR=<folder>` before starting the backend to keep `test_sessions/`, `events/` and `transcriptions/` somewhere else.

### Recording in a clean environment

A recording made in your everyday Chrome depends on that profile: signed-in accounts, cookies, history, cache and other extensions all change what the page shows. Kraken replays in an empty browser, so it gets a different page and the steps stop matching. For recordings that replay reliably, record in the clean environment instead: Playwright's bundled Chromium (the same build every time, pinned by `environment/package.json`), a brand-new empty profile with only EyeNav loaded, opened straight on the page the scenario starts from.

Install it once, from `environment/` (downloads Playwright's Chromium to `~/Library/Caches/ms-playwright`, or `%USERPROFILE%\AppData\Local\ms-playwright` on Windows):

```bash
npm install
```

Then, with the backend running, from `environment/`:

```bash
npm run record -- https://example.com
```

Open EyeNav from the Extensions (puzzle piece) icon in that window, choose a mode and press **Play**; press **Stop** when done and close the window (or press Ctrl+C in the terminal). The profile is deleted when the window closes, so every recording starts from the same state. The command refuses to start if the backend is not running or a session is already recording.

Window size, language and timezone are set in `environment/environment.json`.

### Voice commands and the browser

Back/forward use Chrome's own shortcuts for each OS: <kbd>Cmd</kbd>+<kbd>[</kbd> / <kbd>Cmd</kbd>+<kbd>]</kbd> on macOS, <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>Alt</kbd>+<kbd>→</kbd> on Windows. Dictated text is pasted with <kbd>Cmd</kbd>+<kbd>V</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd>.

### Click locators

Locators are built in `extension/locator.js` to survive the page being loaded again: widgets injecting elements, lists rendering in another order, ids generated at runtime.

- A click on something inside a link or button (a `<span>`, an `<img>`, an icon) is recorded as a click on that link or button.
- A click on a `<label>` is one step: the click the browser then passes on to its checkbox, radio or field is not recorded again (replaying both would tick and untick a checkbox).
- Click steps target, in order of priority: `href`, `id`, then an XPath. The `href` and `id` are only used if the replay's own lookup (the first `a[href="…"]`, or `#id`) lands on that element.
- The XPath is the first of these that matches only that element on the page: a test id (`data-testid`, `data-test`, `data-cy`, …), the element's `id`, `name`, `aria-label`, `placeholder`, `title`, `alt`, a link's `href`, a link's or button's visible text; then a short path from the nearest ancestor that has a test id or `id`; and only as a last resort the absolute path from `/html`.
- Ids that look generated at runtime (`:r1:`, `skip-button:2`, `ember1234`, `edit-submit--2`, hashes) are never used.
- A click inside an open shadow root (cookie banners such as Usercentrics, web components) is recorded with a CSS selector, which the replay looks up through every shadow root (WebdriverIO's `>>>`): the element's own test id, `id`, `name`, `aria-label`, … or, when it has none (the text of a banner), the nearest ancestor that has one followed by the positions down to the element, such as `div[data-testid="uc-message-container"] > div:nth-child(1) > p:nth-child(1)`. Only if nothing up to the shadow host has one is the click recorded on the host.

Every click is preceded by a step that scrolls the element into view.

### What gets recorded from the page

| Interaction | Step in the `.feature` |
|---|---|
| Click | `I scroll until I can see the element with xpath "…"`, then `I click on tag with href/id/xpath "…"` |
| Click inside a shadow root | `I scroll until I can see the element with shadow selector "…"`, then `I click on tag with shadow selector "…"` |
| Text typed into a field, or into a `contenteditable` region (read when focus leaves it, or before a click elsewhere while the field keeps focus, as when picking a search suggestion) | `I type "…" into field with xpath "…"` |
| Enter pressed in a single-line text field | `I hit enter`, after the field's text |
| The browser's Back or Forward, however it is asked for (toolbar buttons, trackpad swipe, mouse side buttons, keyboard shortcuts, the Back button's list) and from any page, a PDF included; one step per page moved. A page's own "Back" button that calls `history.back()` is recorded only as its click | `I go back` / `I go forward` |
| Option chosen in a `<select>` | `I select "Option text" in the dropdown with xpath "…"` |
| Window resize | `I set the viewport to WxH` |
| Scroll of the page, or of one scrollable element | `I scroll the page to X,Y` / `I scroll the element with xpath "…" to X,Y` |
| HTML5 drag-and-drop of one element onto another | `I drag the element with xpath "…" onto the element with xpath "…"` |

Voice commands that act through the browser are recorded once. In the mode that combines voice with mouse and keyboard the page reports them too, and that report is not recorded again: the Enter or Back/Forward that follows `enter`, `back` or `forward` within 3 seconds, and the field text that matches the last dictation, whenever the field is left.

Scrolls and resizes are reported once the gesture has settled (about 300-400 ms without a new event), so a long scroll is one step with its final position, and they are always written before the click or edit that follows them.

What is not recorded: a click on the bare page background (on `<body>` itself, no element of it), since there is nothing to point the replay at; the browser's other controls (reload, the address bar, switching tabs); keys other than Enter (what was typed is read from the field); password fields; a `<select multiple>` (its change event only carries the final selection); a browser zoom (it is not a window resize); the scrolling a text field does while you type; a drop of a file from the desktop; drags driven by mouse events instead of the HTML5 drag API (many sortable-list libraries); and `contenteditable` regions inside an iframe.

Voice commands `scroll down` / `scroll up` replay as a scroll of 400 px, since only the direction is recorded.

## Replaying with Kraken

From `testing/`:

```bash
npm install
```

`npm install` also applies the EyeNav patches in `patches/` to `kraken-node` and to `devtools` (WebdriverIO's DevTools driver). Web replay runs in the clean environment's browser, so it also needs `npm install` in `environment/` (see [Recording in a clean environment](#recording-in-a-clean-environment)). Copy recorded scenarios into `features/` (`./copy.sh` on macOS, or copy `backend/test_sessions/*.feature` by hand on Windows). Mobile replay additionally needs Appium, the Android SDK and the APK details in `testing/mobile.json`.

Then run every `.feature` directly inside `features/` (subfolders are not run):

```bash
npx kraken-node run
```

A recording and its replay see the same page: Kraken opens the same Chromium build the recording environment uses, with a new empty profile and no extensions, resizes its window so the page is exactly the recorded size (at the screen's own pixel density, as when recording), and applies the language and timezone from `environment/environment.json` the same way Playwright does when recording.

Opening a page, going back and going forward, and every step after a click that loads another page, wait for the page's document to be ready (up to 25 s), not for every ad, video or analytics script to finish loading: on a slow site that took longer than a step is given, and a page that never finished loading also kept the browser from closing.

Each step waits up to 15 s for its element to exist and be visible. Visible means what Playwright means by it: the element takes up space and is not `visibility: hidden`. A transparent element (`opacity: 0`) counts as visible, since it still takes the click: a carousel's arrows before the mouse is over it, an open accordion's indicator, the real input under a styled checkbox.

## Tests

Backend (no microphone, Vosk model or eye tracker needed), from `backend/`:

```bash
venv/bin/python3 -m unittest discover -s tests -t .
```

On Windows use `venv\Scripts\python -m unittest discover -s tests -t .`

The tests record into a temporary directory that is removed when the run ends (the suite points `EYENAV_DATA_DIR` at it), so running them never creates, changes or deletes anything in your real `backend/test_sessions/`, `events/` or `transcriptions/`. `tests/__init__.py` refuses to run if `settings` was imported before that redirect.

Extension logic, from the repository root:

```bash
node --test testing/unit/*.test.js
```

`locator.test.js` checks the click locators on real pages in the Chromium of the clean recording environment, so it needs `npm install` in `environment/` and `testing/`; without them it is skipped.

## Platform notes

- Recordings hold what the user typed and dictated. On macOS the backend makes `test_sessions/`, `transcriptions/` and `events/` owner-only (`0700`/`0600`). Windows ignores these POSIX modes, so the files get the default permissions of your user profile folder.
- `cleanup.sh` permanently deletes `test_sessions/` and `transcriptions/`. It shows how many files that is and only continues if you type `delete`; it does nothing when there is no terminal to answer.
- `cleanup.sh`, `copy-commands.sh` and `testing/copy.sh` are Bash scripts; on Windows use Git Bash, WSL, or the PowerShell equivalents above.
