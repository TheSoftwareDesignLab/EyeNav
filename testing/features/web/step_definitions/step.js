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
 * Resolves the element an xpath from content.js's getXPath() refers to,
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
 * Waits for an element to actually exist and be visible before a step acts
 * on it, instead of assuming it's already rendered the instant replay
 * reaches that step - a component that loads asynchronously (an XHR-backed
 * list, a modal) may not be there yet even though it was there by the time
 * the original recording session clicked it.
 * @param {WebdriverIO.Element} element
 */
async function waitUntilReady(element) {
    await element.waitForExist({ timeout: ELEMENT_WAIT_TIMEOUT_MS });
    return element.waitForDisplayed({ timeout: ELEMENT_WAIT_TIMEOUT_MS });
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

Given('I set the viewport to {int}x{int}', async function (width, height) {
    // Resizes the OUTER browser window, not the exact content viewport, so
    // the page's actual viewport ends up slightly smaller than width x
    // height (browser chrome takes some of it) - close enough to reproduce
    // the recorded layout, not pixel-perfect.
    return await this.driver.setWindowSize(width, height);
});

Given('I scroll down', async function () {
    return await this.driver.pause(1000);
});

Given('I scroll up', async function () {
    return await this.driver.pause(1000);
});

Given('I go back', async function () {
    this.driver.back();
    return await this.driver.pause(1000);
});

Given('I go forward', async function () {
    this.driver.forward();
    return await this.driver.pause(1000);
});

Given('I hit enter', async function () {
    this.driver.keys('Enter');
    return await this.driver.pause(1000)
});

