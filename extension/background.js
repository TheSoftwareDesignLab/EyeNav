// Shared constants (backend URL, the EYENAV_REPORT message-type string)
// this file and content.js both need to agree on - see shared/config.js.
importScripts('shared/config.js');

// chrome.sidePanel.setPanelBehavior persists per extension independently of
// this code - an earlier version of this extension set openPanelOnActionClick
// to true, and removing that code doesn't undo it. This explicitly resets it
// to false so the toolbar icon opens the popup (see manifest.json's
// action.default_popup), and the side panel only opens when popup.js calls
// chrome.sidePanel.open() after the user picks eye tracking + voice mode.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error(error));

// Relays content.js's calls to the EyeNav backend. content.js runs in the
// context of whatever page it's injected into, and Chrome's Private Network
// Access policy blocks a page-context fetch() to a loopback address like
// localhost:5001 - even with host_permissions for it - with "Permission was
// denied for this request to access the `loopback` address space". The
// background service worker runs in the extension's own context instead
// (not tied to any page's origin), which isn't subject to that restriction,
// so it makes the actual request on content.js's behalf.

// The only endpoints content.js reports to. Anything else is refused here, so
// a relayed message can't reach /start or /stop, or - via an endpoint like
// "@other.host/" - turn the URL below into a request to a different host.
const REPORT_ENDPOINTS = new Set([
  '/tag-info', '/input-info', '/key-info', '/history-info', '/viewport-info', '/select-info', '/scroll-info', '/drag-info',
]);

// content.js runs on every page and reports every click and committed field,
// whether or not a session is recording. Those are only sent once /status
// says a session is active: otherwise they'd go to whatever process happens
// to be listening on the backend's port, recording or not. A "yes" is
// trusted for this long before /status is asked again; a "no" is never
// cached, so the first interaction after Play is not dropped.
const SESSION_ACTIVE_CACHE_MS = 2000;
let sessionActiveUntil = 0;

function isSessionActive() {
  if (Date.now() < sessionActiveUntil) return Promise.resolve(true);
  return fetch(`${EYENAV_BACKEND_URL}/status`)
    .then((response) => (response.ok ? response.json() : null))
    .then((status) => {
      const active = Boolean(status && status.sessionActive);
      sessionActiveUntil = active ? Date.now() + SESSION_ACTIVE_CACHE_MS : 0;
      return active;
    });
}

function relayReportToBackend(message, sendResponse) {
  if (!REPORT_ENDPOINTS.has(message.endpoint)) {
    sendResponse({ success: false, error: `Endpoint not allowed: ${message.endpoint}` });
    return;
  }

  isSessionActive()
    .then((active) => {
      if (!active) {
        // Not an error: the backend would drop it too. Reported as accepted
        // so content.js doesn't log every click outside a session as a failure.
        sendResponse({ success: true, ok: true, data: { status: 'No session is recording' } });
        return;
      }
      return postReport(message, sendResponse);
    })
    .catch((error) => sendResponse({ success: false, error: String(error && error.message || error) }));
}

