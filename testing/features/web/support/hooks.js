const { After, Before } = require('@cucumber/cucumber');
const { WebClient } = require('kraken-node');
const environment = require('../../../../environment/launch');

// Under the 30 s each step gets (support.js), so a page that never becomes
// ready fails with the browser's own "Navigation timeout" message.
const NAVIGATION_TIMEOUT_MS = 25 * 1000;

// Replays in the same browser, language and timezone the clean recording
// environment records in (environment/environment.json), so a recording and
// its replay see the same page.
Before(async function() {
  const config = environment.loadEnvironmentConfig();
  this.deviceClient = new WebClient('chrome', environment.replayCapabilities(), this.userId);
  this.driver = await this.deviceClient.startKrakenForUserId(this.userId);

  // Playwright applies these through its locale and timezoneId options when
  // recording; here they go to the page Kraken drives over the DevTools protocol.
  const browser = await this.driver.getPuppeteer();
  const [page] = await browser.pages();
  const session = await page.target().createCDPSession();
  for (const [method, params] of environment.pageSettingsCommands(config)) {
    await session.send(method, params);
  }

  // Kraken's "I navigate to page" (driver.url) and the back/forward steps
  // otherwise wait for every resource of the page to finish loading - ads,
  // analytics, videos - and one slow resource made the step time out on a
  // page that was long usable. They wait for the document itself instead,
  // as the recording environment opens its page; each step after them waits
  // for the element it needs.
  const ready = { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS };
  this.driver.overwriteCommand('url', async (_url, address) => { await page.goto(address, ready); });
  this.driver.overwriteCommand('back', async () => { await page.goBack(ready); });
  this.driver.overwriteCommand('forward', async () => { await page.goForward(ready); });

  // Every command also waits for a page that is still loading after a click
  // (see patches/devtools+7.35.0.patch: until its document is ready). Bounded
  // like the navigations above instead of WebdriverIO's 5 minutes, so a page
  // that never gets there fails its step - and the browser still closes.
  await this.driver.setTimeout({ pageLoad: NAVIGATION_TIMEOUT_MS });
})

After(async function() {
  await this.deviceClient.stopKrakenForUserId(this.userId);
});
