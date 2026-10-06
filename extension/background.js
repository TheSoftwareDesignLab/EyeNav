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
const REPORT_ENDPOINTS = new Set(['/tag-info', '/input-info', '/viewport-info']);

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

function postReport(message, sendResponse) {
  return fetch(`${EYENAV_BACKEND_URL}${message.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.data),
  })
    .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
    .then(({ ok, data }) => sendResponse({ success: true, ok, data }))
    .catch((error) => sendResponse({ success: false, error: String(error && error.message || error) }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== EYENAV_MESSAGE_TYPES.REPORT) return false;

  relayReportToBackend(message, sendResponse);
  return true; // keep the message channel open for the async sendResponse above
});
