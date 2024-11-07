const { Given, When, Then } = require('@cucumber/cucumber');


// Given('I click on tag with xpath {string}', async function (xpath) {
//     const element = await this.driver.$(xpath);
//     return await element.click();
// });

// TODO input

Given('I click on tag with href {string}', async function (href) {
    await this.driver.refresh();
    const element = await this.driver.$(`a[href="${href}"]`);
    return await element.click();
});

Given('I go back', async function () {
    await this.driver.refresh();
    return await this.driver.back();
});

Given('I go forward', async function () {
    await this.driver.refresh();
    return await this.driver.forward();
});

// TODO go down and up
