document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const alertBelowButton = document.getElementById('alert-below-button');

    const voiceCommand = document.getElementById('nlp-command');

    const playButton = document.getElementById('play-button');

    setupWebSocket();
    disablePlayButton();
    checkServerStatus();
    

    // Event Listeners
    playButton.addEventListener('click', startSession);

    
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
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const activeTab = tabs[0];
            const pageDetails = {
                pageName: activeTab.title,
                pageUrl: activeTab.url
            };

            console.log('EYENAV: Starting session with page details:', pageDetails);

            fetch('http://localhost:5001/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(pageDetails)
            })
            .then(response => response.json())
            .then(data => {
                alertBelowButton.textContent = 'Eye-tracking session started.';
                playButton.innerHTML = '<span style="font-size: 24px;">&#9632;</span>';
                playButton.removeEventListener('click', startSession);
                playButton.addEventListener('click', stopSession);
            })
            .catch(error => {
                console.error('Error:', error);
                alertBelowButton.textContent = 'Failed to start session. Ensure the server is running.';
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
                alertBelowButton.textContent = 'Eye-tracking session stopped.';
                playButton.innerHTML = '<span>&#9658;</span>'; 
                playButton.removeEventListener('click', stopSession);
                playButton.addEventListener('click', startSession);
            })
            .catch(error => {
                console.error('Error:', error);
                alertBelowButton.textContent = 'Failed to stop session. Ensure the server is running.';
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
                alertBelowButton.textContent = 'Start an orchestrated session'; 
                alertBelowButton.style.color = 'black';
                enablePlayButton();
            })
            .catch(error => {
                console.error('Error:', error);
                alertBelowButton.textContent = 'Ensure the server is running';
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
    
            socket.onopen = function(event) {
                console.log('EYENAV: WebSocket connection established');
            };
    
            socket.onmessage = function(event) {
                const message = event.data;
                console.log('EYENAV: WebSocket message received:', message);
    
                if (message === 'ping') {
                    socket.send('pong'); 
                } else {
                    displayNLPCommand(message);
                }
            };
    
            socket.onerror = function(error) {
                console.error('WebSocket error:', error);
            };
    
            socket.onclose = function(event) {
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
    function displayNLPCommand(command) {
        console.log('EYENAV: NLP Command:', command);
        const commandElement = document.createElement('p');
        
        // Highlight control words
        const controlWords = ["input", "stop", "enter", "click", "back", "forward", "go"];
        const highlightedCommand = command.split(' ').map(word => {
            return controlWords.includes(word.toLowerCase()) ? `<span style="color: green;">${word}</span>` : word;
        }).join(' ');

        commandElement.innerHTML = 'Recognized: ' + highlightedCommand;
        voiceCommand.innerHTML = '';
        voiceCommand.appendChild(commandElement);
    }
});
