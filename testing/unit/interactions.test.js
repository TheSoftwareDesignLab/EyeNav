// Run from the repo root:  node --test testing/unit/*.test.js
//
// The interactions beyond click, typing and resize - choosing an option in a
// <select>, scrolling, rich-text (contenteditable) editing, and HTML5
// drag-and-drop - from the page that captures them to the step that replays them.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    flush, plain, loadContentScript, loadBackground, loadStepsWithPage, makeDriver, names, registerFakeElement,
} = require('./support');

let uniqueId = 0;

/** A minimal DOM element, findable by its id: enough for locator.js's getXPath (which needs an id or a parent chain). */
function fakeElement(props = {}) {
    return registerFakeElement({
        nodeType: 1, tagName: 'DIV', id: '', className: '', parentNode: null, parentElement: null,
        isContentEditable: false, getAttribute: () => null,
        ...props,
    });
}

/** Delivers `event` to one of content.js's handlers, by name. */
function fire(page, handler, event) {
    page.sandbox.__event = event;
    return page.run(`${handler}(__event)`);
}

function fakeSelect(props = {}) {
    return fakeElement({
        tagName: 'SELECT', id: 'country', multiple: false,
        selectedOptions: [{ text: 'Colombia' }],
        ...props,
    });
}

// ------------------------------------------------------------------- <select>

test('choosing an option reports its visible text and the select', async () => {
    const page = loadContentScript();
    fire(page, 'handleInputCommit', { target: fakeSelect({ selectedOptions: [{ text: '  Costa \n Rica ' }] }) });
    await flush();

    assert.deepEqual(page.endpoints(), ['/select-info']);
    assert.deepEqual(plain(page.sent[0].data), { text: 'Costa Rica', id: 'country', xpath: '//*[@id="country"]' });
});

