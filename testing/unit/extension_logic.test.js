// Run from the repo root:  node --test testing/unit
//
// Loads the REAL content.js and step.js into a sandbox with just enough
// browser/WebdriverIO stubs to run them - no Chrome, no Selenium.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(repo, ...parts), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
// Objects built inside the vm sandbox have that realm's Object.prototype, which
// assert.deepEqual (strict) refuses to equate with test-side literals.
const plain = (value) => JSON.parse(JSON.stringify(value));

function makeClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        setTimeout(fn, ms) {
            const id = nextId++;
            timers.set(id, { fn, at: now + ms });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        advance(ms) {
            now += ms;
            for (const [id, timer] of [...timers]) {
                if (timer.at <= now) {
                    timers.delete(id);
                    timer.fn();
                }
            }
        },
    };
}

// ---------------------------------------------------------------- content.js

function loadContentScript({ relayResponse = { success: true, ok: true, data: {} } } = {}) {
    const clock = makeClock();
    const sent = [];
    const logs = { log: [], error: [] };
    let messageListener = null;

    const sandbox = {
        window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} },
        document: { body: {}, querySelectorAll: () => [], addEventListener() {} },
        Node: { ELEMENT_NODE: 1 },
        MutationObserver: class { observe() {} },
        chrome: {
            runtime: {
                sendMessage(message, callback) {
                    sent.push(message);
                    callback(relayResponse);
                },
                onMessage: { addListener(fn) { messageListener = fn; } },
            },
        },
        console: { log: (...a) => logs.log.push(a.join(' ')), error: (...a) => logs.error.push(a.join(' ')) },
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
    };
    vm.createContext(sandbox);
    vm.runInContext(read('extension', 'shared', 'config.js'), sandbox);
    vm.runInContext(read('extension', 'content.js'), sandbox);

    const call = (expression) => vm.runInContext(expression, sandbox);
    sandbox.__element = {
        nodeType: 1, tagName: 'BUTTON', id: 'go', className: '', textContent: ' Go ', parentNode: null,
        getAttribute: () => null,
    };
    return {
        clock, sent, logs, window: sandbox.window,
        click: () => call('handleClick({ target: __element })'),
        resize: () => call('handleResize()'),
        endpoints: () => sent.map(message => message.endpoint),
        askViewport: () => {
            let response;
            messageListener({ type: 'EYENAV_GET_VIEWPORT' }, {}, (r) => { response = r; });
            return response;
        },
    };
}

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

// ------------------------------------------------------------------- step.js

function loadSteps() {
    const steps = {};
    const sandbox = {
        require: () => ({
            Given: (pattern, fn) => { steps[pattern] = fn; },
            When() {}, Then() {},
        }),
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(read('testing', 'features', 'web', 'step_definitions', 'step.js'), sandbox);
    return steps;
}

function makeElement(log) {
    return {
        waitForExist: async (options) => { log.push(['waitForExist', options]); },
        waitForDisplayed: async (options) => { log.push(['waitForDisplayed', options]); },
        click: async () => { log.push(['click']); },
        clearValue: async () => { log.push(['clearValue']); },
        scrollIntoView: async (options) => { log.push(['scrollIntoView', options]); },
    };
}

// $$ answers [] until `renderAfterCalls` lookups have happened, like WebdriverIO
// does for an element a slow request has not rendered yet.
function makeDriver(log, { renderAfterCalls = 0 } = {}) {
    let lookups = 0;
    const element = makeElement(log);
    return {
        $$: async () => (++lookups > renderAfterCalls ? [element] : []),
        $: async () => element,
        waitUntil: async (condition, options) => {
            for (let attempt = 0; attempt < 50; attempt++) {
                if (await condition()) return true;
            }
            throw new Error(options.timeoutMsg);
        },
        keys: async (text) => { log.push(['keys', text]); },
    };
}

const names = (log) => log.map(entry => entry[0]);

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
