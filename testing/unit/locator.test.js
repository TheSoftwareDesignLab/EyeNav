// Run from the repo root:  node --test testing/unit/*.test.js
//
// extension/locator.js on real pages in Chromium: which locator a click
// records, and that the replay's own lookup for it (XPath, a[href], #id, or
// WebdriverIO's ">>>" shadow lookup) finds that element and nothing else.
// XPath, CSS and shadow DOM have to behave exactly as in a browser for this,
// so it uses the Chromium the clean recording environment installs
// (npm install in environment/), and is skipped without it or without
// testing/'s own npm install.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { read } = require('./support');

const repo = path.join(__dirname, '..', '..');

function loadPlaywright() {
    try {
        const playwright = require(path.join(repo, 'environment', 'node_modules', 'playwright'));
        return fs.existsSync(playwright.chromium.executablePath()) ? playwright : null;
    } catch {
        return null;
    }
}

// The same library WebdriverIO resolves ">>>" selectors with, in its browser build.
const QUERY_SELECTOR_DEEP = path.join(repo, 'testing', 'node_modules', 'query-selector-shadow-dom', 'dist', 'querySelectorShadowDom.js');

const playwright = loadPlaywright();
const skip = !playwright ? 'needs the clean recording environment: run npm install in environment/'
    : !fs.existsSync(QUERY_SELECTOR_DEEP) ? 'needs the replay dependencies: run npm install in testing/'
    : false;

let browser;
let page;

test.before(async () => {
    if (skip) return;
    browser = await playwright.chromium.launch({ channel: 'chromium' });
    page = await browser.newPage();
});

test.after(async () => {
    if (browser) await browser.close();
});

/** Opens `html` with locator.js loaded, recording what each click would report. */
async function open(html) {
    await page.setContent(html);
    await page.addScriptTag({ content: read('extension', 'locator.js') });
    await page.addScriptTag({ path: QUERY_SELECTOR_DEEP });
    await page.evaluate(() => {
        document.addEventListener('click', (event) => {
            window.clicked = clickedElement(event);
            window.recorded = describeClickTarget(window.clicked);
        }, true);
        // A followed link or a submitted form would load another page, and
        // what was recorded with it.
        document.addEventListener('click', (event) => event.preventDefault());
    });
}

/**
 * Clicks `selector` (at `options.position`, if given) the way a user would (Playwright's CSS reaches into open
 * shadow roots too) and returns what EyeNav records, plus whether each
 * replay lookup it recorded lands on the element that was clicked.
 */
async function record(selector, options) {
    await page.click(selector, options);
    return page.evaluate(() => {
        const recorded = window.recorded;
        const onlyMatch = (xpath) => {
            const matches = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return matches.snapshotLength === 1 ? matches.snapshotItem(0) : null;
        };
        const target = recorded.shadowSelector ? window.clicked : outermostHost(window.clicked);
        return {
            ...recorded,
            replayFinds: {
                xpath: recorded.xpath ? onlyMatch(recorded.xpath) === target : null,
                href: recorded.href ? document.querySelector(`a[href="${recorded.href}"]`) === target : null,
                id: recorded.id ? document.querySelector(`#${recorded.id}`) === target : null,
                shadow: recorded.shadowSelector
                    ? querySelectorShadowDom.querySelectorDeep(recorded.shadowSelector) === target : null,
            },
        };
    });
}

test('a click on the text inside a link is recorded on the link, by its href', { skip }, async () => {
    await open(`<nav>
        <a href="/es/la-universidad"><span>La Universidad</span></a>
        <a href="/es/admisiones"><span>Admisiones</span></a>
    </nav>`);
    const click = await record('text=La Universidad');

    assert.equal(click.tagName, 'a');
    assert.equal(click.href, '/es/la-universidad');
    assert.equal(click.xpath, '//a[@href="/es/la-universidad"]');
    assert.deepEqual(click.replayFinds, { xpath: true, href: true, id: null, shadow: null });
});

