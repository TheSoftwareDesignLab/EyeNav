document.addEventListener('DOMContentLoaded', function () {
    const userLang = navigator.language || 'en';
    document.documentElement.setAttribute('lang', userLang);
    const splitLang = userLang.split('-')[0];

    const modeChooser = document.getElementById('mode-chooser');
    const panelContent = document.getElementById('panel-content');
    const eyeVoiceNotice = document.getElementById('eye-voice-notice');
    const eyeVoiceButton = document.getElementById('mode-eye-voice');
    const mouseKeyboardButton = document.getElementById('mode-mouse-keyboard');
    const openSidePanelButton = document.getElementById('open-side-panel-button');
    const chooseModeText = document.getElementById('eyenav-choose-mode');
    const eyeVoiceActiveText = document.getElementById('eyenav-eye-voice-active');
    const modeError = document.getElementById('mode-error');

    let strings = {};

    const localePromise = fetch(`../locales/${splitLang}.json`)
        .then(response => {
            if (!response.ok) throw new Error('Locale not found');
            return response.json();
        })
        .catch(() => fetch('../locales/en.json').then(res => res.json()));

    const statusPromise = fetch('http://localhost:5001/status')
        .then(response => response.json())
        .catch(() => null); // server unreachable - let the chooser show as usual

    /**
     * Reveal the play-button panel and start it in the given capture mode.
     * @param {Object} [knownStatus] - a /status response already fetched,
     *   so the panel doesn't fetch it again right after this.
     */
    function showPanel(captureMode, knownStatus) {
        modeChooser.hidden = true;
        eyeVoiceNotice.hidden = true;
        panelContent.hidden = false;
        initEyeNavPanel(captureMode, knownStatus);
        document.getElementById('play-button').focus();
    }

    /**
     * Eye tracking + voice runs in the side panel, not the popup, so it
     * stays visible while the user looks at and clicks on the page - a
     * popup closes the instant it loses focus, which would hide it.
     */
    function openSidePanelAndClose() {
        modeError.hidden = true;
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.sidePanel.open({ windowId: tabs[0].windowId })
                .then(() => window.close())
                .catch(error => {
                    console.error('Error opening side panel:', error);
                    modeError.textContent = strings['failedToOpenSidePanel'] || 'Failed to open the side panel.';
                    modeError.hidden = false;
                });
        });
    }

    eyeVoiceButton.addEventListener('click', openSidePanelAndClose);
    openSidePanelButton.addEventListener('click', openSidePanelAndClose);

    // Mouse + keyboard has no live voice feedback to keep visible, so the
    // popup is enough: start/stop it, then close and reopen the popup later.
    mouseKeyboardButton.addEventListener('click', function () {
        showPanel('mouse_keyboard');
    });

    // Wait for translations AND status together, so whichever view we land
    // on (chooser, notice, or panel) never briefly renders with blank text.
    Promise.all([localePromise, statusPromise]).then(([localeStrings, status]) => {
        strings = localeStrings;
        chooseModeText.textContent = strings['eyenav-choose-mode'] || 'How do you want to interact?';
        eyeVoiceButton.textContent = strings['eyenav-mode-eye-voice'] || 'Eye tracking + Voice';
        mouseKeyboardButton.textContent = strings['eyenav-mode-mouse-keyboard'] || 'Mouse + Keyboard';
        openSidePanelButton.textContent = strings['eyenav-open-side-panel'] || 'Open side panel';

        // If a session is already running, don't show the chooser.
        // mouse_keyboard sessions are driven from here, so reveal the
        // control panel directly. Any other mode (eye_voice today; "all"
        // once mouse/keyboard capturers exist) is driven from the side
        // panel, so just point there instead of also giving the popup its
        // own stop button for it.
        if (status && status.sessionActive && status.captureMode === 'mouse_keyboard') {
            showPanel(status.captureMode, status);
        } else if (status && status.sessionActive) {
            eyeVoiceActiveText.textContent = status.captureMode === 'eye_voice'
                ? (strings['eyenav-eye-voice-active'] || 'An eye tracking + voice session is running.')
                : (strings['eyenav-session-active-unknown-mode'] || 'A session is already running.');
            modeChooser.hidden = true;
            eyeVoiceNotice.hidden = false;
        }
    });
});
