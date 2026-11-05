const { Given, When, Then } = require('@cucumber/cucumber');

// How long a step waits for its target to exist and be visible. Explicit
// instead of WebdriverIO's default (5 s), which is short for the very case
// these waits exist for: a component filled in by a slow request.
const ELEMENT_WAIT_TIMEOUT_MS = 15000;

/**
 * Picks the element an xpath refers to from a $$ result. $$ can occasionally
 * match a decoy before the real one (e.g. a hidden duplicate some frameworks
 * render), so this falls back to elements[1] instead of assuming elements[0]
 * is always correct.
 */
function pickXpathElement(elements) {
    return elements[0] == null ? elements[1] : elements[0];
}

/**
 * Resolves the element an xpath from getXPath() (extension/locator.js) refers to,
 * waiting for it to appear first. $$ never waits - on an element that has
 * not rendered yet it returns [] - so without this wait, an element filled
 * in asynchronously made every xpath-based step fail at once with an opaque
 * "Cannot read properties of undefined" instead of waiting for it.
 * @param {WebdriverIO.Browser} driver
 * @param {string} xpath
 */
async function resolveXpathElement(driver, xpath) {
    await driver.waitUntil(
        async () => pickXpathElement(await driver.$$(xpath)) != null,
        { timeout: ELEMENT_WAIT_TIMEOUT_MS, timeoutMsg: `No element found for xpath ${xpath}` }
    );
    return pickXpathElement(await driver.$$(xpath));
}

/**
 * Whether an element is visible the way Playwright defines it: it takes up
 * space on the page and isn't visibility: hidden (display: none leaves it no
 * size). Unlike WebdriverIO's isDisplayed(), a transparent element
 * (opacity: 0) counts, because it still takes clicks and the recorded click
 * landed on it: a carousel's arrows before the mouse is over the carousel,
 * an accordion's "+" once its item is open, the real input under a styled
 * checkbox. Element commands, so WebdriverIO re-finds an element the page
 * re-rendered in the meantime.
 * @param {WebdriverIO.Element} element
 */
async function isRendered(element) {
    const { width, height } = await element.getSize();
    if (!(width > 0 && height > 0)) return false;
    return (await element.getCSSProperty('visibility')).value === 'visible';
}

/**
 * Waits for an element to actually exist and be visible before a step acts
 * on it, instead of assuming it's already rendered the instant replay
 * reaches that step - a component that loads asynchronously (an XHR-backed
 * list, a modal) may not be there yet even though it was there by the time
 * the original recording session clicked it.
 * @param {WebdriverIO.Element} element
 */
async function waitUntilReady(element) {
    await element.waitForExist({ timeout: ELEMENT_WAIT_TIMEOUT_MS });
    return element.waitUntil(() => isRendered(element), {
        timeout: ELEMENT_WAIT_TIMEOUT_MS,
        timeoutMsg: `element (${element.selector}) still not visible after ${ELEMENT_WAIT_TIMEOUT_MS}ms`,
    });
}

/**
 * Resolves a selector for an element inside a shadow root (a cookie banner,
 * a web component), recorded by getShadowSelector in extension/locator.js.
 * WebdriverIO's ">>>" prefix looks it up through every open shadow root,
 * which neither XPath nor a plain CSS selector can reach into. Waits for it
 * like every other step does.
 * @param {WebdriverIO.Browser} driver
 * @param {string} selector
 */
async function resolveShadowElement(driver, selector) {
    const element = await driver.$(`>>>${selector}`);
    await waitUntilReady(element);
    return element;
}

Given('I click on tag with href {string}', async function (href) {
    const element = await this.driver.$(`a[href="${href}"]`);
    await waitUntilReady(element);
    return await element.click();
});

Given('I click on tag with id {string}', async function (id) {
    const element = await this.driver.$(`#${id}`);
    await waitUntilReady(element);
    return await element.click();
});


Given('I click on tag with xpath {string}', async function (xpath) {
    const element = await resolveXpathElement(this.driver, xpath);
    await waitUntilReady(element);
    return await element.click();
});

/**
 * Scrolls the target element into view before the click step that follows
 * it tries to act on it - feature_writer.py emits this ahead of every click
 * event that has an xpath, so a target below the fold (or anywhere outside
 * the current viewport) gets scrolled to instead of the click silently
 * acting on whatever happened to be at that screen position.
 */
Given('I scroll until I can see the element with xpath {string}', async function (xpath) {
    const element = await resolveXpathElement(this.driver, xpath);
    await waitUntilReady(element);
    // Centered, not wdio's default (aligned to the top edge): a sticky or
    // fixed header would sit on top of a target scrolled to the top, and the
    // click that follows would be intercepted by it.
    return await element.scrollIntoView({ block: 'center', inline: 'center' });
});

