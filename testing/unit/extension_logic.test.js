// Run from the repo root:  node --test testing/unit/*.test.js
//
// Loads the REAL content.js and step.js into a sandbox with just enough
// browser/WebdriverIO stubs to run them - no Chrome, no Selenium.
// (The scaffolding lives in ./support.js, shared with interactions.test.js.)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    flush, plain, loadContentScript, loadBackground, loadSteps, loadStepsWithPage, makeDriver, names, registerFakeElement,
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

    assert.deepEqual(Object.keys(page.sent[0].data).sort(), ['href', 'id', 'shadowSelector', 'tagName', 'xpath']);
});

test('text typed into a field that keeps the focus is reported before a click on a suggestion, once', async () => {
    // An autocomplete list keeps the focus in the field while a suggestion is
    // clicked, so the field's `change` never fires before the page changes.
    const page = loadContentScript();
    const field = registerFakeElement({
        nodeType: 1, tagName: 'INPUT', id: 'search', value: 'hola', defaultValue: '', parentNode: null,
        getAttribute: (name) => (name === 'type' ? 'search' : null),
    });
    page.document.activeElement = field;
    page.sandbox.__suggestion = registerFakeElement({ nodeType: 1, tagName: 'A', id: 'suggestion', parentNode: null, getAttribute: () => null });
    page.sandbox.__field = field;

    page.run('handleClick({ target: __suggestion })');
    page.run('handleInputCommit({ target: __field })');   // the field's late `change`, same value
    await flush();

    assert.deepEqual(page.endpoints(), ['/input-info', '/tag-info']);
    assert.equal(page.sent[0].data.text, 'hola');
});

test('a click while the focused field has nothing new to report reports only the click', async () => {
    const page = loadContentScript();
    page.document.activeElement = registerFakeElement({
        nodeType: 1, tagName: 'INPUT', id: 'untouched', value: 'preset', defaultValue: 'preset', parentNode: null,
        getAttribute: () => null,
    });
    page.click();
    await flush();
    assert.deepEqual(page.endpoints(), ['/tag-info']);
});

test('a click on the bare page background is not reported', async () => {
    const page = loadContentScript();
    page.run('handleClick({ target: document.body })');
    await flush();
    assert.deepEqual(page.endpoints(), []);
});

test("a click on a label is reported once, not again for the browser's own click on its control", async () => {
    const page = loadContentScript();
    const checkbox = { nodeType: 1, tagName: 'INPUT', id: '', parentNode: null, getAttribute: () => null };
    page.sandbox.__label = { nodeType: 1, tagName: 'LABEL', id: '', control: checkbox, parentNode: null, getAttribute: () => null };
    page.sandbox.__checkbox = checkbox;

    page.run('handleClick({ target: __label })');
    page.run('handleClick({ target: __checkbox })');   // dispatched by the browser in the same task
    await flush();
    assert.deepEqual(page.sent.map(message => message.data.tagName), ['label']);

    page.clock.advance(0);                               // that task is over
    page.run('handleClick({ target: __checkbox })');   // the user clicking the checkbox itself
    await flush();
    assert.deepEqual(page.sent.map(message => message.data.tagName), ['label', 'input']);
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

    assert.deepEqual(names(log), ['waitForExist', 'waitUntil', 'click']);
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

    assert.deepEqual(names(log), ['waitForExist', 'waitUntil', 'scrollIntoView']);
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

    assert.deepEqual(names(log), ['waitForExist', 'waitUntil', 'click', 'clearValue', 'keys']);
});

test('a transparent element (opacity 0) that takes up space is ready to be clicked', async () => {
    // A carousel's arrow before the mouse is over it, an open accordion's "+":
    // WebdriverIO's isDisplayed() calls these hidden and waited for them forever.
    const log = [];
    await loadSteps()['I click on tag with xpath {string}'].call({ driver: makeDriver(log) }, '//*[@id="carousel"]/div[8]/span[1]');
    assert.deepEqual(names(log), ['waitForExist', 'waitUntil', 'click']);
});

test('an element with no size (display: none) or visibility: hidden is waited for, then fails clearly', async () => {
    for (const hidden of [{ size: { width: 0, height: 0 } }, { visibility: 'hidden' }]) {
        const log = [];
        await assert.rejects(
            loadSteps()['I click on tag with xpath {string}'].call({ driver: makeDriver(log, hidden) }, '//a'),
            /still not visible after 15000ms/,
        );
        assert.ok(!names(log).includes('click'));
    }
});

