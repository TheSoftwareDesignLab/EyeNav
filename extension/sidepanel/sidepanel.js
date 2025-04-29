document.addEventListener('DOMContentLoaded', function () {
    const userLang = navigator.language || 'en';
    document.documentElement.setAttribute('lang', userLang);
    console.log('EYENAV: User language detected:', userLang);
    
    const splitLang = userLang.split('-')[0];
    const language = splitLang === 'en' ? 'en-us' : (splitLang === 'es' ? 'es' : splitLang);
    const localePath = `locales/${splitLang}.json`;
    const commandsPath = '../commands.json';

    // DOM elements
    const alertBelowButton = document.getElementById('alert-below-button');
    const voiceCommand = document.getElementById('nlp-command');
    const playButton = document.getElementById('play-button');

    // Promises
    const localePromise = fetch(localePath)
        .then(response => {
            if (!response.ok) throw new Error('Locale not found');
            return response.json();
        })
        .catch(() => {
            console.warn('Falling back to English locale');
            return fetch('locales/en.json').then(res => res.json());
        });

    const commandsPromise = fetch(commandsPath)
        .then(response => {
            if (!response.ok) throw new Error('Commands config not found');
            return response.json();
        })
        .catch((err) => {
            console.error('Commands config error:', err);
            return {"en": {}, "es": {}};
        });

    // Wait for both locale + config, then run your logic
    Promise.all([localePromise, commandsPromise]).then(([localeData, configData]) => {
        strings = localeData;
        language_config = configData;
        const alertBelowButton = document.getElementById('alert-below-button');
        alertBelowButton.innerHTML = strings['eyenav-ensure-server-running'] || "Ensure the server is running";

        const voiceCommand = document.getElementById('nlp-command');
        voiceCommand.innerHTML = strings['initial-nlp-command'] || "Recognized voice commands will appear here";

        applyTranslations(strings);
        setupWebSocket();
        disablePlayButton();
        checkServerStatus();

        playButton.addEventListener('click', startSession);
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
     * Start the orchestrated session
     */
    function startSession() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const activeTab = tabs[0];
            const pageDetails = {
                pageName: activeTab.title,
                pageUrl: activeTab.url
            };

            console.log('EYENAV: Starting session with page details:', pageDetails);

            fetch('http://localhost:5001/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Language': language
                },
                body: JSON.stringify(pageDetails)
            })
                .then(response => response.json())
                .then(data => {
                    alertBelowButton.textContent = strings['sessionStarted'] || 'Session started.';
                    playButton.innerHTML = '<span style="font-size: 24px;">&#9632;</span>';
                    playButton.removeEventListener('click', startSession);
                    playButton.addEventListener('click', stopSession);
                })
                .catch(error => {
                    console.error('Error:', error);
                    alertBelowButton.textContent = strings['failedToStart'] || 'Failed to start session. Ensure the server is running.';
                });
        });
    }

    /**
     * Stop the orchestrated session
     */
    function stopSession() {
        fetch('http://localhost:5001/stop')
            .then(response => response.json())
            .then(data => {
                alertBelowButton.textContent = strings['sessionStopped'] || 'Session stopped.';
                playButton.innerHTML = '<span>&#9658;</span>';
                playButton.removeEventListener('click', stopSession);
                playButton.addEventListener('click', startSession);
            })
            .catch(error => {
                console.error('Error:', error);
                alertBelowButton.textContent = strings['failedToStop'] || 'Failed to stop session.';
            });
    }

    /**
     * Check the status of the server
     */
    function checkServerStatus() {
        fetch('http://localhost:5001/status')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Server not reachable');
                }
                alertBelowButton.textContent = strings['eyenav-start-message'] || "Start an orchestrated session";
                alertBelowButton.style.color = 'black';
                enablePlayButton();
            })
            .catch(error => {
                console.error('Error:', error);
                alertBelowButton.textContent = strings['eyenav-ensure-server-running'] || "Ensure the server is running";
                alertBelowButton.style.color = 'red';
                disablePlayButton();
            });
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
     * Display NLP command in the side panel UI
     * @param {string} command - The NLP command to display
     */
    let inputMode = false;
    let highlightedWord = '';

    function displayNLPCommand(command) {
        console.log('EYENAV: NLP Command:', command);
        const commandElement = document.createElement('p');
        commandElement.style.fontSize = '20px';
        commandElement.style.fontWeight = 'bold';
        commandElement.style.textAlign = 'center';

        const controlWords = language_config[language]['control_words'] || [];
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
});
