document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const messageElement = document.getElementById('message');
    const hoverCheckbox = document.getElementById('toggle-hover');
    const highlightCheckbox = document.getElementById('toggle-highlight');

    // Initialize hover setting and server status
    checkServerStatus();
    loadHoverSetting();

    // Event Listeners
    hoverCheckbox.addEventListener('change', onToggleChange('hover'));
    highlightCheckbox.addEventListener('change', onToggleChange('highlight'));
    document.getElementById('start-button').addEventListener('click', startSession);
    document.getElementById('stop-button').addEventListener('click', stopSession);

    /**
     * Load and set the hover checkbox state from Chrome storage
     */
    function loadHoverSetting() {
        chrome.storage.sync.get(['hover', 'highlight'], function(result) {
            hoverCheckbox.checked = result.hover || false;
            highlightCheckbox.checked = result.highlight || false;

            // Notify the content script about hover state
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleHover', enabled: hoverCheckbox.checked });
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleHighlight', enabled: highlightCheckbox.checked });
            });
        });
    }

    /**
     * Event handler for hover checkbox toggle
     * @param {string} toggleType - The type of toggle, can be either 'hover' or 'highlight'
     */
    function onToggleChange(toggleType) {
        return function(event) {
            const isChecked = event.target.checked;
            
            // Save the state to Chrome storage
            chrome.storage.sync.set({ [toggleType]: isChecked }, function() {
                console.log(`${toggleType} ${isChecked ? 'enabled' : 'disabled'} state is set`);
            });
    
            // Notify the content script about toggle state change
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' + toggleType.charAt(0).toUpperCase() + toggleType.slice(1), enabled: isChecked });
            });
        };
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

            console.log('Starting session with page details:', pageDetails);

            // Send the page details to the server
            fetch('http://localhost:5001/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(pageDetails)
            })
            .then(response => response.json())
            .then(data => {
                messageElement.textContent = 'Eye-tracking session started.';

                window.close(); 
            })
            .catch(error => {
                console.error('Error:', error);
                messageElement.textContent = 'Failed to start session. Ensure the server is running.';
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
                messageElement.textContent = 'Eye-tracking session stopped.';
            })
            .catch(error => {
                console.error('Error:', error);
                messageElement.textContent = 'Failed to stop session. Ensure the server is running.';
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
                messageElement.textContent = ''; // Clear error message
            })
            .catch(error => {
                console.error('Error:', error);
                messageElement.textContent = 'Cannot reach the server. Please ensure the Python server is running.';
            });
    }
});