const { Given, When, Then } = require('@cucumber/cucumber');



Given(/^I set the viewport to (\d+)x(\d+)$/, async function (width, height) {
    const targetWidth = parseInt(width, 10);
    const targetHeight = parseInt(height, 10);

    const screenSize = await this.driver.execute(() => {
        return {
            width: window.screen.availWidth,
            height: window.screen.availHeight
        };
    });
    
    await this.driver.setWindowSize(screenSize.width, screenSize.height);
    await this.driver.pause(500); 

    
    const currentViewportSize = await this.driver.execute(() => {
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    });

    
    const currentWindowSize = await this.driver.getWindowSize();

   
    const chromeWidth = currentWindowSize.width - currentViewportSize.width;
    const chromeHeight = currentWindowSize.height - currentViewportSize.height;

    
    await this.driver.setWindowSize(targetWidth + chromeWidth, targetHeight + chromeHeight);
    await this.driver.pause(500); 
});


Given('I set zoom ratio to {float}', async function (ratio) {
  
    const zoomLevel = parseFloat(ratio); 
   
    await this.driver.execute((level) => {
        document.body.style.zoom = level;
    }, zoomLevel);
    await this.driver.pause(500); 
    console.log(`Zoom ratio set to: ${zoomLevel}`);
    return;
});


Given('I click on element with xpath {string}', async function (xpath) {
    const el = await this.driver.$(xpath);
    await el.waitForClickable({ timeout: 60000 }); 
    await el.click();
    await this.driver.pause(300);
    return;
});

Given('I type {string} into field with xpath {string}', async function (text, xpath) {
    const el = await this.driver.$(xpath);
    await el.waitForClickable({ timeout: 60000 }); 
    try { await el.clearValue(); } catch (e) {  }
    await el.setValue(text);
    await this.driver.pause(200);
    return;
});

Given('I press the {string} key on element with xpath {string}', async function (key, xpath) {
    const el = await this.driver.$(xpath);
    await el.waitForClickable({ timeout: 60000 }); 
    await el.click(); 
    await this.driver.keys([key]);
    await this.driver.pause(300);
    return;
});

Given('I go back', async function () {
    await this.driver.back();
    await this.driver.pause(500);
    return;
});

Given('I go forward', async function () {
    await this.driver.forward();
    await this.driver.pause(500);
    return;
});