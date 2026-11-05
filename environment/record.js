/**
 * Opens a clean environment to record an EyeNav session in, straight on the
 * page the scenario starts from:
 *
 *   npm run record -- https://example.com
 *
 * The browser starts from an empty profile with only EyeNav loaded (see
 * launch.js for why), and that profile is deleted when the window closes, so
 * the next recording starts from exactly the same state. The session itself
 * still starts only when Play is pressed in EyeNav.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const {
    EXTENSION_ID, parseTargetUrl, loadEnvironmentConfig, buildLaunchOptions, checkBackend, isEyeNavWorker,
} = require('./launch');

const EXTENSION_LOAD_TIMEOUT_MS = 10000;
const NAVIGATION_TIMEOUT_MS = 60000;

/**
 * Waits for EyeNav's background service worker. A different id means the
 * extension loaded with another key, and the backend would refuse it.
 */
async function waitForEyeNav(context) {
    const isEyeNav = (worker) => isEyeNavWorker(worker.url());
    if (context.serviceWorkers().some(isEyeNav)) return;
    try {
        await context.waitForEvent('serviceworker', { predicate: isEyeNav, timeout: EXTENSION_LOAD_TIMEOUT_MS });
    } catch {
        const loaded = context.serviceWorkers().map((worker) => worker.url()).join(', ') || 'none';
        throw new Error(`EyeNav (id ${EXTENSION_ID}) did not load. Service workers found: ${loaded}`);
    }
}

async function browserVersion(page) {
    const session = await page.context().newCDPSession(page);
    const { product } = await session.send('Browser.getVersion');
    await session.detach();
    return product;
}

/**
 * Resolves once the user is done: the browser was quit, every web page in it
 * was closed (on macOS closing the last window doesn't quit the app, so the
 * pages are watched too), or Ctrl+C was pressed here.
 */
function untilClosed(context) {
    return new Promise((resolve) => {
        const close = () => context.close().catch(() => {});
        const isWebPage = (page) => !page.url().startsWith('chrome-extension://');
        const watch = (page) => page.once('close', () => {
            if (!context.pages().some(isWebPage)) close();
        });

        context.pages().forEach(watch);
        context.on('page', watch);
        context.once('close', resolve);
        process.once('SIGINT', close);
        process.once('SIGTERM', close);
    });
}

async function main() {
    const url = parseTargetUrl(process.argv[2]);
    const config = loadEnvironmentConfig();
    await checkBackend();

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyenav-clean-profile-'));
    let context;
    try {
        context = await chromium.launchPersistentContext(profileDir, buildLaunchOptions(config));
        await waitForEyeNav(context);

        const page = context.pages()[0] || await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

        console.log(`Clean environment ready: ${await browserVersion(page)}, empty profile, only EyeNav loaded`);
        console.log(`Window ${config.window.width}x${config.window.height}, locale ${config.locale}, timezone ${config.timezone}`);
        console.log(`Opened ${url}`);
        console.log('');
        console.log('1. Open EyeNav from the Extensions (puzzle piece) icon, choose a mode and press Play.');
        console.log('2. Record the scenario in this window.');
        console.log('3. Press Stop, then close the window (or press Ctrl+C here).');

        await untilClosed(context);
    } finally {
        if (context) await context.close().catch(() => {});
        // Only the folder this run created: it is what makes the next run clean.
        // Retried because Chromium's helper processes can still be writing
        // into it for a moment after close() returns (ENOTEMPTY).
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    console.log('Browser closed and its profile deleted.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
