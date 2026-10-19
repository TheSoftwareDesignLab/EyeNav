// Shared scaffolding for the unit tests in this folder: the REAL content.js,
// background.js and step.js loaded into a sandbox with just enough browser and
// WebdriverIO stubs to run them - no Chrome, no Selenium.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(repo, ...parts), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
// Objects built inside the vm sandbox have that realm's Object.prototype, which
// assert.deepEqual (strict) refuses to equate with test-side literals.
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------- content.js

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

function loadContentScript({ relayResponse = { success: true, ok: true, data: {} } } = {}) {
    const clock = makeClock();
    const sent = [];
    const logs = { log: [], error: [] };
    let messageListener = null;

    const sandbox = {
        window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, scrollX: 0, scrollY: 0, addEventListener() {} },
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
        clock, sent, logs, sandbox, window: sandbox.window, document: sandbox.document, run: call,
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

// ---------------------------------------------------------------- background.js

function loadBackground({ sessionActive = true } = {}) {
    const requests = [];
    let messageListener = null;
    let now = 0;

    const sandbox = {
        importScripts() {},
        chrome: {
            sidePanel: { setPanelBehavior: () => Promise.resolve() },
            runtime: { onMessage: { addListener(fn) { messageListener = fn; } } },
        },
        fetch(url, options = {}) {
            requests.push({ url, method: options.method || 'GET' });
            const body = url.endsWith('/status') ? { sessionActive } : { status: 'received' };
            return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
        },
        Date: { now: () => now },
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(read('extension', 'shared', 'config.js'), sandbox);
    vm.runInContext(read('extension', 'background.js'), sandbox);

    return {
        requests,
        advance: (ms) => { now += ms; },
        report: (endpoint) => new Promise((resolve) => {
            messageListener({ type: 'EYENAV_REPORT', endpoint, data: {} }, {}, resolve);
        }),
    };
}

// ---------------------------------------------------------------- step.js

function loadStepsWithPage() {
    const steps = {};
    const page = {
        calls: [],
        scrollTo(x, y) { page.calls.push(['window.scrollTo', x, y]); },
        scrollBy(x, y) { page.calls.push(['window.scrollBy', x, y]); },
    };
    const sandbox = {
        require: () => ({
            Given: (pattern, fn) => { steps[pattern] = fn; },
            When() {}, Then() {},
        }),
        window: page,
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(read('testing', 'features', 'web', 'step_definitions', 'step.js'), sandbox);
    return { steps, page };
}

function loadSteps() {
    return loadStepsWithPage().steps;
}

function makeElement(log) {
    return {
        waitForExist: async (options) => { log.push(['waitForExist', options]); },
        waitForDisplayed: async (options) => { log.push(['waitForDisplayed', options]); },
        click: async () => { log.push(['click']); },
        clearValue: async () => { log.push(['clearValue']); },
        scrollIntoView: async (options) => { log.push(['scrollIntoView', options]); },
        selectByVisibleText: async (text) => { log.push(['selectByVisibleText', text]); },
        dragAndDrop: async (target) => { log.push(['dragAndDrop', target]); },
        // what the in-page function of the element-scroll step calls on it
        scrollTo: (x, y) => { log.push(['element.scrollTo', x, y]); },
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
        // Runs the page-side function for real, against the sandbox's fake window.
        execute: async (fn, ...args) => { log.push(['execute']); return fn(...args); },
        pause: async (ms) => { log.push(['pause', ms]); },
    };
}

const names = (log) => log.map(entry => entry[0]);

module.exports = {
    read, flush, plain, makeClock, loadContentScript, loadBackground,
    loadSteps, loadStepsWithPage, makeElement, makeDriver, names,
};
