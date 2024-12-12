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

