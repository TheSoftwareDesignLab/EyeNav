document.addEventListener('DOMContentLoaded', function () {
    const userLang = navigator.language || 'en';
    document.documentElement.setAttribute('lang', userLang);
    console.log('EYENAV: User language detected:', userLang);

    const splitLang = userLang.split('-')[0];
    const language = splitLang === 'en' ? 'en-us' : (splitLang === 'es' ? 'es' : splitLang);
    const localePath = `locales/${splitLang}.json`;
    const commandsPath = '../commands.json';

    const alertBelowButton = document.getElementById('alert-below-button');
    const voiceCommand = document.getElementById('nlp-command');
    const playButton = document.getElementById('play-button');
   
    const voiceCommandsContainer = document.querySelector('.voice-commands');
    const filePathInput = document.getElementById('file-path-input');
  
    const openPopupLink = document.getElementById('open-popup-link');


    let strings = {};
    let language_config = {};

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
            return { "en": {}, "es": {} };
        });

    Promise.all([localePromise, commandsPromise]).then(([localeData, configData]) => {
        strings = localeData;
        language_config = configData;

        
       
        chrome.storage.local.get(['isRecording'], function(result) {
            const savedIsRecording = result.isRecording || false;
            
    
            
            if (savedIsRecording) {
                 console.log("EYENAV: Restoring recording state from storage.");
                 restoreStopButtonState(); 
            }
            
             checkServerStatus(); 
        });


        
        alertBelowButton.innerHTML = strings['eyenav-ensure-server-running'] || "Ensure the server is running";
        voiceCommand.innerHTML = strings['initial-nlp-command'] || "Recognized voice commands will appear here";

        applyTranslations(strings);
        setupWebSocket();
    

        playButton.addEventListener('click', () => {
    
             if (playButton.getAttribute('listener') === 'start') {
                 startSession();
             } else {
                 stopSession();
             }
         });
     
        playButton.setAttribute('listener', 'start');

        


        
        chrome.storage.onChanged.addListener(function (changes, areaName) {
            if (areaName !== 'local') return;

            
            if (changes.isRecording) {
                console.log("EYENAV: (sidepanel) Detected recording state change from storage.");
                if (changes.isRecording.newValue === true) {
                    restoreStopButtonState();
                } else {
                    restorePlayButtonState();
                }
            }

            
        });
        
        
        openPopupLink.addEventListener('click', (event) => {
            event.preventDefault();
            console.log("EYENAV: (Sidepanel) Opening popup (K&M Mode)...");
            
            
            chrome.action.openPopup();
            
        
            window.close();
          
        });
      


     
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            
            
            if (request.action === 'closeSidePanel') {
                console.log("EYENAV: (sidepanel) Recibió orden de cierre desde background.js");
               
                sendResponse({ status: 'closing' });
                
                window.close();
            }
            
            return true; 
        });
      

    });

    function applyTranslations(strings) {
        for (const key in strings) {
            const element = document.getElementById(key);
            if (element) {
                element.innerHTML = strings[key];
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
        playButton.removeEventListener('click', startSession); 
        playButton.addEventListener('click', stopSession);
        playButton.setAttribute('listener', 'stop'); 
    }

    function restorePlayButtonState() {
        console.log("EYENAV: (sidepanel) Restoring PLAY button state.");
      
        playButton.innerHTML = '<span>&#9658;</span>'; 
        playButton.removeEventListener('click', stopSession);
        playButton.addEventListener('click', startSession);
        playButton.setAttribute('listener', 'start'); 
        
        checkServerStatus();
    }


    function startSession() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                console.error("EYENAV: Could not get active tab ID.");
                alertBelowButton.textContent = "Error: Could not access active tab.";
                return;
            }
            
            
            const currentMode = 'eye-voice';
            const customFilePath = filePathInput.value.trim();

            const pageDetails = {
                pageName: activeTab.title,
                pageUrl: activeTab.url,
                mode: currentMode,
                filePath: customFilePath 
            };

            console.log('EYENAV: Attempting to start session:', pageDetails);

            fetch('http://localhost:5001/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Language': language
                },
                body: JSON.stringify(pageDetails)
            })
            .then(response => {
                if (!response.ok) {
                 
                    throw new Error(`Server responded with status: ${response.status}`);
                }
                return response.json();
             })
            .then(data => {
                console.log('EYENAV: Start session successful:', data);
                
                chrome.storage.local.set({ isRecording: true, mode: currentMode }, function() {
                    console.log('EYENAV: Recording state saved.');
                    
                
                    chrome.tabs.sendMessage(activeTab.id, {
                        action: 'startSession',
                        mode: currentMode
                    }, function(response) {
                         if (chrome.runtime.lastError) {
                             console.error("EYENAV: Error sending start message to content script:", chrome.runtime.lastError.message);
                             
                         } else {
                             console.log("EYENAV: Start message sent to content script.");
                         }
                    });
                });
            })
            .catch(error => {
                console.error('EYENAV: Error starting session:', error);
                alertBelowButton.textContent = strings['failedToStart'] || 'Failed to start. Server running?';
            
                 chrome.storage.local.set({ isRecording: false, mode: null });
            });
        });
    }


    function stopSession() {
        console.log("EYENAV: Attempting to stop session...");
        fetch('http://localhost:5001/stop')
            .then(response => response.json())
            .then(data => {
                console.log('EYENAV: Stop session successful:', data);
                
                chrome.storage.local.set({ isRecording: false, mode: null }, function() {
                    console.log('EYENAV: Recording state cleared.');

                    
                    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                        const activeTab = tabs[0];
                         if (activeTab && activeTab.id) {
                             chrome.tabs.sendMessage(activeTab.id, {
                                 action: 'stopSession'
                             }, function(response) {
                                  if (chrome.runtime.lastError) {
                                       console.error("EYENAV: Error sending stop message to content script:", chrome.runtime.lastError.message);
                                  } else {
                                       console.log("EYENAV: Stop message sent to content script.");
                                  }
                             });
                         }
                    });
                });
            })
            .catch(error => {
                console.error('EYENAV: Error stopping session:', error);
                alertBelowButton.textContent = strings['failedToStop'] || 'Failed to stop session.';
            
                 chrome.storage.local.set({ isRecording: false, mode: null });
            
                 restorePlayButtonState();
            });
    }

    function checkServerStatus() {
        fetch('http://localhost:5001/status')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Server not reachable');
                }
                
                 chrome.storage.local.get('isRecording', function(result) {
                     if (!result.isRecording) {
                         alertBelowButton.textContent = strings['eyenav-start-message'] || "Start an orchestrated session";
                         alertBelowButton.style.color = 'black';
                         enablePlayButton();
                     } else {
                         enablePlayButton(); 
                     }
                 });
            })
            .catch(error => {
                console.error('EYENAV: Server status check failed:', error);
                alertBelowButton.textContent = strings['eyenav-ensure-server-running'] || "Ensure the server is running";
                alertBelowButton.style.color = 'red';
                disablePlayButton();
            
              
            });
    }


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
    
    let inputMode = false;
    let highlightedWord = '';

    function displayNLPCommand(command) {
      
        if (!language_config || !language_config[language]) {
             console.warn("Language config not ready for displayNLPCommand");
             return;
         }

        console.log('EYENAV: NLP Command:', command);
        const commandElement = document.createElement('p');
        commandElement.style.fontSize = '20px';
        commandElement.style.fontWeight = 'bold';
        commandElement.style.textAlign = 'center';

        const controlWords = language_config[language]['control_words'] || [];
        const words = command.split(' ');
        let tempInputMode = inputMode;
        const highlightedCommand = words.map(word => {
            const lowerWord = word.toLowerCase();
            if (controlWords.includes(lowerWord)) {
                highlightedWord = `<span style="color: green;">${word}</span>`;
                
                if (lowerWord === language_config[language]['typing_trigger']) {
                    tempInputMode = true;
                } else if (language_config[language]['typing_exit'].includes(lowerWord)) {
                    tempInputMode = false;
                }
            } else {
                highlightedWord = tempInputMode ? `<span style="color: blue;">${word}</span>` : word;
            }
            return highlightedWord;
        }).join(' ');

        commandElement.innerHTML = highlightedCommand;
        
        if (voiceCommand) {
            voiceCommand.innerHTML = '';
            voiceCommand.appendChild(commandElement);
            voiceCommand.style.color = inputMode ? 'blue' : 'black';
        }
        inputMode = tempInputMode;
    }
});