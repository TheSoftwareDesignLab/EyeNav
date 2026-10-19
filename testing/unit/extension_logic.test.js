// Run from the repo root:  node --test testing/unit/*.test.js
//
// Loads the REAL content.js and step.js into a sandbox with just enough
// browser/WebdriverIO stubs to run them - no Chrome, no Selenium.
// (The scaffolding lives in ./support.js, shared with interactions.test.js.)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    flush, plain, loadContentScript, loadBackground, loadSteps, makeDriver, names,
} = require('./support');

// ---------------------------------------------------------------- content.js


test('a resize that settles is reported once, at its final size', async () => {
    const page = loadContentScript();
    page.resize();
    page.clock.advance(100);
    page.window.innerWidth = 900;
    page.resize();
    page.clock.advance(100);
    page.resize();
    page.clock.advance(1000);
    await flush();

    assert.deepEqual(page.endpoints(), ['/viewport-info']);
    assert.deepEqual(plain(page.sent[0].data), { width: 900, height: 720 });
});

test('a click made right after a resize is reported after it, and the resize is not repeated', async () => {
    const page = loadContentScript();
    page.resize();
    page.clock.advance(100);
    page.click();
    page.clock.advance(5000);
    await flush();

    assert.deepEqual(page.endpoints(), ['/viewport-info', '/tag-info']);
});

test('a zoom change is not recorded as a resize and drops the pending report', async () => {
    const page = loadContentScript();
    page.resize();                      // a real resize is pending...
    page.window.devicePixelRatio = 2;   // ...then the user zooms to 200%
    page.window.innerWidth = 640;
    page.resize();
    page.clock.advance(1000);
    await flush();
    assert.deepEqual(page.endpoints(), []);

    page.window.innerWidth = 600;       // a genuine resize at the new zoom is still recorded
    page.resize();
    page.clock.advance(1000);
    await flush();
    assert.deepEqual(page.endpoints(), ['/viewport-info']);
});

test('a backend rejection is surfaced as an error, not logged as received', async () => {
    const page = loadContentScript({ relayResponse: { success: true, ok: false, data: { status: 'bad event' } } });
    page.click();
    await flush();

    assert.ok(page.logs.error.some(line => line.includes('Backend rejected /tag-info: bad event')), page.logs.error.join('|'));
    assert.ok(!page.logs.log.some(line => line.includes('info received')));
});

test('an accepted report is still logged as received', async () => {
    const page = loadContentScript();
    page.click();
    await flush();

    assert.ok(page.logs.log.some(line => line.includes('info received')));
    assert.deepEqual(page.logs.error, []);
});

test('the content script answers a viewport request with the current window size', () => {
    const page = loadContentScript();
    page.window.innerWidth = 777;
    assert.deepEqual(plain(page.askViewport()), { width: 777, height: 720 });
});

test('a click reports only what becomes a step, not the element text', async () => {
    const page = loadContentScript();
    page.click();
    await flush();

    assert.deepEqual(Object.keys(page.sent[0].data).sort(), ['href', 'id', 'tagName', 'xpath']);
});

// ------------------------------------------------------------- background.js


test('the relay refuses endpoints other than the report ones', async () => {
    const background = loadBackground();
    for (const endpoint of ['/start', '/stop', '@evil.example/x']) {
        const response = await background.report(endpoint);
        assert.equal(response.success, false, endpoint);
    }
    assert.deepEqual(background.requests, []);
});

test('nothing is sent to the backend while no session is recording', async () => {
    const background = loadBackground({ sessionActive: false });
    const response = await background.report('/input-info');

    assert.equal(response.ok, true);
    assert.deepEqual(background.requests.map(r => r.method), ['GET']);
});

test('reports during a session are sent, and the active state is reused briefly', async () => {
    const background = loadBackground();
    await background.report('/tag-info');
    await background.report('/input-info');
    background.advance(5000);
    await background.report('/tag-info');

    assert.deepEqual(background.requests.map(r => r.url.replace('http://localhost:5001', '')),
        ['/status', '/tag-info', '/input-info', '/status', '/tag-info']);
});

// ------------------------------------------------------------------- step.js





test('an xpath step waits for an element that renders late, then acts on it', async () => {
    const log = [];
    const steps = loadSteps();
    await steps['I click on tag with xpath {string}'].call({ driver: makeDriver(log, { renderAfterCalls: 4 }) }, '//*[@id="late"]');

    assert.deepEqual(names(log), ['waitForExist', 'waitForDisplayed', 'click']);
});

test('an xpath step for an element that never renders fails with a clear message, not a TypeError', async () => {
    const log = [];
    const steps = loadSteps();
    const driver = makeDriver(log, { renderAfterCalls: Infinity });

    await assert.rejects(
        steps['I click on tag with xpath {string}'].call({ driver }, '//*[@id="ghost"]'),
        /No element found for xpath \/\/\*\[@id="ghost"\]/,
    );
});

test('the scroll step centers the element (not top-aligned under a sticky header)', async () => {
    const log = [];
    const steps = loadSteps();
    await steps['I scroll until I can see the element with xpath {string}'].call({ driver: makeDriver(log) }, '//a');

    assert.deepEqual(names(log), ['waitForExist', 'waitForDisplayed', 'scrollIntoView']);
    assert.deepEqual(plain(log[2][1]), { block: 'center', inline: 'center' });
});

test('waits use an explicit timeout instead of the framework default', async () => {
    const log = [];
    const steps = loadSteps();
    await steps['I click on tag with xpath {string}'].call({ driver: makeDriver(log) }, '//a');

    const [, existOptions] = log.find(entry => entry[0] === 'waitForExist');
    assert.ok(existOptions.timeout > 5000, `timeout was ${existOptions.timeout}`);
});

test('typing into a field waits for it, focuses it, clears it, then types', async () => {
    const log = [];
    const steps = loadSteps();
    await steps['I type {string} into field with xpath {string}'].call({ driver: makeDriver(log, { renderAfterCalls: 2 }) }, 'hello', '//input');

    assert.deepEqual(names(log), ['waitForExist', 'waitForDisplayed', 'click', 'clearValue', 'keys']);
});

test('href and id steps wait for their element before clicking', async () => {
    for (const [pattern, arg] of [['I click on tag with href {string}', '/x'], ['I click on tag with id {string}', 'go']]) {
        const log = [];
        await loadSteps()[pattern].call({ driver: makeDriver(log) }, arg);
        assert.deepEqual(names(log), ['waitForExist', 'waitForDisplayed', 'click'], pattern);
    }
});
