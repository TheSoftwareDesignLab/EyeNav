const { Given, When, Then } = require('@cucumber/cucumber');

// TODO input

Given('I click on tag with selector a with href {string}', async function (href) {
    const element = await this.driver.$(`a[href="${href}"]`);
    // await element.waitForClickable({ timeout: 5000 });
    return await element.click();
});

Given('I click on tag with selector {string} with id {string}', async function (selector, id) {
    const element = await this.driver.$(`${selector}[id="${id}"]`);
    await element.waitForClickable({ timeout: 5000 });
    return await element.click();
});

Given('I click on tag with xpath {string}', async function (xpath) {
    const elements = await this.driver.$$(xpath);
    await elements[0].waitForClickable({ timeout: 5000 });
    return await elements[0].click();
});

Given('I input {string}', async function (text) {
    return await this.driver.keys(text);
});

Given('I scroll {string} {string}', async function (direction, units) {
    return await this.driver.executeScript(`window.scrollBy(0, ${direction === 'down' ? 1 : -1} * ${units})`);
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

// TODO go down and up
