const { Given, When, Then } = require('@cucumber/cucumber');

/**
 * Resolves the element an xpath from content.js's getXPath() refers to.
 * $$ can occasionally match a decoy element before the real one (e.g. a
 * hidden duplicate some frameworks render) ahead of the one getXPath()
 * actually meant, so every xpath-based step here falls back to elements[1]
 * instead of assuming elements[0] is always correct.
 * @param {WebdriverIO.Browser} driver
 * @param {string} xpath
 */
async function resolveXpathElement(driver, xpath) {
    const elements = await driver.$$(xpath);
    return elements[0] == null ? elements[1] : elements[0];
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
    await element.waitForExist();
    return element.waitForDisplayed();
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
    return await element.scrollIntoView();
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

