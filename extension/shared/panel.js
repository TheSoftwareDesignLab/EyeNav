/**
 * Loads a surface's locale strings, falling back to English if the
 * detected language has no locale file of its own. Shared by
 * initEyeNavPanel below and popup.js's mode chooser, so there's one
 * implementation of "load a locale JSON with a fallback" instead of two.
 * @param {string} splitLang - two-letter language code (e.g. 'en', 'es')
 * @returns {Promise<Object>} the loaded (or fallback) strings
 */
function loadEyeNavLocale(splitLang) {
    return fetch(`../locales/${splitLang}.json`)
        .then(response => {
            if (!response.ok) throw new Error('Locale not found');
            return response.json();
        })
        .catch(() => {
            console.warn('Falling back to English locale');
            return fetch('../locales/en.json').then(res => res.json());
        });
}

/**
 * Locale keys whose value intentionally contains markup (currently just the
 * <strong> tags in the side panel's "how to type" instructions) and must be
 * rendered as HTML. Every other key is treated as plain text - the safer
 * default, and what every other translated label actually needs; only this
 * key needs anything else.
 * @type {Set<string>}
 */
const EYENAV_RICH_TEXT_KEYS = new Set(['eyenav-input-desc']);

/**
 * Maps a two-letter browser language code to the voice-recognition language
 * code commands.json/voice_control.py expect. Any code with no special-cased
 * entry here is passed through as-is (e.g. 'fr' stays 'fr').
 * @type {Object<string, string>}
 */
const EYENAV_VOICE_LANGUAGE_MAP = { en: 'en-us' };

/**
 * Sets every element whose id matches a locale key to that key's string.
 * Shared by initEyeNavPanel and popup.js's mode chooser. An element whose
 * id doesn't correspond one-to-one with a locale key (e.g. popup.js has
 * three different title elements that all want the single "eyenav-title"
 * string) is left for the caller to assign directly.
 *
 * A falsy value (missing key, or an explicit empty-string placeholder in an
 * incomplete locale file) is skipped rather than applied - this is the one
 * place that protection needs to live, since it's the actual assignment
 * point both initEyeNavPanel's own locale pass AND popup.js's mode-chooser
 * pass go through; relying on each *caller* to pre-filter (as
 * mergeEyeNavStrings does for popup.js's defaults) left initEyeNavPanel's
 * own pass - which doesn't go through mergeEyeNavStrings at all - unprotected.
 * @param {Object} strings
 */
function applyEyeNavTranslations(strings) {
    for (const key in strings) {
        if (!strings[key]) continue;
        const element = document.getElementById(key);
        if (!element) continue;
        if (EYENAV_RICH_TEXT_KEYS.has(key)) {
            element.innerHTML = strings[key];
        } else {
            element.textContent = strings[key];
        }
    }
}

/**
 * Merges loaded locale strings over a set of hardcoded defaults, keeping the
 * default for any key the locale left falsy (missing, or an empty-string
 * placeholder) instead of letting it through - a plain object spread would
 * let an empty string in the loaded locale silently blank out an element
 * that would otherwise show readable fallback text.
 * @param {Object} defaults
 * @param {Object} loaded
 * @returns {Object}
 */
function mergeEyeNavStrings(defaults, loaded) {
    const merged = { ...defaults };
    for (const key in loaded) {
        if (loaded[key]) {
            merged[key] = loaded[key];
        }
    }
    return merged;
}

/**
 * Shared control-panel logic used by both the popup (mouse_keyboard) and the
 * side panel (eye_voice) surfaces: translations, session start/stop, server
 * status, and the live WebSocket voice-command visualization.
 * @param {string} captureMode - the capture mode this surface starts sessions in
 * @param {Object} [knownStatus] - a /status response the caller already
 *   fetched (e.g. the popup, to decide whether to show the mode chooser),
 *   so this doesn't fetch /status a second time
 */
