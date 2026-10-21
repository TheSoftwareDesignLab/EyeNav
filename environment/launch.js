/**
 * What the clean recording environment is made of, kept apart from
 * record.js (which launches it) so it can be unit tested without a browser.
 *
 * A recording made in the user's everyday Chrome depends on that profile:
 * signed-in accounts, cookies, history, cached content, A/B buckets and
 * whatever other extensions rewrite the page. Kraken replays in an empty
 * browser, so the page it gets is not the page that was recorded, and the
 * steps stop matching. Recording in a browser that starts from nothing every
 * time, like the replay does, removes that difference:
 *  - Playwright's bundled Chromium, pinned through the exact Playwright
 *    version in package.json, so every recording uses the same build;
 *  - a brand-new, empty profile per run (record.js deletes it afterwards);
 *  - no extension other than EyeNav;
 *  - the window size, language and timezone from environment.json.
 */
const fs = require('node:fs');
const path = require('node:path');

const EXTENSION_DIR = path.join(__dirname, '..', 'extension');

// Fixed by manifest.json's "key". The backend only accepts requests from this
// id (backend/security.py), and honours the same override.
const EXTENSION_ID = process.env.EYENAV_EXTENSION_ID || 'ineabieboinnonmihnblhngmfhbdilkl';

// 127.0.0.1, not localhost: the backend binds IPv4 only, and Node resolves
// localhost to ::1 first.
const BACKEND_STATUS_URL = 'http://127.0.0.1:5001/status';

const CONFIG_PATH = path.join(__dirname, 'environment.json');

const USAGE = 'Usage: npm run record -- <url>   (for example: npm run record -- https://example.com)';

/**
 * The page the recording starts on, from the command line.
 * @param {string|undefined} value
 * @returns {string} the normalized URL
 */
function parseTargetUrl(value) {
    if (!value) throw new Error(USAGE);
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`Not a valid URL: ${value}\n${USAGE}`);
    }
    // content.js only runs on web pages, so nothing else would record anything.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Only http and https pages can be recorded: ${value}`);
    }
    return url.href;
}

function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}

/**
 * Reads and checks environment.json, so a typo fails here with a clear
 * message instead of as an odd window size or an ignored locale.
 * @param {string} [file]
 * @returns {{window: {width: number, height: number}, locale: string, timezone: string}}
 */
function loadEnvironmentConfig(file = CONFIG_PATH) {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { window: size, locale, timezone } = config || {};
    if (!size || !isPositiveInteger(size.width) || !isPositiveInteger(size.height)) {
        throw new Error(`${file}: "window" needs a positive integer "width" and "height"`);
    }
    if (typeof locale !== 'string' || !locale) throw new Error(`${file}: "locale" must be a language tag such as "es-CO"`);
    if (typeof timezone !== 'string' || !timezone) throw new Error(`${file}: "timezone" must be an IANA name such as "America/Bogota"`);
    return { window: { width: size.width, height: size.height }, locale, timezone };
}

/**
 * Options for chromium.launchPersistentContext. Extensions only load in a
 * persistent context, and only in Playwright's own Chromium: Google Chrome
 * no longer honours --load-extension.
 * @param {ReturnType<typeof loadEnvironmentConfig>} config
 * @param {string} [extensionDir]
 */
function buildLaunchOptions(config, extensionDir = EXTENSION_DIR) {
    return {
        channel: 'chromium',
        headless: false,
        // The page gets the real window's size instead of Playwright's fixed
        // 1280x720 emulation, which would keep the page at that size when the
        // side panel opens and hide every resize from content.js.
        viewport: null,
        locale: config.locale,
        timezoneId: config.timezone,
        // record.js closes the browser itself, so the profile can be deleted after it.
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        args: [
            `--disable-extensions-except=${extensionDir}`,
            `--load-extension=${extensionDir}`,
            `--window-size=${config.window.width},${config.window.height}`,
            '--window-position=0,0',
            `--lang=${config.locale}`,
        ],
    };
}

/**
 * Checks the backend is up and idle before a clean browser is opened for it.
 * A session that is already recording would mix the steps of whatever page
 * it started on with the new one's.
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [url]
 * @returns {Promise<Object>} the backend's /status
 */
async function checkBackend(fetchImpl = fetch, url = BACKEND_STATUS_URL) {
    let status;
    try {
        const response = await fetchImpl(url);
        status = await response.json();
    } catch {
        throw new Error(`The EyeNav backend is not answering at ${url}. Start it first, from the repository root: python backend/main.py`);
    }
    if (status && status.sessionActive) {
        throw new Error(`A ${status.captureMode} session is already recording. Stop it before opening a clean environment.`);
    }
    return status;
}

/** Whether a service worker URL is EyeNav's background.js. */
function isEyeNavWorker(workerUrl, extensionId = EXTENSION_ID) {
    return workerUrl.startsWith(`chrome-extension://${extensionId}/`);
}

module.exports = {
    EXTENSION_DIR,
    EXTENSION_ID,
    BACKEND_STATUS_URL,
    CONFIG_PATH,
    parseTargetUrl,
    loadEnvironmentConfig,
    buildLaunchOptions,
    checkBackend,
    isEyeNavWorker,
};
