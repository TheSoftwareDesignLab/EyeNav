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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'EYENAV_REPORT') return false;

  fetch(`http://localhost:5001${message.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.data),
  })
    .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
    .then(({ ok, data }) => sendResponse({ success: true, ok, data }))
    .catch((error) => sendResponse({ success: false, error: String(error && error.message || error) }));

  return true; // keep the message channel open for the async sendResponse above
});