function initEyeNavPanel(captureMode, knownStatus) {
    const userLang = navigator.language || 'en';
    document.documentElement.setAttribute('lang', userLang);
    console.log('EYENAV: User language detected:', userLang);

    const splitLang = userLang.split('-')[0];
    const language = EYENAV_VOICE_LANGUAGE_MAP[splitLang] || splitLang;
    const commandsPath = '../commands.json';

    // DOM elements. alert-below-button and play-button are required on every
    // surface this file drives - failing fast here beats a confusing
    // "Cannot set properties of null" several calls deep the first time
    // either is renamed or missing. nlp-command is genuinely optional (the
    // mouse_keyboard popup has no live voice-command visualization to show),
    // so it alone is allowed to be null and is checked at each use below.
    const alertBelowButton = document.getElementById('alert-below-button');
    const voiceCommand = document.getElementById('nlp-command');
    const playButton = document.getElementById('play-button');

    if (!alertBelowButton || !playButton) {
        throw new Error('EyeNav panel.js: this surface is missing #alert-below-button or #play-button');
    }

    let strings = {};
    let language_config = {};

    // Promises
    const localePromise = loadEyeNavLocale(splitLang);

    const commandsPromise = fetch(commandsPath)
        .then(response => {
            if (!response.ok) throw new Error('Commands config not found');
            return response.json();
        })
        .catch((err) => {
            console.error('Commands config error:', err);
            return { "en": {}, "es": {} };
        });

    // Wait for both locale + config, then run your logic
    Promise.all([localePromise, commandsPromise]).then(([localeData, configData]) => {
        strings = localeData;
        language_config = configData;
        alertBelowButton.textContent = strings['eyenav-ensure-server-running'] || "Ensure the server is running";
        if (voiceCommand) {
            voiceCommand.textContent = strings['initial-nlp-command'] || "Recognized voice commands will appear here";
        }

        applyEyeNavTranslations(strings);
        // Only the surfaces that actually have somewhere to show a live
        // voice command (the side panel) need the WebSocket at all - opening
        // and auto-retrying it for a surface with no visualization to update
        // (the mouse_keyboard popup) would connect and reconnect for nothing.
        if (voiceCommand) {
            setupWebSocket();
        }
        disablePlayButton();
        checkServerStatus();
    });

    // Function to disable the play button
    function disablePlayButton() {
        playButton.disabled = true;
        playButton.style.backgroundColor = 'gray';
    }

    // Function to enable the play button
    function enablePlayButton() {
        playButton.disabled = false;
        playButton.style.backgroundColor = 'black';
    }

    /**
     * Sets the alert-below-button text, and optionally its color. Centralizes
     * the "text + color" pair every session/status transition below needs to
     * set together, instead of each repeating both lines separately.
     * @param {string} text
     * @param {string} [color]
     */
    function setAlert(text, color) {
        alertBelowButton.textContent = text;
        if (color) alertBelowButton.style.color = color;
    }

    // Control functions

    /**
     * Set the play button to its "session running" appearance and handler.
     * Used both right after starting a session and when this surface
     * reopens on top of a session that was already running.
     */
    function setStoppableState() {
        playButton.innerHTML = '<span style="font-size: 24px;">&#9632;</span>';
        playButton.removeEventListener('click', startSession);
        playButton.addEventListener('click', stopSession);
    }

    /**
     * Set the play button to its "no session running" appearance and handler.
     */
    function setStartableState() {
        playButton.innerHTML = '<span>&#9658;</span>';
        playButton.removeEventListener('click', stopSession);
        playButton.addEventListener('click', startSession);
    }

    /**
     * A session is running in a mode the OTHER surface drives: neither start
     * nor stop is offered here (each mode is stopped from the surface that
     * started it), and the alert says what's running and where to stop it.
     * @param {string} activeMode - the running session's capture mode
     */
    function setBlockedState(activeMode) {
        playButton.innerHTML = '<span>&#9658;</span>';
        playButton.removeEventListener('click', startSession);
        playButton.removeEventListener('click', stopSession);
        disablePlayButton();
        setAlert(blockedMessage(activeMode), 'black');
    }

    function blockedMessage(activeMode) {
        const owner = Object.values(EYENAV_SURFACES).find(surface => surface.modes.includes(activeMode));
        if (!owner) {
            return strings['eyenav-session-active-unknown-mode'] || 'A session is already running.';
        }
        return strings[owner.runningMessageKey] || owner.runningMessage;
    }

    // Notices under the Play button: what the backend recorded as having gone
    // wrong (the /status errors the panel already receives every poll), plus
    // a local warning for this tab. Both are shown in the same element, which
    // is optional - a surface without #session-notices simply shows none.
    const sessionNotices = document.getElementById('session-notices');
    let backendErrors = [];
    let localWarning = null;

    function renderNotices() {
        if (!sessionNotices) return;
        const lines = [];
        if (localWarning) lines.push(localWarning);
        if (backendErrors.length > 0) {
            const latest = backendErrors[backendErrors.length - 1];
            const more = backendErrors.length > 1 ? ` (+${backendErrors.length - 1})` : '';
            lines.push(`${strings['sessionHasErrors'] || 'Recording problems detected'}: ${latest}${more}`);
        }
        sessionNotices.textContent = lines.join('\n');
        sessionNotices.hidden = lines.length === 0;
    }

    /**
     * Reads the tracked tab's current viewport size, so the recorded
     * .feature can reproduce the page at the same size. Asks content.js (via
     * message, not chrome.scripting.executeScript) since content.js is
     * already running in every tab unconditionally - executeScript would
     * only work on the one tab Chrome granted activeTab to when the
     * extension's icon was clicked, which silently breaks the moment the
     * side panel is left open across a tab switch (its whole reason for
     * being a side panel instead of a popup). Best-effort: it never blocks
     * session start. When no content script answers (a chrome:// page, or a
     * tab opened before the extension was loaded), `reachable` is false -
     * that same condition means no click or typing will be captured from the
     * tab at all, so the caller surfaces it instead of only logging it.
     * @param {number} tabId
     * @return {Promise<{viewport: {width: number, height: number}|null, reachable: boolean}>}
     */
    function getViewportSize(tabId) {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { type: EYENAV_MESSAGE_TYPES.GET_VIEWPORT }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('EYENAV: Could not read viewport size:', chrome.runtime.lastError.message);
                    resolve({ viewport: null, reachable: false });
                    return;
                }
                resolve({ viewport: response || null, reachable: true });
            });
        });
    }

    /**
     * Start the orchestrated session, in this surface's capture mode.
     */
    function startSession() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const activeTab = tabs[0];

            getViewportSize(activeTab.id).then(({ viewport, reachable }) => {
                const pageDetails = {
                    pageName: activeTab.title,
                    pageUrl: activeTab.url,
                    captureMode: captureMode
                };
                if (viewport) {
                    pageDetails.viewportWidth = viewport.width;
                    pageDetails.viewportHeight = viewport.height;
                }

                console.log('EYENAV: Starting session with page details:', pageDetails);

                fetch(`${EYENAV_BACKEND_URL}/start`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Language': language
                    },
                    body: JSON.stringify(pageDetails)
                })
                    .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, data })))
                    .then(({ ok, status, data }) => {
                        if (status === 409) {
                            // Another session got there first (started from
                            // the other surface since this one last checked) -
                            // not a failure to report, a state to sync to.
                            applyStatus({ sessionActive: true, captureMode: data.activeCaptureMode });
                            return;
                        }
                        if (!ok) {
                            throw new Error(data.status || 'Failed to start session');
                        }
                        setAlert(strings['sessionStarted'] || 'Session started');
                        setStoppableState();
                        // Any /status request still in flight was sent before
                        // this session existed: its (idle) answer is stale.
                        statusRequestSeq++;
                        lastStatusKey = statusKey({ sessionActive: true, captureMode });
                        // A new session starts with no errors; what's still
                        // shown is the previous session's, until the next
                        // /status answer would have replaced it.
                        backendErrors = [];
                        localWarning = reachable ? null : (strings['pageNotReachable'] || "EyeNav is not active on this page, so clicks and typing here won't be recorded. Reload the page.");
                        renderNotices();
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        setAlert(strings['failedToStart'] || 'Failed to start session');
                    });
            });
        });
    }

    /**
     * Stop the orchestrated session
     */
    function stopSession() {
        fetch(`${EYENAV_BACKEND_URL}/stop`, { method: 'POST' })
            .then(response => response.json().then(data => ({ ok: response.ok, data })))
            .then(({ ok, data }) => {
                if (!ok) {
                    throw new Error(data.status || 'Failed to stop session');
                }
                setAlert(strings['sessionStopped'] || 'Session stopped');
                setStartableState();
                statusRequestSeq++;
                lastStatusKey = statusKey({ sessionActive: false });
                localWarning = null;
                renderNotices();
            })
            .catch(error => {
                console.error('Error:', error);
                setAlert(strings['failedToStop'] || 'Failed to stop session');
            });
    }

    // How often an open surface re-reads /status. The side panel stays open
    // for a whole recording and the popup can be left open too, so neither
    // can trust the one snapshot taken when it opened: a session started
    // from the other surface in the meantime would leave this one offering
    // a Play button that can only fail.
    const STATUS_POLL_INTERVAL_MS = 2000;
    // Shorter than a stuck backend would take to answer, but long enough for
    // a busy one (e.g. loading the voice model) not to look like "offline".
    const STATUS_REQUEST_TIMEOUT_MS = 4000;

    // What this surface last drew (see statusKey), so a refresh only redraws
    // on a REAL change - a session started/stopped from elsewhere, the server
    // going away or coming back. Redrawing every tick would overwrite
    // "Session stopped" with the idle prompt two seconds after Stop.
    let lastStatusKey = null;

    // Orders /status answers: each request takes a number, and only the
    // newest request's answer is applied. Start/stop bump it too, so an
    // answer to a request sent BEFORE the action - which describes the world
    // before it - can't redraw an outdated state over the action's result.
    let statusRequestSeq = 0;
    let statusRequestsInFlight = 0;

    function statusKey(data) {
        return data.sessionActive ? `active:${data.captureMode}` : 'idle';
    }

    function ownsSession(activeMode) {
        const surface = EYENAV_SURFACES[captureMode];
        return surface ? surface.modes.includes(activeMode) : activeMode === captureMode;
    }

    /**
     * Check the status of the server, and whether a session is already
     * running - this surface can be destroyed and recreated (popup) or
     * reloaded, so it can't just remember this itself - then keep checking
     * (see STATUS_POLL_INTERVAL_MS).
     */
    function checkServerStatus() {
        if (knownStatus) {
            // Caller already fetched /status (e.g. the popup, to decide
            // whether to show the mode chooser) - don't fetch it again.
            applyStatus(knownStatus);
        } else {
            refreshStatus();
        }

        // A tick is skipped while a request is still in flight, so a stalled
        // backend can't pile up requests (and use up the browser's
        // per-host connection limit that this panel's own /start and /stop
        // calls also need).
        setInterval(() => {
            if (!document.hidden && statusRequestsInFlight === 0) refreshStatus();
        }, STATUS_POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshStatus();
        });
    }

    function refreshStatus() {
        const seq = ++statusRequestSeq;
        statusRequestsInFlight++;
        return fetch(`${EYENAV_BACKEND_URL}/status`, { signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS) })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Server not reachable');
                }
                return response.json();
            })
            .then(data => {
                if (seq === statusRequestSeq) applyStatus(data);
            })
            .catch(error => {
                if (seq === statusRequestSeq) applyOffline(error);
            })
            .finally(() => {
                statusRequestsInFlight--;
            });
    }

    function applyOffline(error) {
        if (lastStatusKey === 'offline') return;
        lastStatusKey = 'offline';
        console.error('Error:', error);
        backendErrors = [];
        localWarning = null;
        renderNotices();
        setAlert(strings['eyenav-ensure-server-running'] || "Ensure the server is running", 'red');
        disablePlayButton();
    }

    function applyStatus(data) {
        // Notices follow every answer (an error can appear while the session
        // is otherwise unchanged), unlike the state below, which only
        // redraws on a change. A synthetic status without `errors` (the 409
        // path) leaves what's shown alone.
        if (Array.isArray(data.errors)) {
            backendErrors = data.errors;
            renderNotices();
        }

        const key = statusKey(data);
        if (key === lastStatusKey) return;
        lastStatusKey = key;

        if (!data.sessionActive) {
            localWarning = null;
            renderNotices();
            enablePlayButton();
            setAlert(strings['eyenav-start-message'] || "Start an orchestrated session", 'black');
            setStartableState();
        } else if (ownsSession(data.captureMode)) {
            enablePlayButton();
            setAlert(strings['sessionStarted'] || 'Session started', 'black');
            setStoppableState();
        } else {
            setBlockedState(data.captureMode);
        }
    }

    /**
     * Setup WebSocket connection to receive real-time NLP commands
     */
    function setupWebSocket() {
        console.log('EYENAV: Setting up WebSocket connection');
        let socket;
        const retryInterval = 5000;

        function connectWebSocket() {
            socket = new WebSocket(EYENAV_WEBSOCKET_URL);
            console.log('EYENAV: WebSocket connection created');

            socket.onopen = function (event) {
                console.log('EYENAV: WebSocket connection established');
            };

            socket.onmessage = function (event) {
                const message = event.data;
                console.log('EYENAV: WebSocket message received:', message);

                if (message === 'ping') {
                    socket.send('pong');
                } else {
                    displayNLPCommand(message);
                }
            };

            socket.onerror = function (error) {
                console.error('WebSocket error:', error);
            };

            socket.onclose = function (event) {
                console.log('EYENAV: WebSocket connection closed', event);
                setTimeout(connectWebSocket, retryInterval);
            };
        }

        connectWebSocket();
    }

    /**
     * Display NLP command in this surface's UI
     * @param {string} command - The NLP command to display
     */
    let inputMode = false;

    /**
     * A word of the command as a node: colored <span> when highlighted, plain
     * text otherwise. Built with textContent, never markup - the command is
     * text received over the WebSocket, and interpolating it into innerHTML
     * let whatever it contained be parsed as HTML in the extension's page.
     * @param {string} word
     * @param {string|null} color
     * @returns {Node}
     */
    function commandWordNode(word, color) {
        if (!color) return document.createTextNode(word);
        const span = document.createElement('span');
        span.style.color = color;
        span.textContent = word;
        return span;
    }

    function displayNLPCommand(command) {
        console.log('EYENAV: NLP Command:', command);
        if (!voiceCommand) return; // this surface has no visualization to update (e.g. mouse_keyboard popup)

        const commandElement = document.createElement('p');
        commandElement.style.fontSize = '20px';
        commandElement.style.fontWeight = 'bold';
        commandElement.style.textAlign = 'center';

        const config = language_config[language] || {};
        const controlWords = config['control_words'] || [];
        const typingExit = config['typing_exit'] || [];
        const words = command.split(' ');
        let tempInputMode = inputMode;
        words.forEach((word, index) => {
            if (index > 0) commandElement.appendChild(document.createTextNode(' '));
            let color = null;
            if (controlWords.includes(word.toLowerCase())) {
                color = 'green';
                if (word.toLowerCase() === config['typing_trigger']) {
                    tempInputMode = true;
                } else if (typingExit.includes(word.toLowerCase())) {
                    tempInputMode = false;
                }
            } else if (tempInputMode) {
                color = 'blue';
            }
            commandElement.appendChild(commandWordNode(word, color));
        });

        voiceCommand.replaceChildren(commandElement);
        inputMode = tempInputMode;

        voiceCommand.style.color = inputMode ? 'blue' : 'black';
    }
}