test('elements a widget injects at the top of the page do not shift the locator', { skip }, async () => {
    // An accessibility widget that inserts 6 divs before the page's own, so
    // the page's elements' absolute paths all start at body/div[7].
    await open(`
        <div class="uwy"></div><div class="uw-guide"></div><div class="uw-guide"></div>
        <div class="uw-guide"></div><div class="uw-guide"></div><div class="uw-tooltip"></div>
        <div class="dialog-off-canvas-main-canvas"><div id="page-wrapper">
            <div class="row"><span class="icon" style="display:inline-block;width:20px;height:20px"></span></div>
            <div class="row"><span class="icon" style="display:inline-block;width:20px;height:20px"></span></div>
        </div></div>`);
    const click = await record('.row:nth-child(2) .icon');
    const absolute = await page.evaluate(() => absoluteXPath(window.clicked));

    assert.equal(click.xpath, '//*[@id="page-wrapper"]/div[2]/span[1]');
    assert.equal(absolute, '/html[1]/body[1]/div[7]/div[1]/div[2]/span[1]');

    // The widget loads one more element: the absolute path now points at the
    // wrong div, the anchored one still at the same span.
    const after = await page.evaluate(({ anchored, absolute }) => {
        document.body.prepend(document.createElement('div'));
        const find = (xpath) => document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        return { anchored: find(anchored) === window.clicked, absolute: find(absolute) === window.clicked };
    }, { anchored: click.xpath, absolute });
    assert.deepEqual(after, { anchored: true, absolute: false });
});

test('ids generated at runtime are not recorded; the visible text is used instead', { skip }, async () => {
    await open('<div class="ad"><button id="skip-button:2">Omitir</button></div>');
    const click = await record('button');

    assert.equal(click.id, null);
    assert.equal(click.xpath, '//button[normalize-space()="Omitir"]');
    assert.equal(click.replayFinds.xpath, true);
});

test('which ids count as generated', { skip }, async () => {
    await open('<p></p>');
    const verdicts = await page.evaluate((ids) => Object.fromEntries(ids.map(id => [id, looksGenerated(id)])), [
        ':r1:', 'skip-button:2', 'ember1234', 'edit-submit--2', 'radix-12', 'a1b2c3d4e5f6', 'id-1697049123',
        'main-content', 'search', 'block-site-main-menu', 'step-2', 'h1-title', 'usercentrics-root',
    ]);
    assert.deepEqual(verdicts, {
        ':r1:': true, 'skip-button:2': true, ember1234: true, 'edit-submit--2': true, 'radix-12': true,
        a1b2c3d4e5f6: true, 'id-1697049123': true,
        'main-content': false, search: false, 'block-site-main-menu': false, 'step-2': false,
        'h1-title': false, 'usercentrics-root': false,
    });
});

test('an id two elements share is not recorded', { skip }, async () => {
    await open('<button id="save">Guardar borrador</button><button id="save">Guardar</button>');
    const click = await record('text="Guardar"');

    assert.equal(click.id, null);
    assert.equal(click.xpath, '//button[normalize-space()="Guardar"]');
    assert.equal(click.replayFinds.xpath, true);
});

test('a link is not recorded by href when an earlier, hidden link has the same one', { skip }, async () => {
    // The href step clicks the FIRST a[href=...]: here the hidden mobile-menu copy.
    await open(`<div hidden><a href="/contacto">Contacto</a></div>
        <footer><a href="/contacto">Contáctenos</a></footer>`);
    const click = await record('footer a');

    assert.equal(click.href, null);
    assert.equal(click.xpath, '//a[normalize-space()="Contáctenos"]');
    assert.equal(click.replayFinds.xpath, true);
});

test('a test id is the first choice for the xpath', { skip }, async () => {
    await open('<form><button data-testid="submit-order" name="go" id="pay">Pagar</button></form>');
    const click = await record('button');

    assert.equal(click.xpath, '//*[@data-testid="submit-order"]');
    assert.equal(click.id, 'pay');
    assert.deepEqual(click.replayFinds, { xpath: true, href: null, id: true, shadow: null });
});

test('a click inside an open shadow root is recorded with a selector that reaches into it', { skip }, async () => {
    // A cookie banner like Usercentrics': the buttons live in the shadow root
    // of a div that is 0 px high, which is all a document-level listener
    // sees as event.target.
    await open('<main><p>Contenido</p></main><div id="usercentrics-root"></div>');
    await page.evaluate(() => {
        document.getElementById('usercentrics-root').attachShadow({ mode: 'open' }).innerHTML = `
            <div class="banner">
                <button data-testid="uc-deny-all-button">Denegar</button>
                <button data-testid="uc-accept-all-button">Aceptar todo</button>
            </div>`;
    });
    const click = await record('button[data-testid="uc-accept-all-button"]');

    assert.equal(click.tagName, 'button');
    assert.equal(click.shadowSelector, 'button[data-testid="uc-accept-all-button"]');
    assert.equal(click.xpath, null);
    assert.deepEqual(click.replayFinds, { xpath: null, href: null, id: null, shadow: true });
});

