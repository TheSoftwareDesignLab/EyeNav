document.addEventListener('DOMContentLoaded', function () {
    const MODE_KEYBOARD_MOUSE = 'keyboard-mouse';
    const MODE_EYE_VOICE = 'eye-voice';
    const DEFAULT_MODE = MODE_KEYBOARD_MOUSE;

    const userLang = navigator.language || 'en';
    document.documentElement.setAttribute('lang', userLang);

    const splitLang = userLang.split('-')[0];
    const language = splitLang === 'en' ? 'en-us' : (splitLang === 'es' ? 'es' : splitLang);
    const localePath = `../locales/${splitLang}.json`;

    const alertBelowButton = document.getElementById('alert-below-button');
    const playButton = document.getElementById('play-button');
    const filePathInput = document.getElementById('file-path-input');
    const titleElement = document.getElementById('eyenav-title-popup');
    const openSidePanelLink = document.getElementById('open-side-panel');
    const advancedModeToggle = document.getElementById('advanced-mode-toggle');
    const advancedModeHelp = document.getElementById('advanced-mode-help');

    let strings = {};
    let preferredMode = DEFAULT_MODE;
    let eyeVoiceAvailable = true;

    fetch(localePath)
        .then(response => {
            if (!response.ok) {
                throw new Error('Locale not found');
            }
            return response.json();
        })
        .catch(() => fetch('../sidepanel/locales/en.json').then(res => res.json()))
        .then(async localeData => {
            strings = localeData;
            applyTranslations(strings);
            titleElement.innerHTML = strings['eyenav-title-popup'] || 'Recording';

            const storage = await chrome.storage.local.get(['isRecording', 'preferredMode']);
            preferredMode = storage.preferredMode || DEFAULT_MODE;
            if (!storage.preferredMode) {
                await chrome.storage.local.set({ preferredMode: DEFAULT_MODE });
            }

            advancedModeToggle.checked = preferredMode === MODE_EYE_VOICE;
            updateModeHelp();

            if (storage.isRecording) {
                restoreStopButtonState();
            } else {
                await checkServerStatus();
            }
        });

    chrome.runtime.sendMessage({ action: 'closeSidePanel' }, () => {
    });

    playButton.setAttribute('listener', 'start');

    playButton.addEventListener('click', async () => {
        playButton.disabled = true;

        if (playButton.getAttribute('listener') === 'start') {
            await startSession();
        } else {
            await stopSession();
        }
    });

    advancedModeToggle.addEventListener('change', async () => {
        preferredMode = advancedModeToggle.checked ? MODE_EYE_VOICE : MODE_KEYBOARD_MOUSE;
        await chrome.storage.local.set({ preferredMode });
        updateModeHelp();
        await checkServerStatus();
    });

    openSidePanelLink.addEventListener('click', (event) => {
        event.preventDefault();

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length > 0 && tabs[0].windowId) {
                chrome.sidePanel.open({ windowId: tabs[0].windowId }, () => window.close());
            } else {
                chrome.sidePanel.open({}, () => window.close());
            }
        });
    });

    function applyTranslations(translations) {
        for (const key in translations) {
            const element = document.getElementById(key);
            if (element) {
                element.innerHTML = translations[key];
            }
        }
    }

    function disablePlayButton() {
        playButton.disabled = true;
        playButton.style.backgroundColor = 'gray';
    }

    function enablePlayButton() {
        playButton.disabled = false;
        playButton.style.backgroundColor = 'black';
    }

    function restoreStopButtonState() {
        alertBelowButton.textContent = strings['sessionStarted'] || 'Session started.';
        playButton.innerHTML = '<span style="font-size: 24px;">&#9632;</span>';
        playButton.setAttribute('listener', 'stop');
        enablePlayButton();
    }

    function updateModeHelp() {
        if (preferredMode === MODE_EYE_VOICE) {
            advancedModeHelp.textContent = strings['mode-enabled-eye-voice'] || 'Advanced eye and voice mode selected.';
        } else {
            advancedModeHelp.textContent = strings['mode-enabled-keyboard-mouse'] || 'Default mode: keyboard and mouse recording.';
        }
    }

    async function startSession() {
        let activeTab;
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                throw new Error('Could not get active tab ID.');
            }
        } catch (error) {
            alertBelowButton.textContent = 'Error: Could not access active tab.';
            playButton.disabled = false;
            return;
        }

        const currentMode = preferredMode || DEFAULT_MODE;
        if (currentMode === MODE_EYE_VOICE && !eyeVoiceAvailable) {
            alertBelowButton.textContent = strings['eye-voice-unavailable'] || 'Eye and voice mode is unavailable. Install optional dependencies first.';
            alertBelowButton.style.color = 'red';
            playButton.disabled = false;
            return;
        }

        const customFilePath = filePathInput.value.trim();
        const pageDetails = {
            pageName: activeTab.title,
            pageUrl: activeTab.url,
            mode: currentMode,
            filePath: customFilePath,
        };

        try {
            const response = await fetch('http://localhost:5001/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Language': language },
                body: JSON.stringify(pageDetails),
            });

            const responseData = await response.json();
            if (!response.ok) {
                throw new Error(responseData.error || responseData.status || `Server responded with status: ${response.status}`);
            }

            await chrome.storage.local.set({ isRecording: true, mode: currentMode, preferredMode: currentMode });

            await chrome.tabs.sendMessage(activeTab.id, {
                action: 'startSession',
                mode: currentMode,
            });

            window.close();
        } catch (error) {
            alertBelowButton.textContent = error.message || strings['failedToStart'] || 'Failed to start. Server running?';
            alertBelowButton.style.color = 'red';
            await chrome.storage.local.set({ isRecording: false, mode: null });
            playButton.disabled = false;
        }
    }

    async function stopSession() {
        try {
            const response = await fetch('http://localhost:5001/stop');
            if (!response.ok) {
                throw new Error('Server stop request failed');
            }
            await response.json();
        } catch (error) {
            console.warn('EYENAV: (Popup) Error stopping session server-side:', error);
        }

        try {
            await chrome.storage.local.set({ isRecording: false, mode: null });

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].id) {
                await chrome.tabs.sendMessage(tabs[0].id, { action: 'stopSession' });
            }

            window.close();
        } catch (extError) {
            alertBelowButton.textContent = strings['failedToStop'] || 'Failed to stop session.';
            playButton.disabled = false;
        }
    }

    async function checkServerStatus() {
        try {
            const response = await fetch('http://localhost:5001/status');
            if (!response.ok) {
                throw new Error('Server not reachable');
            }

            const statusData = await response.json();
            const eyeVoiceCapabilities = (statusData.capabilities || {})[MODE_EYE_VOICE] || {};
            eyeVoiceAvailable = Boolean(eyeVoiceCapabilities.available);

            const result = await chrome.storage.local.get('isRecording');
            if (!result.isRecording) {
                if (preferredMode === MODE_EYE_VOICE && !eyeVoiceAvailable) {
                    alertBelowButton.textContent = strings['eye-voice-unavailable'] || 'Eye and voice mode is unavailable. Install optional dependencies first.';
                    alertBelowButton.style.color = 'red';
                    disablePlayButton();
                } else {
                    alertBelowButton.textContent = strings['eyenav-start-k-m-session'] || 'Start recording session';
                    alertBelowButton.style.color = 'black';
                    enablePlayButton();
                }
            } else {
                enablePlayButton();
            }
        } catch (error) {
            alertBelowButton.textContent = strings['eyenav-ensure-server-running'] || 'Ensure the server is running';
            alertBelowButton.style.color = 'red';
            disablePlayButton();
        }
    }
});