test('a multiple-select is not reported, since its change only carries the final set', async () => {
    const page = loadContentScript();
    fire(page, 'handleInputCommit', { target: fakeSelect({ multiple: true }) });
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('a select with nothing selected is not reported', async () => {
    const page = loadContentScript();
    fire(page, 'handleInputCommit', { target: fakeSelect({ selectedOptions: [] }) });
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('the same change event is not reported twice', async () => {
    const page = loadContentScript();
    const event = { target: fakeSelect() };
    fire(page, 'handleInputCommit', event);
    fire(page, 'handleInputCommit', event);
    await flush();

    assert.equal(page.endpoints().length, 1);
});

test('a text longer than the backend accepts is cut before it is sent', async () => {
    const page = loadContentScript();
    fire(page, 'handleInputCommit', { target: fakeElement({ tagName: 'TEXTAREA', id: 'bio', value: 'x'.repeat(10000) }) });
    await flush();

    assert.equal(page.sent[0].data.text.length, 4096);
});

// ------------------------------------------------------------------- scrolling

test('a scroll is reported once, at the position it settled on', async () => {
    const page = loadContentScript();
    for (const y of [100, 400, 900]) {
        page.window.scrollX = 0;
        page.window.scrollY = y;
        fire(page, 'handleScroll', { target: page.document });
        page.clock.advance(50);
    }
    page.clock.advance(1000);
    await flush();

    assert.deepEqual(page.endpoints(), ['/scroll-info']);
    assert.deepEqual(plain(page.sent[0].data), { x: 0, y: 900, xpath: null });
});

test('fractional scroll positions are rounded to whole numbers', async () => {
    const page = loadContentScript();
    page.window.scrollX = 0.4;
    page.window.scrollY = 1234.6;
    fire(page, 'handleScroll', { target: page.document });
    page.clock.advance(1000);
    await flush();

    assert.deepEqual(plain(page.sent[0].data), { x: 0, y: 1235, xpath: null });
});

test('scrolling back to a position that was already reported is not reported again', async () => {
    const page = loadContentScript();
    page.window.scrollY = 500;
    fire(page, 'handleScroll', { target: page.document });
    page.clock.advance(1000);
    fire(page, 'handleScroll', { target: page.document });   // a scroll event, but nowhere new
    page.clock.advance(1000);
    await flush();

    assert.equal(page.endpoints().length, 1);
});

test('an element that scrolls is reported with its own offsets and xpath', async () => {
    const page = loadContentScript();
    const list = fakeElement({ id: 'results', scrollLeft: 0, scrollTop: 320 });
    fire(page, 'handleScroll', { target: list });
    page.clock.advance(1000);
    await flush();

    assert.deepEqual(plain(page.sent[0].data), { x: 0, y: 320, xpath: '//*[@id="results"]' });
});

test('the page and an element scroll independently', async () => {
    const page = loadContentScript();
    page.window.scrollY = 700;
    fire(page, 'handleScroll', { target: page.document });
    fire(page, 'handleScroll', { target: fakeElement({ id: 'panel', scrollTop: 90 }) });
    page.clock.advance(1000);
    await flush();

    assert.equal(page.endpoints().length, 2);
    assert.deepEqual(page.sent.map(m => m.data.xpath).sort(), [null, '//*[@id="panel"]'].sort());
});

test('an element whose xpath cannot be computed is not reported as a page scroll', async () => {
    const page = loadContentScript();
    fire(page, 'handleScroll', { target: fakeElement({ id: '', scrollTop: 50 }) });   // detached: no id, no parent
    page.clock.advance(1000);
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('a scroll caused by typing is not a scroll the user made', async () => {
    const page = loadContentScript();
    for (const target of [
        fakeElement({ tagName: 'TEXTAREA', id: 'notes', scrollTop: 60 }),
        fakeElement({ tagName: 'INPUT', id: 'q', scrollLeft: 30 }),
        fakeElement({ id: 'editor', scrollTop: 10, isContentEditable: true }),
    ]) {
        fire(page, 'handleScroll', { target });
    }
    page.clock.advance(1000);
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('a text node or other non-element scroll target is ignored', async () => {
    const page = loadContentScript();
    fire(page, 'handleScroll', { target: { nodeType: 3 } });
    page.clock.advance(1000);
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('a click made right after a scroll is reported after it', async () => {
    const page = loadContentScript();
    page.window.scrollY = 800;
    fire(page, 'handleScroll', { target: page.document });
    page.clock.advance(100);
    page.click();
    page.clock.advance(5000);
    await flush();

    assert.deepEqual(page.endpoints(), ['/scroll-info', '/tag-info']);
});

test('a resize and a scroll that are both pending are reported in the order they began', async () => {
    const page = loadContentScript();
    page.resize();
    page.clock.advance(50);
    page.window.scrollY = 300;
    fire(page, 'handleScroll', { target: page.document });
    page.click();
    page.clock.advance(5000);
    await flush();

    assert.deepEqual(page.endpoints(), ['/viewport-info', '/scroll-info', '/tag-info']);
});

// ------------------------------------------------------ rich text (contenteditable)

function fakeEditor(text, props = {}) {
    return fakeElement({ id: `editor-${++uniqueId}`, isContentEditable: true, innerText: text, ...props });
}

test('text typed into a contenteditable region is reported when focus leaves it', async () => {
    const page = loadContentScript();
    const editor = fakeEditor('Hello');
    fire(page, 'handleEditableFocusIn', { target: editor });
    editor.innerText = 'Hello world';
    fire(page, 'handleEditableFocusOut', { target: editor });
    await flush();

    assert.deepEqual(page.endpoints(), ['/input-info']);
    assert.equal(page.sent[0].data.text, 'Hello world');
    assert.equal(page.sent[0].data.xpath, `//*[@id="${editor.id}"]`);
});

test('focusing a contenteditable region and leaving it unchanged reports nothing', async () => {
    const page = loadContentScript();
    const editor = fakeEditor('Same');
    fire(page, 'handleEditableFocusIn', { target: editor });
    fire(page, 'handleEditableFocusOut', { target: editor });
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('focus events from inside the region are credited to the region itself', async () => {
    const page = loadContentScript();
    const editor = fakeEditor('a');
    const inner = fakeElement({ id: 'inner', isContentEditable: true, parentElement: editor });
    fire(page, 'handleEditableFocusIn', { target: inner });
    editor.innerText = 'ab';
    fire(page, 'handleEditableFocusOut', { target: inner });
    await flush();

    assert.equal(page.sent[0].data.xpath, `//*[@id="${editor.id}"]`);
});

test('leaving an element that was never focused as an editor reports nothing', async () => {
    const page = loadContentScript();
    fire(page, 'handleEditableFocusOut', { target: fakeEditor('x') });
    fire(page, 'handleEditableFocusOut', { target: fakeElement({ id: 'plain' }) });
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('an edit is reported once, not again on a later blur with the same text', async () => {
    const page = loadContentScript();
    const editor = fakeEditor('a');
    fire(page, 'handleEditableFocusIn', { target: editor });
    editor.innerText = 'ab';
    fire(page, 'handleEditableFocusOut', { target: editor });
    fire(page, 'handleEditableFocusOut', { target: editor });
    await flush();

    assert.equal(page.endpoints().length, 1);
});

// ---------------------------------------------------------------- drag and drop

test('a drag that is dropped on another element is reported with both xpaths', async () => {
    const page = loadContentScript();
    fire(page, 'handleDragStart', { target: fakeElement({ id: 'card-1' }) });
    fire(page, 'handleDrop', { target: fakeElement({ id: 'column-2' }) });
    await flush();

    assert.deepEqual(page.endpoints(), ['/drag-info']);
    assert.deepEqual(plain(page.sent[0].data), { sourceXpath: '//*[@id="card-1"]', targetXpath: '//*[@id="column-2"]' });
});

test('a drop with no drag started on the page (a file from the desktop) is ignored', async () => {
    const page = loadContentScript();
    fire(page, 'handleDrop', { target: fakeElement({ id: 'zone' }) });
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('a drag that ends without a drop is forgotten, so a later foreign drop is still ignored', async () => {
    const page = loadContentScript();
    fire(page, 'handleDragStart', { target: fakeElement({ id: 'card-1' }) });
    fire(page, 'handleDragEnd', {});
    fire(page, 'handleDrop', { target: fakeElement({ id: 'zone' }) });
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('dropping an element onto itself is not a move', async () => {
    const page = loadContentScript();
    const card = fakeElement({ id: 'card-1' });
    fire(page, 'handleDragStart', { target: card });
    fire(page, 'handleDrop', { target: card });
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('dragging selected text, whose source is a text node, is credited to its parent element', async () => {
    const page = loadContentScript();
    const paragraph = fakeElement({ id: 'para' });
    fire(page, 'handleDragStart', { target: { nodeType: 3, parentElement: paragraph } });
    fire(page, 'handleDrop', { target: fakeElement({ id: 'box' }) });
    await flush();

    assert.equal(page.sent[0].data.sourceXpath, '//*[@id="para"]');
});

test('a drag between elements whose xpaths cannot be computed is not reported', async () => {
    const page = loadContentScript();
    fire(page, 'handleDragStart', { target: fakeElement({ id: '' }) });
    fire(page, 'handleDrop', { target: fakeElement({ id: 'box' }) });
    await flush();

    assert.deepEqual(page.endpoints(), []);
});

test('a pending scroll is reported before the drop that follows it', async () => {
    const page = loadContentScript();
    page.window.scrollY = 250;
    fire(page, 'handleScroll', { target: page.document });
    fire(page, 'handleDragStart', { target: fakeElement({ id: 'a' }) });
    fire(page, 'handleDrop', { target: fakeElement({ id: 'b' }) });
    await flush();

    assert.deepEqual(page.endpoints(), ['/scroll-info', '/drag-info']);
});

// ------------------------------------------------------------------- relay

// ------------------------------------------------------------------ Enter key

function fakeField(props = {}) {
    return fakeElement({ tagName: 'INPUT', id: `field-${++uniqueId}`, value: '', defaultValue: '', getAttribute: (name) => (name === 'type' ? 'search' : null), ...props });
}

test('Enter in a text field reports what was typed, then the key', async () => {
    const page = loadContentScript();
    const field = fakeField({ value: 'hola' });
    fire(page, 'handleKeyDown', { key: 'Enter', target: field });
    fire(page, 'handleInputCommit', { target: field });   // the change Enter also fires: same value, not again
    await flush();

    assert.deepEqual(page.endpoints(), ['/input-info', '/key-info']);
    assert.equal(page.sent[0].data.text, 'hola');
    assert.deepEqual(plain(page.sent[1].data), { key: 'Enter' });
});

test('Enter in a field whose text was already reported reports only the key', async () => {
    const page = loadContentScript();
    const field = fakeField({ value: 'hola' });
    fire(page, 'handleInputCommit', { target: field });
    fire(page, 'handleKeyDown', { key: 'Enter', target: field });
    await flush();
    assert.deepEqual(page.endpoints(), ['/input-info', '/key-info']);
});

test('other keys, Enter in a textarea, and Enter while composing text are not reported', async () => {
    const page = loadContentScript();
    fire(page, 'handleKeyDown', { key: 'a', target: fakeField({ value: 'a' }) });
    fire(page, 'handleKeyDown', { key: 'Enter', target: fakeField({ tagName: 'TEXTAREA', value: 'line' }) });
    fire(page, 'handleKeyDown', { key: 'Enter', isComposing: true, target: fakeField({ value: 'にほん' }) });
    await flush();
    assert.deepEqual(page.endpoints(), []);
});

// --------------------------------------------------------- browser Back/Forward

test("the browser's Back and Forward are recorded from the browser, one step per page moved", async () => {
    const background = loadBackground();
    for (const url of ['/inicio', '/documento.pdf', '/eventos']) await background.navigate(url);
    await background.navigate('/documento.pdf', { backForward: true });   // Back
    await background.navigate('/eventos', { backForward: true });         // Forward
    await background.navigate('/inicio', { backForward: true });          // two back, from the Back button's list
    assert.deepEqual(background.historyReports(), ['back', 'forward', 'back', 'back']);
});

test("the page's own history.back(), reloads, links and frames are not recorded as Back or Forward", async () => {
    const background = loadBackground();
    for (const url of ['/inicio', '/eventos']) await background.navigate(url);
    background.pageMoved();                                               // its "Volver" button: the click is the step
    await background.navigate('/inicio', { backForward: true });
    await background.navigate('/inicio', { reload: true });
    await background.navigate('/anuncio', { frameId: 3 });
    assert.deepEqual(background.historyReports(), []);

    background.advance(5000);                                             // a later Back, by the user
    await background.navigate('/eventos', { backForward: true });         // (Forward, in fact)
    assert.deepEqual(background.historyReports(), ['forward']);
});

test('which way the tab went is still known after Chrome restarts the background worker', async () => {
    const before = loadBackground();
    for (const url of ['/inicio', '/documento.pdf']) await before.navigate(url);
    const after = loadBackground({ storage: before.storage });
    await after.navigate('/inicio', { backForward: true });
    assert.deepEqual(after.historyReports(), ['back']);
});

test('history moves are only sent while a session is recording', async () => {
    const background = loadBackground({ sessionActive: false });
    for (const url of ['/inicio', '/documento.pdf']) await background.navigate(url);
    await background.navigate('/inicio', { backForward: true });
    assert.deepEqual(background.historyReports(), []);
});

test("the page tells the browser when it moved by itself, and commits the focused field before the browser's moves", async () => {
    const page = loadContentScript();
    page.window.navigation = { currentEntry: { index: 3 } };
    fire(page, 'handleNavigate', { navigationType: 'traverse', userInitiated: false, destination: { index: 2 } });
    page.document.activeElement = fakeField({ value: 'hola' });
    fire(page, 'handleNavigate', { navigationType: 'traverse', userInitiated: true, destination: { index: 2 } });
    fire(page, 'handleNavigate', { navigationType: 'push', userInitiated: true, destination: { index: 4 } });
    await flush();

    assert.deepEqual(plain(page.sent.map(message => message.type === 'EYENAV_REPORT' ? message.endpoint : message.type)),
        ['EYENAV_PAGE_MOVED', '/input-info']);
});

test('the relay passes the select, scroll, drag, key and history reports through', async () => {
    for (const endpoint of ['/select-info', '/scroll-info', '/drag-info', '/key-info', '/history-info']) {
        const background = loadBackground();
        const response = await background.report(endpoint);
        assert.equal(response.success, true, endpoint);
        assert.ok(background.requests.some(r => r.url.endsWith(endpoint)), endpoint);
    }
});

// ------------------------------------------------------------------- replay steps

test('the select step waits for the dropdown, then picks the option by its visible text', async () => {
    const log = [];
    const { steps } = loadStepsWithPage();
    await steps['I select {string} in the dropdown with xpath {string}'].call(
        { driver: makeDriver(log, { renderAfterCalls: 3 }) }, 'Colombia', '//*[@id="country"]');

    assert.deepEqual(names(log), ['waitForExist', 'waitUntil', 'selectByVisibleText']);
    assert.equal(log[2][1], 'Colombia');
});

test('the page scroll step scrolls the window to the recorded position', async () => {
    const log = [];
    const { steps, page } = loadStepsWithPage();
    await steps['I scroll the page to {int},{int}'].call({ driver: makeDriver(log) }, 0, 1200);

    assert.deepEqual(plain(page.calls), [['window.scrollTo', 0, 1200]]);
});

test('the element scroll step waits for the element, then scrolls that element', async () => {
    const log = [];
    const { steps } = loadStepsWithPage();
    await steps['I scroll the element with xpath {string} to {int},{int}'].call(
        { driver: makeDriver(log, { renderAfterCalls: 2 }) }, '//*[@id="list"]', 0, 320);

    assert.deepEqual(names(log), ['waitForExist', 'waitUntil', 'execute', 'element.scrollTo']);
    assert.deepEqual(plain(log[3].slice(1)), [0, 320]);
});

test('the drag step waits for both elements, then drags the first onto the second', async () => {
    const log = [];
    const { steps } = loadStepsWithPage();
    await steps['I drag the element with xpath {string} onto the element with xpath {string}'].call(
        { driver: makeDriver(log) }, '//li[1]', '//li[2]');

    assert.deepEqual(names(log), ['waitForExist', 'waitUntil', 'waitForExist', 'waitUntil', 'dragAndDrop']);
});

test('the new element steps fail with a clear message when the element never appears', async () => {
    const { steps } = loadStepsWithPage();
    const never = () => ({ driver: makeDriver([], { renderAfterCalls: Infinity }) });
    await assert.rejects(steps['I select {string} in the dropdown with xpath {string}'].call(never(), 'A', '//*[@id="ghost"]'),
        /No element found for xpath/);
    await assert.rejects(steps['I scroll the element with xpath {string} to {int},{int}'].call(never(), '//*[@id="ghost"]', 0, 1),
        /No element found for xpath/);
    await assert.rejects(steps['I drag the element with xpath {string} onto the element with xpath {string}'].call(never(), '//a', '//b'),
        /No element found for xpath/);
});

test('the voice scroll steps really scroll the page, down and up', async () => {
    const log = [];
    const { steps, page } = loadStepsWithPage();
    await steps['I scroll down'].call({ driver: makeDriver(log) });
    await steps['I scroll up'].call({ driver: makeDriver(log) });

    assert.deepEqual(plain(page.calls), [['window.scrollBy', 0, 400], ['window.scrollBy', 0, -400]]);
    assert.deepEqual(names(log).filter(n => n === 'pause').length, 2);
});