test('a click on shadow content with nothing stable of its own is anchored to the nearest ancestor that has', { skip }, async () => {
    // The text of such a cookie banner: a <p> and its <span>s, with no
    // attributes, inside a container that has a test id.
    await open('<div id="usercentrics-root"></div>');
    await page.evaluate(() => {
        document.getElementById('usercentrics-root').attachShadow({ mode: 'open' }).innerHTML = `
            <div data-testid="uc-default-banner">
                <div data-testid="uc-message-container">
                    <div style="padding: 10px"><p>La Universidad informa que <span>usa cookies</span></p></div>
                </div>
                <button data-testid="uc-accept-all-button">Aceptar todo</button>
            </div>`;
    });

    const span = await record('[data-testid="uc-message-container"] span');
    assert.equal(span.shadowSelector, 'div[data-testid="uc-message-container"] > div:nth-child(1) > p:nth-child(1) > span:nth-child(1)');
    assert.equal(span.replayFinds.shadow, true);

    const paragraph = await record('[data-testid="uc-message-container"] p');
    assert.equal(paragraph.shadowSelector, 'div[data-testid="uc-message-container"] > div:nth-child(1) > p:nth-child(1)');
    assert.equal(paragraph.replayFinds.shadow, true);

    // The anchor's direct child, not just any first-child div below it: the
    // wrapper and the banner's outer div are both a div:nth-child(1).
    const wrapper = await record('[data-testid="uc-message-container"] > div', { position: { x: 3, y: 3 } });
    assert.equal(wrapper.shadowSelector, 'div[data-testid="uc-message-container"] > div:nth-child(1)');
    assert.equal(wrapper.replayFinds.shadow, true);
});

test('shadow content with no stable ancestor inside its shadow root is anchored to the host', { skip }, async () => {
    await open('<div id="widget-host"></div>');
    await page.evaluate(() => {
        document.getElementById('widget-host').attachShadow({ mode: 'open' }).innerHTML =
            '<style>button { margin: 4px }</style><div><button>A</button><button>B</button></div>';
    });
    const click = await record('#widget-host button:nth-child(2)');

    assert.equal(click.shadowSelector, 'div[id="widget-host"] > div:nth-child(2) > button:nth-child(2)');
    assert.equal(click.replayFinds.shadow, true);
});

test('a click in a shadow root whose host has nothing stable either falls back to the host', { skip }, async () => {
    await open('<section><div class="widget"></div></section>');
    await page.evaluate(() => {
        document.querySelector('.widget').attachShadow({ mode: 'open' }).innerHTML = '<button>X</button>';
    });
    const click = await record('.widget button');

    assert.equal(click.shadowSelector, null);
    assert.equal(click.tagName, 'div');
    assert.equal(click.xpath, '/html[1]/body[1]/section[1]/div[1]');
    assert.equal(click.replayFinds.xpath, true);
});

test('an icon inside a button is a click on the button; an SVG outside one gets an xpath that finds it', { skip }, async () => {
    await open(`
        <button aria-label="Cerrar"><svg width="16" height="16"><path d="M0 0L16 16"/></svg></button>
        <div id="chart"><svg width="40" height="40"><circle cx="20" cy="20" r="20"/></svg></div>`);

    const button = await record('button svg');
    assert.equal(button.tagName, 'button');
    assert.equal(button.xpath, '//button[@aria-label="Cerrar"]');
    assert.equal(button.replayFinds.xpath, true);

    const circle = await record('circle');
    assert.equal(circle.xpath, '//*[@id="chart"]/*[local-name()="svg"][1]/*[local-name()="circle"][1]');
    assert.equal(circle.replayFinds.xpath, true);
});

test('fields typed into get the same stable locators', { skip }, async () => {
    await open(`<form><input name="q" type="search"><input placeholder="Correo" type="email">
        <textarea aria-label="Comentario"></textarea></form>`);
    const xpaths = await page.evaluate(() => [...document.querySelectorAll('input, textarea')].map(getXPath));

    assert.deepEqual(xpaths, ['//input[@name="q"]', '//input[@placeholder="Correo"]', '//textarea[@aria-label="Comentario"]']);
});
