// Fallback strings for the keys this file applies before the DOM is fully
// translated, kept separate from panel.js's DEFAULTS since each surface's
// chooser/notice text is specific to it. Merged under whatever the locale
// file actually provides (see below), so a locale missing one of these
// keys degrades to English for just that key instead of an empty element -
// the same guarantee the old hand-written `strings[key] || 'fallback'`
// lines gave per element, now expressed once instead of per element.
const POPUP_DEFAULT_STRINGS = {
    'eyenav-choose-mode': 'Hi! How would you like to interact today?',
    'eyenav-mode-eye-voice-title': 'Eye tracking + Voice',
    'eyenav-mode-eye-voice-subtitle': 'For hands-free use',
    'eyenav-mode-mouse-keyboard-title': 'Mouse + Keyboard',
    'eyenav-mode-mouse-keyboard-subtitle': 'For precise navigation',
    'eyenav-open-side-panel': 'Open side panel',
};

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
    const eyeVoiceActiveText = document.getElementById('eyenav-eye-voice-active');
    const modeError = document.getElementById('mode-error');
    const modeChooserTitle = document.getElementById('mode-chooser-title');
    const eyeVoiceNoticeTitle = document.getElementById('eye-voice-notice-title');
    const panelContentTitle = document.getElementById('panel-content-title');

    let strings = {};

    // Shared with panel.js's initEyeNavPanel (see shared/panel.js) instead
    // of each reimplementing its own fetch-with-fallback and per-element
    // translation pass.
    const localePromise = loadEyeNavLocale(splitLang);

    const statusPromise = fetch(`${EYENAV_BACKEND_URL}/status`)
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
        try {
            // initEyeNavPanel throws if this surface is missing a required
            // element - without this try/catch, that throw happens inside
            // an un-caught Promise.all(...).then() callback (see below) on
            // the status-driven auto-resume path, becoming a silent
            // unhandled promise rejection instead of a visible error.
            initEyeNavPanel(captureMode, knownStatus);
        } catch (error) {
            console.error('Error initializing panel:', error);
            modeError.textContent = strings['failedToStart'] || 'Failed to start session';
            modeError.hidden = false;
            return;
        }
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
        // mergeEyeNavStrings (shared/panel.js), not a plain spread: keeps a
        // default when the locale's own value for that key is falsy (missing,
        // or an empty-string placeholder), instead of letting an empty
        // string through and silently blanking the element.
        strings = mergeEyeNavStrings(POPUP_DEFAULT_STRINGS, localeStrings);

        // These three elements all want the single "eyenav-title" string,
        // so they can't be handled by applyEyeNavTranslations's generic
        // id-matches-key pass below - that only works one-key-to-one-id.
        const title = strings['eyenav-title'] || 'EyeNav';
        modeChooserTitle.textContent = title;
        eyeVoiceNoticeTitle.textContent = title;
        panelContentTitle.textContent = title;

        // Shared with panel.js's initEyeNavPanel: everything else here has
        // an element id matching its locale key one-to-one, so one generic
        // pass replaces the nine individual `el.textContent = strings[key]
        // || 'fallback'` lines this file used to duplicate that logic with.
        applyEyeNavTranslations(strings);

        // If a session is already running, don't show the chooser.
        // mouse_keyboard sessions are driven from here, so reveal the
        // control panel directly. Any other mode (eye_voice today; "all"
        // once mouse/keyboard capturers exist) is driven from the side
        // panel, so just point there instead of also giving the popup its
        // own stop button for it.
        if (status && status.sessionActive && EYENAV_SURFACES.mouse_keyboard.modes.includes(status.captureMode)) {
            showPanel(status.captureMode, status);
        } else if (status && status.sessionActive) {
            eyeVoiceActiveText.textContent = EYENAV_SURFACES.eye_voice.modes.includes(status.captureMode)
                ? (strings['eyenav-eye-voice-active'] || 'An eye tracking + voice session is running.')
                : (strings['eyenav-session-active-unknown-mode'] || 'A session is already running.');
            modeChooser.hidden = true;
            eyeVoiceNotice.hidden = false;
        }
    });
});
