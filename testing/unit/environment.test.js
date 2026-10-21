// Run from the repo root:  node --test testing/unit/*.test.js
//
// The clean recording environment (environment/launch.js): what it opens,
// with which browser options, and when it refuses to open at all. No browser
// is launched here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    EXTENSION_DIR, EXTENSION_ID, CONFIG_PATH,
    parseTargetUrl, loadEnvironmentConfig, buildLaunchOptions, checkBackend, isEyeNavWorker,
} = require('../../environment/launch');

const repo = path.join(__dirname, '..', '..');

function writeConfig(config) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyenav-env-test-'));
    const file = path.join(dir, 'environment.json');
    fs.writeFileSync(file, JSON.stringify(config));
    test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return file;
}

const fakeFetch = (status) => async () => ({ json: async () => status });

test('the start page must be an http(s) URL', () => {
    assert.equal(parseTargetUrl('https://example.com'), 'https://example.com/');
    assert.equal(parseTargetUrl('http://localhost:3000/login?next=1'), 'http://localhost:3000/login?next=1');
    assert.throws(() => parseTargetUrl(undefined), /Usage: npm run record/);
    assert.throws(() => parseTargetUrl('example.com'), /Not a valid URL/);
    assert.throws(() => parseTargetUrl('file:///etc/hosts'), /Only http and https/);
    assert.throws(() => parseTargetUrl('chrome://settings'), /Only http and https/);
});

test("the repository's environment.json is valid", () => {
    const config = loadEnvironmentConfig(CONFIG_PATH);
    assert.ok(config.window.width > 0 && config.window.height > 0);
    assert.ok(config.locale && config.timezone);
});

test('environment.json mistakes are reported, not ignored', () => {
    const valid = { window: { width: 1280, height: 800 }, locale: 'es-CO', timezone: 'America/Bogota' };
    assert.deepEqual(loadEnvironmentConfig(writeConfig(valid)), valid);
    assert.throws(() => loadEnvironmentConfig(writeConfig({ ...valid, window: { width: '1280', height: 800 } })), /positive integer/);
    assert.throws(() => loadEnvironmentConfig(writeConfig({ ...valid, window: { width: 0, height: 800 } })), /positive integer/);
    assert.throws(() => loadEnvironmentConfig(writeConfig({ ...valid, locale: '' })), /"locale"/);
    assert.throws(() => loadEnvironmentConfig(writeConfig({ ...valid, timezone: undefined })), /"timezone"/);
});

test('the browser is bundled Chromium with only EyeNav, at the configured size and language', () => {
    const config = { window: { width: 1366, height: 768 }, locale: 'en-US', timezone: 'UTC' };
    const options = buildLaunchOptions(config);

    assert.equal(options.channel, 'chromium');
    assert.equal(options.headless, false);
    assert.equal(options.viewport, null);
    assert.equal(options.locale, 'en-US');
    assert.equal(options.timezoneId, 'UTC');
    assert.ok(options.args.includes(`--disable-extensions-except=${EXTENSION_DIR}`));
    assert.ok(options.args.includes(`--load-extension=${EXTENSION_DIR}`));
    assert.ok(options.args.includes('--window-size=1366,768'));
    assert.ok(options.args.includes('--lang=en-US'));
    assert.ok(fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json')), 'EXTENSION_DIR points at the extension');
});

test('the extension id is the one the backend accepts', () => {
    const security = fs.readFileSync(path.join(repo, 'backend', 'security.py'), 'utf8');
    const backendDefault = security.match(/EYENAV_EXTENSION_ID", "([a-p]{32})"/)[1];
    assert.equal(EXTENSION_ID, backendDefault);
    assert.ok(isEyeNavWorker(`chrome-extension://${EXTENSION_ID}/background.js`));
    assert.ok(!isEyeNavWorker('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/background.js'));
});

test('no clean browser opens while the backend is down or already recording', async () => {
    const down = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(checkBackend(down), /not answering .*python backend\/main\.py/);
    await assert.rejects(checkBackend(fakeFetch({ sessionActive: true, captureMode: 'mouse_keyboard' })), /mouse_keyboard session is already recording/);
    assert.deepEqual(await checkBackend(fakeFetch({ sessionActive: false, captureMode: null })), { sessionActive: false, captureMode: null });
});
