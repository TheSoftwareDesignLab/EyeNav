/**
 * @fileoverview 
 * */

let currentMode = 'eye-voice'; 
let isRecording = false;     

let lastEditedInput = {
    element: null,
    value: ''
};

let resizeTimeout; 
const DEBOUNCE_DELAY = 500; 


let lastViewportWidth = window.innerWidth;
let lastViewportHeight = window.innerHeight;





function getSelector(element) {
    if (!element || !element.parentElement) {
        if (element && element.tagName && element.tagName.toLowerCase() === 'html') {
            return '/html';
        }
        return '';
    }
    
    if (element.tagName.toLowerCase() === 'html') {
        return '/html';
    }

    let path = getSelector(element.parentElement) + '/' + element.tagName.toLowerCase();
    
    const siblings = Array.from(element.parentNode.children);
    const sameTagSiblings = siblings.filter(sibling => sibling.tagName === element.tagName);

    if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(element) + 1;
        path += `[${index}]`;
    }
    
    return path;
}

function getInteractiveTarget(element) {
    if (!element) return element;
    
    const tagName = element.tagName.toLowerCase();
    if (['svg', 'path', 'span', 'i'].includes(tagName)) { 
        const interactiveParent = element.closest('button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]');
        if (interactiveParent) {
            console.log("EYENAV: Click on decorative/child element detected. Targeting parent:", interactiveParent);
            return interactiveParent;
        }
    }
    return element;
}


function sendActionToBackend(actionData) {
    if (!isRecording) return;

    console.log('EYENAV: Recording action:', actionData);
    fetch('http://localhost:5001/record-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData),
    })
    .then(response => response.json())
    .then(data => console.log('EYENAV: Action recorded:', data))
    .catch(error => console.error('EYENAV: Error recording action:', error));
}


function recordPendingInputAction() {
    if (lastEditedInput.element && lastEditedInput.value) {
        const selector = getSelector(lastEditedInput.element);
        sendActionToBackend({
            type: 'input',
            xpath: selector,
            value: lastEditedInput.value,
            url: window.location.href,
        });
    }
    lastEditedInput = { element: null, value: '' };
}


function handleGenericClick(event) {
    if (!isRecording || currentMode !== 'keyboard-mouse') return; 
    
    recordPendingInputAction();
    
    const interactiveElement = getInteractiveTarget(event.target);
    const selector = getSelector(interactiveElement);
    
    const actionData = {
        type: 'click',
        xpath: selector,
        text: interactiveElement.textContent.trim() || interactiveElement.value || interactiveElement.getAttribute('aria-label') || null, 
        tagName: interactiveElement.tagName.toLowerCase(),
        url: window.location.href
    };
    sendActionToBackend(actionData);
}

function handleKeyUp(event) {
    if (!isRecording || currentMode !== 'keyboard-mouse') return;

    const targetElement = event.target;

    if (['input', 'textarea'].includes(targetElement.tagName.toLowerCase())) {
        lastEditedInput.element = targetElement;
        lastEditedInput.value = targetElement.value;

        if (event.key === 'Enter') {
            recordPendingInputAction();
            const selector = getSelector(targetElement);
            const actionData = {
                type: 'keypress',
                xpath: selector,
                key: 'Enter',
                url: window.location.href
            };
            sendActionToBackend(actionData);
        }
    }
}


function handleResize() {
    if (!isRecording) return;

    clearTimeout(resizeTimeout);

    resizeTimeout = setTimeout(() => {
        const currentWidth = window.innerWidth;
        const currentHeight = window.innerHeight;

      
        if (currentWidth !== lastViewportWidth || currentHeight !== lastViewportHeight) {
            console.log(`EYENAV: Window resize detected. New viewport: ${currentWidth}x${currentHeight}`);
            
            sendActionToBackend({
                type: 'viewportChange', 
                url: window.location.href,
                viewport: {
                    width: currentWidth,
                    height: currentHeight
                }
              
            });

            
            lastViewportWidth = currentWidth;
            lastViewportHeight = currentHeight;
        }
        
        
        
    }, DEBOUNCE_DELAY);
}


function setupWebSocketListener() {
    const socket = new WebSocket('ws://localhost:5002/');

    socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.action === 'click_at_coordinates' && isRecording && currentMode === 'eye-voice') { 
                const element = document.elementFromPoint(message.x, message.y);
                if (!element) return;
                
                const interactiveElement = getInteractiveTarget(element);
                
                interactiveElement.click();

                const selector = getSelector(interactiveElement);
                const actionData = {
                    type: 'click',
                    xpath: selector,
                    text: interactiveElement.textContent.trim() || interactiveElement.value || interactiveElement.getAttribute('aria-label') || null,
                    tagName: interactiveElement.tagName.toLowerCase(),
                    url: window.location.href
                };
                sendActionToBackend(actionData);
            }
        } catch (error) {}
    };

    socket.onclose = () => {
        if (isRecording) { 
            console.log('EYENAV: WebSocket connection closed unexpectedly. Retrying in 5s...');
            setTimeout(setupWebSocketListener, 5000); 
        } else {
             console.log('EYENAV: WebSocket connection closed.');
        }
    };
     socket.onerror = (error) => {
         console.error('EYENAV: WebSocket error:', error);
     };
}


function sendInitialState() {
    if (!isRecording) return;

    console.log("EYENAV: Sending initial state (viewport and zoom)...");
    lastViewportWidth = window.innerWidth;
    lastViewportHeight = window.innerHeight;
    
    sendActionToBackend({ 
        type: 'initialState', 
        url: window.location.href,
        viewport: {
            width: lastViewportWidth,
            height: lastViewportHeight
        },
        devicePixelRatio: window.devicePixelRatio 
    });
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("EYENAV: Message received in content script:", request); 
    if (request.action === 'startSession') {
        currentMode = request.mode;
        isRecording = true;
      
        console.log(`EYENAV: Recording explicitly started by UI (panel/popup) in mode: ${currentMode}`);
        
        
     
        sendInitialState(); 
    } else if (request.action === 'stopSession') {
        recordPendingInputAction();
        isRecording = false;
   
        console.log('EYENAV: Recording explicitly stopped by UI (panel/popup).');
       
    }
});

function initialize() {
    console.log('EyeNav content script initializing...');
    
    chrome.storage.local.get(['isRecording', 'mode'], function(result) {
        if (result.isRecording) {
            isRecording = true;
            currentMode = result.mode || 'eye-voice'; 
            console.log(`EYENAV: Resuming recording session from storage in mode: ${currentMode}`);
        } else {
            isRecording = false;
            console.log("EYENAV: No active recording session found in storage.");
        }
        
        document.addEventListener('click', handleGenericClick, true);
        document.addEventListener('keyup', handleKeyUp, true);
        document.addEventListener('blur', (event) => {
            if (isRecording && (['input', 'textarea'].includes(event.target.tagName.toLowerCase()))) { 
                recordPendingInputAction();
            }
        }, true);
        
        window.addEventListener('resize', handleResize);

        setupWebSocketListener();
        console.log('EyeNav content script initialized and listeners attached.');
        
        if (isRecording) {
            
             sendInitialState();
        }
    });
}

initialize();