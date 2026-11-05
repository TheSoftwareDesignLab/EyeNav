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

// locator.js only keeps a locator after checking, on the page, that it finds
// exactly that element. These fake elements are in no page, so the two
// lookups it checks with are reduced to finding a registered element by its
// id, the way //*[@id="..."] and #id look it up. Which locator wins on a real
// page is tested against a real browser in locator.test.js.
const fakeElementsById = new Map();

/** Makes a fake element findable by its id, as it would be on a page. */
function registerFakeElement(element) {
    if (element.id) fakeElementsById.set(element.id, element);
    return element;
}

function registeredById(locator) {
    const match = /^\/\/\*\[@id="([^"]*)"\]$/.exec(locator) || /^#([\w-]+)$/.exec(locator);
    return (match && fakeElementsById.get(match[1])) || null;
}

const fakeDocumentLookups = {
    evaluate(xpath) {
        const element = registeredById(xpath);
        return { snapshotLength: element ? 1 : 0, snapshotItem: () => element };
    },
    querySelector: registeredById,
};

function loadContentScript({ relayResponse = { success: true, ok: true, data: {} } } = {}) {
    const clock = makeClock();
    const sent = [];
    const logs = { log: [], error: [] };
    let messageListener = null;

    const sandbox = {
        window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, scrollX: 0, scrollY: 0, addEventListener() {} },
        document: { body: { nodeType: 1, tagName: 'BODY' }, querySelectorAll: () => [], addEventListener() {}, ...fakeDocumentLookups },
        Node: { ELEMENT_NODE: 1 },
        XPathResult: { ORDERED_NODE_SNAPSHOT_TYPE: 7 },
        MutationObserver: class { observe() {} },
        chrome: {
            runtime: {
                sendMessage(message, callback) {
                    sent.push(message);
                    if (callback) callback(relayResponse);
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
    vm.runInContext(read('extension', 'locator.js'), sandbox);
    vm.runInContext(read('extension', 'content.js'), sandbox);

    const call = (expression) => vm.runInContext(expression, sandbox);
    sandbox.__element = registerFakeElement({
        nodeType: 1, tagName: 'BUTTON', id: 'go', className: '', textContent: ' Go ', parentNode: null,
        getAttribute: () => null,
    });
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

/**
 * background.js with fake Chrome APIs. `storage` stands for
 * chrome.storage.session: pass the same one to a second loadBackground to
 * play Chrome stopping and restarting the worker.
 */
function loadBackground({ sessionActive = true, storage = {} } = {}) {
    const requests = [];
    let messageListener = null;
    const navigationListeners = [];
    let now = 0;

    const sandbox = {
        importScripts() {},
        chrome: {
            sidePanel: { setPanelBehavior: () => Promise.resolve() },
            runtime: { onMessage: { addListener(fn) { messageListener = fn; } } },
            webNavigation: Object.fromEntries(['onCommitted', 'onHistoryStateUpdated', 'onReferenceFragmentUpdated']
                .map(name => [name, { addListener(fn) { navigationListeners.push(fn); } }])),
            tabs: { onRemoved: { addListener() {} } },
            storage: {
                session: {
                    get: async (key) => (key in storage ? { [key]: JSON.parse(storage[key]) } : {}),
                    set: async (items) => { for (const [key, value] of Object.entries(items)) storage[key] = JSON.stringify(value); },
                    remove: async (key) => { delete storage[key]; },
                },
            },
        },
        fetch(url, options = {}) {
            requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
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
        storage,
        advance: (ms) => { now += ms; },
        report: (endpoint) => new Promise((resolve) => {
            messageListener({ type: 'EYENAV_REPORT', endpoint, data: {} }, {}, resolve);
        }),
        /** The page in tab 1 saying it moved through its history by itself. */
        pageMoved: () => messageListener({ type: 'EYENAV_PAGE_MOVED' }, { tab: { id: 1 } }, () => {}),
        /** A top-frame navigation in tab 1, as chrome.webNavigation reports it. */
        navigate: (url, { backForward = false, reload = false, frameId = 0 } = {}) => navigationListeners[0]({
            tabId: 1, frameId, url,
            transitionType: reload ? 'reload' : 'link',
            transitionQualifiers: backForward ? ['forward_back'] : [],
        }),
        /** The history moves POSTed to the backend, in order. */
        historyReports: () => requests.filter(r => r.url.endsWith('/history-info')).map(r => r.body.direction),
    };
}

// ---------------------------------------------------------------- step.js

// globals: what the page's own window reports (innerWidth, devicePixelRatio, ...)
// to functions the steps run in the page through driver.execute.
function loadStepsWithPage(globals = {}) {
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
    Object.defineProperties(sandbox, Object.getOwnPropertyDescriptors(globals));
    vm.createContext(sandbox);
    vm.runInContext(read('testing', 'features', 'web', 'step_definitions', 'step.js'), sandbox);
    return { steps, page };
}

function loadSteps() {
    return loadStepsWithPage().steps;
}

// size/visibility: what the page reports for it; { width: 0, height: 0 } is display: none.
function makeElement(log, { size = { width: 40, height: 40 }, visibility = 'visible' } = {}) {
    return {
        selector: '//fake',
        waitForExist: async (options) => { log.push(['waitForExist', options]); },
        getSize: async () => size,
        getCSSProperty: async (name) => ({ property: name, value: name === 'visibility' ? visibility : '' }),
        waitUntil: async (condition, options) => {
            log.push(['waitUntil', options]);
            for (let attempt = 0; attempt < 50; attempt++) {
                if (await condition()) return true;
            }
            throw new Error(options.timeoutMsg);
        },
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
function makeDriver(log, { renderAfterCalls = 0, size, visibility } = {}) {
    let lookups = 0;
    const element = makeElement(log, { size, visibility });
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
    read, flush, plain, makeClock, loadContentScript, loadBackground, registerFakeElement,
    loadSteps, loadStepsWithPage, makeElement, makeDriver, names,
};