test('shadow selector steps look the element up through shadow roots, and wait for it', async () => {
    const steps = loadSteps();
    for (const [pattern, action] of [
        ['I scroll until I can see the element with shadow selector {string}', 'scrollIntoView'],
        ['I click on tag with shadow selector {string}', 'click'],
    ]) {
        const log = [];
        const driver = makeDriver(log);
        const lookup = driver.$;
        driver.$ = (selector) => { log.push(['$', selector]); return lookup(selector); };

        await steps[pattern].call({ driver }, 'button[data-testid="uc-accept-all-button"]');
        assert.deepEqual(log[0], ['$', '>>>button[data-testid="uc-accept-all-button"]'], pattern);
        assert.deepEqual(names(log).slice(1), ['waitForExist', 'waitUntil', action], pattern);
    }
});

/**
 * A browser window on a Retina screen: bars 87 px tall above the page, and
 * at most maxHeight tall. Commands sent over the DevTools protocol go to `sent`.
 */
function fakeWindow({ maxHeight = 2000 } = {}) {
    const win = { outerWidth: 1200, outerHeight: 790, bars: 87, devicePixelRatio: 2, sent: [] };
    const session = {
        send: async (method, params) => {
            win.sent.push([method, params]);
            if (method === 'Browser.getWindowForTarget') return { windowId: 7 };
            if (method === 'Browser.setWindowBounds') {
                win.outerWidth = params.bounds.width;
                win.outerHeight = Math.min(params.bounds.height, maxHeight);
            }
            return {};
        },
    };
    const page = { target: () => ({ createCDPSession: async () => session }) };
    const driver = {
        getPuppeteer: async () => ({ pages: async () => [page] }),
        execute: async (fn) => fn(),
        pause: async () => {},
    };
    const globals = {
        get innerWidth() { return win.outerWidth; },
        get innerHeight() { return win.outerHeight - win.bars; },
        get outerWidth() { return win.outerWidth; },
        get outerHeight() { return win.outerHeight; },
        get devicePixelRatio() { return win.devicePixelRatio; },
    };
    return { win, driver, globals };
}

test('the viewport step resizes the window so the page is exactly the recorded size', async () => {
    const { win, driver, globals } = fakeWindow();
    const { steps } = loadStepsWithPage(globals);
    await steps['I set the viewport to {int}x{int}'].call({ driver }, 1280, 703);

    assert.equal(globals.innerWidth, 1280);
    assert.equal(globals.innerHeight, 703);
    assert.deepEqual(plain(win.sent.find(([method]) => method === 'Browser.setWindowBounds')),
        ['Browser.setWindowBounds', { windowId: 7, bounds: { width: 1280, height: 790 } }]);
    // Not emulated: the page keeps the screen's own pixel density.
    assert.ok(!win.sent.some(([method]) => method === 'Emulation.setDeviceMetricsOverride'));
});

test('if the screen cannot fit the window, the page size is emulated at the screen\'s density', async () => {
    const { win, driver, globals } = fakeWindow({ maxHeight: 600 });
    const { steps } = loadStepsWithPage(globals);
    await steps['I set the viewport to {int}x{int}'].call({ driver }, 1280, 703);

    assert.deepEqual(plain(win.sent.at(-1)),
        ['Emulation.setDeviceMetricsOverride', { width: 1280, height: 703, deviceScaleFactor: 2, mobile: false }]);
});

test('the back and forward steps wait for the browser to move before pausing', async () => {
    const log = [];
    const driver = {
        back: () => new Promise(resolve => setTimeout(() => { log.push('back'); resolve(); }, 5)),
        forward: () => new Promise(resolve => setTimeout(() => { log.push('forward'); resolve(); }, 5)),
        pause: async () => { log.push('pause'); },
    };
    const steps = loadSteps();
    await steps['I go back'].call({ driver });
    await steps['I go forward'].call({ driver });
    assert.deepEqual(log, ['back', 'pause', 'forward', 'pause']);
});

test('href and id steps wait for their element before clicking', async () => {
    for (const [pattern, arg] of [['I click on tag with href {string}', '/x'], ['I click on tag with id {string}', 'go']]) {
        const log = [];
        await loadSteps()[pattern].call({ driver: makeDriver(log) }, arg);
        assert.deepEqual(names(log), ['waitForExist', 'waitUntil', 'click'], pattern);
    }
});