function postToBackend(endpoint, data) {
  return fetch(`${EYENAV_BACKEND_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((response) => response.json().then((body) => ({ ok: response.ok, data: body })));
}

function postReport(message, sendResponse) {
  return postToBackend(message.endpoint, message.data)
    .then(({ ok, data }) => sendResponse({ success: true, ok, data }))
    .catch((error) => sendResponse({ success: false, error: String(error && error.message || error) }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === EYENAV_MESSAGE_TYPES.PAGE_MOVED) {
    if (sender.tab) pageMovedAt.set(sender.tab.id, Date.now());
    return false;
  }
  if (!message || message.type !== EYENAV_MESSAGE_TYPES.REPORT) return false;

  relayReportToBackend(message, sendResponse);
  return true; // keep the message channel open for the async sendResponse above
});

// ------------------------------------------------ the browser's Back and Forward
//
// A move back or forward through a tab's history is recorded here, where
// every way of asking the browser for it ends up - the toolbar buttons, a
// trackpad swipe, a mouse's side buttons, Cmd+[ / Cmd+], the Back button's
// list - whatever page is being left: a PDF or a page still loading
// included, where content.js can't report anything. Chrome marks such a
// navigation "forward_back" without saying which way it went, so each tab's
// list of visited addresses is kept to tell. content.js says when the page
// made the move itself (history.back() from its own "Back" button), which
// the recorded click that ran it already replays.

// chrome.storage.session keeps the lists while Chrome stops and restarts this
// worker between events, as it does after a few idle seconds.
const TAB_HISTORY_KEY = 'eyenav-tab-history-';

// How long after content.js says the page moved by itself that move is
// expected to reach the browser.
const PAGE_MOVE_GRACE_MS = 3000;

/** tabId -> when its page last moved through its history by itself. */
const pageMovedAt = new Map();

/** tabId -> the promise of its last handled navigation, so they run one at a time. */
const tabQueues = new Map();

function readTabHistory(tabId) {
  const key = TAB_HISTORY_KEY + tabId;
  return chrome.storage.session.get(key).then((stored) => stored[key] || { urls: [], index: -1 });
}

function writeTabHistory(tabId, history) {
  return chrome.storage.session.set({ [TAB_HISTORY_KEY + tabId]: history });
}

/**
 * How many entries a move back or forward to `url` went: negative back,
 * positive forward, to the nearest entry with that address. One step back
 * if it isn't in the list (visited before the extension was watching).
 */
function historyMove(history, url) {
  for (let distance = 1; distance <= history.urls.length; distance++) {
    if (history.urls[history.index - distance] === url) return -distance;
    if (history.urls[history.index + distance] === url) return distance;
  }
  return -1;
}

function reportToBackend(endpoint, data) {
  return isSessionActive()
    .then((active) => active && postToBackend(endpoint, data))
    .catch((error) => console.error(`EyeNav: could not report ${endpoint}:`, error));
}

/**
 * Keeps the tab's list of addresses in step with a navigation, and records
 * it if it was the browser's own Back or Forward.
 * @param {Object} details - a chrome.webNavigation event's details
 */
async function recordHistoryNavigation(details) {
  const history = await readTabHistory(details.tabId);
  const qualifiers = details.transitionQualifiers || [];

  if (!qualifiers.includes('forward_back')) {
    if (details.transitionType !== 'reload') {
      history.urls = history.urls.slice(0, history.index + 1).concat(details.url);
      history.index = history.urls.length - 1;
    }
    return writeTabHistory(details.tabId, history);
  }

  const moved = historyMove(history, details.url);
  const index = history.index + moved;
  if (index >= 0 && index < history.urls.length) {
    history.index = index;
  } else {
    // Moved past what was seen: carry on from here.
    history.urls = [details.url];
    history.index = 0;
  }
  await writeTabHistory(details.tabId, history);

  const pageMovedTime = pageMovedAt.get(details.tabId);
  const movedByPage = pageMovedTime !== undefined && Date.now() - pageMovedTime < PAGE_MOVE_GRACE_MS;
  pageMovedAt.delete(details.tabId);
  if (movedByPage) return;

  const direction = moved < 0 ? 'back' : 'forward';
  for (let step = 0; step < Math.abs(moved); step++) {
    await reportToBackend('/history-info', { direction });
  }
}

function handleHistoryNavigation(details) {
  if (details.frameId !== 0) return Promise.resolve();
  const queued = (tabQueues.get(details.tabId) || Promise.resolve())
    .then(() => recordHistoryNavigation(details))
    .catch((error) => console.error('EyeNav: could not follow a navigation:', error));
  tabQueues.set(details.tabId, queued);
  return queued;
}

// Navigations to another document, and within one (a single-page app's
// pushState, a #fragment) - Back and Forward can go through either.
chrome.webNavigation.onCommitted.addListener(handleHistoryNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleHistoryNavigation);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(handleHistoryNavigation);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabQueues.delete(tabId);
  pageMovedAt.delete(tabId);
  chrome.storage.session.remove(TAB_HISTORY_KEY + tabId);
});
