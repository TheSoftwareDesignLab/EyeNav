chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: toggleTooltip
    });
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

function toggleTooltip() {
    if (window.hasTooltipScript) {
        const tooltip = document.getElementById('hoverTooltip');
        if (tooltip) tooltip.remove();
        window.hasTooltipScript = false;
    } else {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('content.js');
        document.body.appendChild(script);
        window.hasTooltipScript = true;
    }
}