Given('I scroll until I can see the element with shadow selector {string}', async function (selector) {
    const element = await resolveShadowElement(this.driver, selector);
    return await element.scrollIntoView({ block: 'center', inline: 'center' });
});

Given('I click on tag with shadow selector {string}', async function (selector) {
    const element = await resolveShadowElement(this.driver, selector);
    return await element.click();
});

Given('I select {string} in the dropdown with xpath {string}', async function (optionText, xpath) {
    const element = await resolveXpathElement(this.driver, xpath);
    await waitUntilReady(element);
    // By visible text, as recorded: it reads the same in the .feature as on the
    // page, and survives an option's value being renumbered.
    return await element.selectByVisibleText(optionText);
});

Given('I scroll the page to {int},{int}', async function (x, y) {
    return await this.driver.execute((left, top) => window.scrollTo(left, top), x, y);
});

Given('I scroll the element with xpath {string} to {int},{int}', async function (xpath, x, y) {
    const element = await resolveXpathElement(this.driver, xpath);
    await waitUntilReady(element);
    return await this.driver.execute((el, left, top) => el.scrollTo(left, top), element, x, y);
});

Given('I drag the element with xpath {string} onto the element with xpath {string}', async function (sourceXpath, targetXpath) {
    const source = await resolveXpathElement(this.driver, sourceXpath);
    await waitUntilReady(source);
    const target = await resolveXpathElement(this.driver, targetXpath);
    await waitUntilReady(target);
    return await source.dragAndDrop(target);
});

Given('I input {string}', async function (text) {
    return await this.driver.keys(text);
});

Given('I type {string} into field with xpath {string}', async function (text, xpath) {
    const element = await resolveXpathElement(this.driver, xpath);
    await waitUntilReady(element);
    await element.click();
    // Without this, replaying into a field that already has content
    // (autofill, a default value) appends instead of matching what was
    // actually recorded.
    await element.clearValue();
    return await this.driver.keys(text);
});

/**
 * Makes the page exactly width x height (content.js records innerWidth x
 * innerHeight) by resizing the browser window around it, as the recording
 * browser's window holds its page. WebdriverIO's setWindowSize, over the
 * DevTools protocol Kraken uses, emulates a page of that size inside an
 * unchanged window instead: the page sits in a corner of a bigger window
 * (or is cut off by a smaller one) and renders at a pixel density of 1, not
 * the screen's - not what the recording saw. Only if the screen can't fit
 * the window is the size emulated, at the screen's own density.
 * @param {WebdriverIO.Browser} driver
 * @param {number} width
 * @param {number} height
 */
async function setPageSize(driver, width, height) {
    const [page] = await (await driver.getPuppeteer()).pages();
    const session = await page.target().createCDPSession();
    await session.send('Emulation.clearDeviceMetricsOverride');
    const { windowId } = await session.send('Browser.getWindowForTarget');
    for (let attempt = 0; attempt < 3; attempt++) {
        const size = await driver.execute(() => ({ innerWidth, innerHeight, outerWidth, outerHeight }));
        if (size.innerWidth === width && size.innerHeight === height) return;
        // The window is the page plus the browser's own bars, which the difference measures.
        await session.send('Browser.setWindowBounds', {
            windowId,
            bounds: { width: width + size.outerWidth - size.innerWidth, height: height + size.outerHeight - size.innerHeight },
        });
        await driver.pause(200);
    }
    const deviceScaleFactor = await driver.execute(() => devicePixelRatio);
    await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
}

Given('I set the viewport to {int}x{int}', async function (width, height) {
    return await setPageSize(this.driver, width, height);
});

// A voice "scroll" is recorded as a direction only (pyautogui's 10 wheel clicks),
// not a distance, so the replay scrolls a fixed, roughly equivalent amount.
const VOICE_SCROLL_PIXELS = 400;

async function scrollBy(driver, pixels) {
    await driver.execute((distance) => window.scrollBy(0, distance), pixels);
    // Lets a smooth scroll finish and anything it loads (lazy images, infinite lists) start.
    return await driver.pause(500);
}

Given('I scroll down', async function () {
    return await scrollBy(this.driver, VOICE_SCROLL_PIXELS);
});

Given('I scroll up', async function () {
    return await scrollBy(this.driver, -VOICE_SCROLL_PIXELS);
});

Given('I go back', async function () {
    await this.driver.back();
    return await this.driver.pause(1000);
});

Given('I go forward', async function () {
    await this.driver.forward();
    return await this.driver.pause(1000);
});

Given('I hit enter', async function () {
    await this.driver.keys('Enter');
    return await this.driver.pause(1000);
});

