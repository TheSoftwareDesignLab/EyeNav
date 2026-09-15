// chrome.sidePanel.setPanelBehavior persists per extension independently of
// this code - an earlier version of this extension set openPanelOnActionClick
// to true, and removing that code doesn't undo it. This explicitly resets it
// to false so the toolbar icon opens the popup (see manifest.json's
// action.default_popup), and the side panel only opens when popup.js calls
// chrome.sidePanel.open() after the user picks eye tracking + voice mode.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error(error));
