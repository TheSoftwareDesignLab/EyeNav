document.addEventListener('DOMContentLoaded', function () {
    const userLang = navigator.language || 'en';
    document.documentElement.setAttribute('lang', userLang);
    console.log('EYENAV: (Popup) User language detected:', userLang);

    const splitLang = userLang.split('-')[0];
    const language = splitLang === 'en' ? 'en-us' : (splitLang === 'es' ? 'es' : splitLang);
    
    const localePath = `../locales/${splitLang}.json`; 

    const alertBelowButton = document.getElementById('alert-below-button');
    const playButton = document.getElementById('play-button');
    const filePathInput = document.getElementById('file-path-input');
    const titleElement = document.getElementById('eyenav-title-popup');
    const openSidePanelLink = document.getElementById('open-side-panel');

    let strings = {};

 
    fetch(localePath)
        .then(response => response.json())
        .catch(() => fetch('../locales/en.json').then(res => res.json()))
        .then(localeData => {
            strings = localeData;
            console.log("EYENAV: (Popup) Traducciones cargadas.");
            applyTranslations(strings);
            titleElement.innerHTML = strings['eyenav-title-popup'] || "K&M Recording";
            
         
            chrome.storage.local.get('isRecording', function(result) {
                 if (result.isRecording) {
                    restoreStopButtonState();
                 } else {
                    checkServerStatus();
                 }
            });
        });

 
    console.log("EYENAV: (Popup) Abierto. Enviando orden de cierre al sidepanel.");
    chrome.runtime.sendMessage({ action: 'closeSidePanel' }, (response) => {
        
        if (chrome.runtime.lastError) {
            console.log("EYENAV: (Popup) Mensaje 'closeSidePanel' enviado. El panel lateral no estaba abierto.");
        } else {
          
            console.log("EYENAV: (Popup) El panel lateral respondió:", response.status);
        }
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

    openSidePanelLink.addEventListener('click', (event) => {
        event.preventDefault();
        console.log("EYENAV: (Popup) Opening Side Panel...");
        
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length > 0 && tabs[0].windowId) {
                chrome.sidePanel.open({ windowId: tabs[0].windowId }, () => window.close());
            } else {
                chrome.sidePanel.open({}, () => window.close());
            }
        });
    });

    
    chrome.storage.local.get(['isRecording'], function(result) {
        const savedIsRecording = result.isRecording || false;
        if (savedIsRecording) {
             console.log("EYENAV: (Popup) Restoring recording state from storage.");
             restoreStopButtonState(); 
        }
     
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
    }

    function restorePlayButtonState() {
        playButton.innerHTML = '<span>&#9658;</span>'; 
        playButton.setAttribute('listener', 'start'); 
        checkServerStatus();
    }
    

    
    async function startSession() {
        let activeTab;
        try {
           
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                throw new Error("Could not get active tab ID.");
            }
        } catch (error) {
            console.error("EYENAV: (Popup) Error getting tab:", error.message);
            alertBelowButton.textContent = "Error: Could not access active tab.";
            playButton.disabled = false; 
            return;
        }

        const currentMode = 'keyboard-mouse'; 
        const customFilePath = filePathInput.value.trim();
        const pageDetails = {
            pageName: activeTab.title,
            pageUrl: activeTab.url,
            mode: currentMode,
            filePath: customFilePath 
        };

        console.log('EYENAV: (Popup) Attempting to start K&M session:', pageDetails);

        try {
            const response = await fetch('http://localhost:5001/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Language': language },
                body: JSON.stringify(pageDetails)
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            
            await response.json();
            console.log('EYENAV: (Popup) Start session successful.');

        
            await chrome.storage.local.set({ isRecording: true, mode: currentMode });
            console.log('EYENAV: (Popup) Recording state SAVED.');

            
            await chrome.tabs.sendMessage(activeTab.id, {
                action: 'startSession',
                mode: currentMode
            });
            console.log("EYENAV: (Popup) Start message sent to content script.");

           
            window.close();

        } catch (error) {
            console.error('EYENAV: (Popup) Error starting session:', error);
            alertBelowButton.textContent = strings['failedToStart'] || 'Failed to start. Server running?';
            await chrome.storage.local.set({ isRecording: false, mode: null });
            playButton.disabled = false;
        }
    }

    
    async function stopSession() {
        console.log("EYENAV: (Popup) Attempting to stop session...");
        try {
            const response = await fetch('http://localhost:5001/stop');
            if (!response.ok) throw new Error('Server stop request failed');
            
            await response.json();
            console.log('EYENAV: (Popup) Stop session successful.');

        } catch (error) {
            console.warn('EYENAV: (Popup) Error stopping session server-side:', error);
        
        }
        
        try {
        
            await chrome.storage.local.set({ isRecording: false, mode: null });
            console.log('EYENAV: (Popup) Recording state CLEARED.');

          
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0] && tabs[0].id) {
                await chrome.tabs.sendMessage(tabs[0].id, { action: 'stopSession' });
                console.log("EYENAV: (Popup) Stop message sent to content script.");
            }

            
            window.close();

        } catch (extError) {
            console.error('EYENAV: (Popup) Error clearing extension state:', extError);
            alertBelowButton.textContent = strings['failedToStop'] || 'Failed to stop session.';
            playButton.disabled = false; 
        }
    }

    function checkServerStatus() {
        fetch('http://localhost:5001/status')
            .then(response => {
                if (!response.ok) throw new Error('Server not reachable');
                
                 chrome.storage.local.get('isRecording', function(result) {
                     
                     enablePlayButton();
                     if (!result.isRecording) {
                         alertBelowButton.textContent = strings['eyenav-start-k-m-session'] || "Start K&M session";
                         alertBelowButton.style.color = 'black';
                     }
                 });
            })
            .catch(error => {
                console.error('EYENAV: (Popup) Server status check failed:', error);
                alertBelowButton.textContent = strings['eyenav-ensure-server-running'] || "Ensure the server is running";
                alertBelowButton.style.color = 'red';
                disablePlayButton();
                
                
            });
    }

});