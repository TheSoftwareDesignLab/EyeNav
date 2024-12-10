/**
 * Check if an element is clickable
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isClickable(element) {
    return element.tagName.toLowerCase() === 'a' ||
        element.tagName.toLowerCase() === 'button' ||
        element.tagName.toLowerCase() === 'input' ||
        element.tagName.toLowerCase() === 'select' ||
        element.tagName.toLowerCase() === 'textarea' ||
        (element.onclick || element.getAttribute('role') === 'button') ||
        (element.href !== undefined && element.href !== '');
}

/**
 * Get the full XPath of an element
 * @param {HTMLElement} element
 * @returns {string}
 */
function getXPath(element) {
    if (element.id) return `//*[@id="${element.id}"]`;
    if (element === document.body) return '/html/body';

    let parts = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
        let ix = 0;
        let siblings = element.parentNode ? Array.from(element.parentNode.childNodes) : [];
        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) {
                parts.unshift(`${element.tagName.toLowerCase()}[${ix + 1}]`);
                break;
            }
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
        }
        element = element.parentNode;
    }
    return parts.length ? '/' + parts.join('/') : null;
}

/**
 * Check if an element is relevant
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isRelevantElement(element) {
    return element.offsetWidth > 0 &&
        element.offsetHeight > 0 &&
        ['a', 'button', 'input', 'select', 'textarea', 'div', 'span'].includes(element.tagName.toLowerCase()) ||
        (element.onclick || element.getAttribute('role') === 'button' || element.hasAttribute('tabindex')) ||
        (element.href !== undefined && element.href !== '');
}

/**
 * Handle the click event
 * @param {MouseEvent} event
 */
function handleClick(event) {
    if (event.isEyeNavHandled) return;  // Prevent duplicate execution
    event.isEyeNavHandled = true;  // Mark event as handled by EyeNav

    const element = event.target;

    const tagData = {
        tagName: element.tagName.toLowerCase(),
        href: element.getAttribute('href') || null,
        id: element.id || null,
        className: element.className || null,
        xpath: getXPath(element),
        textContent: element.textContent.trim() || null
    };

    console.log('Clicked, sending tag info:', tagData);

    fetch('http://localhost:5001/tag-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tagData),
    })
        .then(response => response.json())
        .then(data => console.log('Tag info received:', data))
        .catch(error => console.error('Error:', error));
}

/**
 * Mutation callback function for webpages that are dynamically updated.
 * This will attach click handlers to new elements that are added to the DOM.
 * @param {MutationRecord[]} mutations
 */
function mutationCallback(mutations) {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1 && isRelevantElement(node)) {
                node.addEventListener('click', handleClick, true); // Attach our event handler in capture phase
                
                // Attach to relevant child elements as well
                node.querySelectorAll('a, button, input, select, textarea').forEach(child => {
                    child.addEventListener('click', handleClick, true); // In capture phase
                });
            }
        });

        if (mutation.type === 'attributes' && mutation.target.nodeType === 1) {
            const node = mutation.target;

            if (!node.hasAttribute('hidden') && node.style.display !== 'none') {
                node.addEventListener('click', handleClick, true);  // Capture phase to avoid interfering with bubbling
                
                node.querySelectorAll('a, button, input, select, textarea').forEach(child => {
                    child.addEventListener('click', handleClick, true); // Attach to relevant children in capture phase
                });
            }
        }
    });
}

/**
 * Add event listeners
 */
function addEventListeners() {
    document.addEventListener('click', handleClick, true);  // Capture phase
}


/**
 * Main initialization function
 */
function initialize() {
    console.log('EyeNav content script initialized');
    
    addEventListeners();

    const observer = new MutationObserver(mutationCallback);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'id', 'hidden']
    });
}

// Call the main initialization function
initialize();

