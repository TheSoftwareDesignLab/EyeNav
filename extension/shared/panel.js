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
    const language = splitLang === 'en' ? 'en-us' : (splitLang === 'es' ? 'es' : splitLang);
    const localePath = `../locales/${splitLang}.json`;
    const commandsPath = '../commands.json';

    // DOM elements
    const alertBelowButton = document.getElementById('alert-below-button');
    const voiceCommand = document.getElementById('nlp-command');
    const playButton = document.getElementById('play-button');

    let strings = {};
    let language_config = {};

    // Promises
    const localePromise = fetch(localePath)
        .then(response => {
            if (!response.ok) throw new Error('Locale not found');
            return response.json();
        })
        .catch(() => {
            console.warn('Falling back to English locale');
            return fetch('../locales/en.json').then(res => res.json());
        });

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
        alertBelowButton.innerHTML = strings['eyenav-ensure-server-running'] || "Ensure the server is running";
        if (voiceCommand) {
            voiceCommand.innerHTML = strings['initial-nlp-command'] || "Recognized voice commands will appear here";
        }

        applyTranslations(strings);
        setupWebSocket();
        disablePlayButton();
        checkServerStatus();
    });

    function applyTranslations(strings) {
        for (const key in strings) {
            const element = document.getElementById(key);
            if (element) {
                element.innerHTML = strings[key];
            }
        }
    }

    // Function to disable the play button
    function disablePlayButton() {
        playButton.disabled = true;
        playButton.style.backgroundColor = 'gray';
    }

    // Function to enable the play button
    function enablePlayButton() {
        playButton.disabled = false;
        playButton.style.backgroundColor = playButton.classList.contains('play') ? 'black' : 'black';
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
     * Reads the tracked tab's current viewport size, so the recorded
     * .feature can reproduce the page at the same size. Best-effort: some
     * pages (e.g. chrome:// URLs) don't allow script injection, so this
     * resolves to null instead of blocking session start over it.
     * @param {number} tabId
     * @return {Promise<{width: number, height: number}|null>}
     */
    function getViewportSize(tabId) {
        return chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({ width: window.innerWidth, height: window.innerHeight })
        })
            .then(results => (results[0] && results[0].result) || null)
            .catch(error => {
                console.warn('EYENAV: Could not read viewport size:', error);
                return null;
            });
    }

    /**
     * Start the orchestrated session, in this surface's capture mode.
     */
    function startSession() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const activeTab = tabs[0];

            getViewportSize(activeTab.id).then(viewport => {
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

                fetch('http://localhost:5001/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Language': language
                    },
                    body: JSON.stringify(pageDetails)
                })
                    .then(response => response.json().then(data => ({ ok: response.ok, data })))
                    .then(({ ok, data }) => {
                        if (!ok) {
                            throw new Error(data.status || 'Failed to start session');
                        }
                        alertBelowButton.textContent = strings['sessionStarted'] || 'Session started.';
                        setStoppableState();
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        alertBelowButton.textContent = strings['failedToStart'] || 'Failed to start session. Ensure the server is running.';
                    });
            });
        });
    }

    /**
     * Stop the orchestrated session
     */
    function stopSession() {
        fetch('http://localhost:5001/stop')
            .then(response => response.json().then(data => ({ ok: response.ok, data })))
            .then(({ ok, data }) => {
                if (!ok) {
                    throw new Error(data.status || 'Failed to stop session');
                }
                alertBelowButton.textContent = strings['sessionStopped'] || 'Session stopped.';
                setStartableState();
            })
            .catch(error => {
                console.error('Error:', error);
                alertBelowButton.textContent = strings['failedToStop'] || 'Failed to stop session.';
            });
    }

    /**
     * Check the status of the server, and whether a session is already
     * running - this surface can be destroyed and recreated (popup) or
     * reloaded, so it can't just remember this itself.
     */
    function checkServerStatus() {
        if (knownStatus) {
            // Caller already fetched /status (e.g. the popup, to decide
            // whether to show the mode chooser) - don't fetch it again.
            applyStatus(knownStatus);
            return;
        }

        fetch('http://localhost:5001/status')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Server not reachable');
                }
                return response.json();
            })
            .then(applyStatus)
            .catch(error => {
                console.error('Error:', error);
                alertBelowButton.textContent = strings['eyenav-ensure-server-running'] || "Ensure the server is running";
                alertBelowButton.style.color = 'red';
                disablePlayButton();
            });
    }

    function applyStatus(data) {
        enablePlayButton();
        if (data.sessionActive) {
            alertBelowButton.textContent = strings['sessionStarted'] || 'Session started.';
            setStoppableState();
        } else {
            alertBelowButton.textContent = strings['eyenav-start-message'] || "Start an orchestrated session";
            alertBelowButton.style.color = 'black';
            setStartableState();
        }
    }

    /**
     * Setup WebSocket connection to receive real-time NLP commands
     */
    function setupWebSocket() {
        console.log('EYENAV: Setting up WebSocket connection');
        let socket;
        let retryInterval = 5000;

        function connectWebSocket() {
            socket = new WebSocket('ws://localhost:5002/');
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
    let highlightedWord = '';

    function displayNLPCommand(command) {
        console.log('EYENAV: NLP Command:', command);
        if (!voiceCommand) return; // this surface has no visualization to update (e.g. mouse_keyboard popup)

        const commandElement = document.createElement('p');
        commandElement.style.fontSize = '20px';
        commandElement.style.fontWeight = 'bold';
        commandElement.style.textAlign = 'center';

        const controlWords = (language_config[language] || {})['control_words'] || [];
        const words = command.split(' ');
        let tempInputMode = inputMode;
        const highlightedCommand = words.map(word => {
            if (controlWords.includes(word.toLowerCase())) {
                highlightedWord = `<span style="color: green;">${word}</span>`;
                if (word.toLowerCase() === language_config[language]['typing_trigger']) {
                    tempInputMode = true;
                } else if (language_config[language]['typing_exit'].includes(word.toLowerCase())) {
                    tempInputMode = false;
                }
            } else {
                highlightedWord = tempInputMode ? `<span style="color: blue;">${word}</span>` : word;
            }
            return highlightedWord;
        }).join(' ');

        commandElement.innerHTML = highlightedCommand;
        voiceCommand.innerHTML = '';
        voiceCommand.appendChild(commandElement);
        inputMode = tempInputMode;

        voiceCommand.style.color = inputMode ? 'blue' : 'black';
    }
}
