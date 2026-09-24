const { Given, When, Then } = require('@cucumber/cucumber');

Given('I click on tag with href {string}', async function (href) {
    const element = await this.driver.$(`a[href="${href}"]`);
    return await element.click();
});

Given('I click on tag with id {string}', async function (id) {
    const element = await this.driver.$(`#${id}`);
    return await element.click();
});


Given('I click on tag with xpath {string}', async function (xpath) {
    const elements = await this.driver.$$(xpath);
    if (elements[0] == null) {
        return await elements[1].click();
    }
    return await elements[0].click();
});

Given('I input {string}', async function (text) {
    return await this.driver.keys(text);
});

Given('I type {string} into field with xpath {string}', async function (text, xpath) {
    // Same lookup as "I click on tag with xpath" above, and for the same
    // reason: these xpaths come from the same getXPath(), so whatever made
    // $$ + the elements[0] == null fallback necessary there applies here too.
    const elements = await this.driver.$$(xpath);
    const element = elements[0] == null ? elements[1] : elements[0];
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

