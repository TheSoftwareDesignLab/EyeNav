// Constants
const TOOLTIP_ID = 'hoverTooltip';
const HIGHLIGHT_STYLE_ID = 'hoverHighlightStyle';
const MAX_WIDTH = '500px';

// Global variables
let hoverTooltipEnabled = false;
let hoverHighlightEnabled = false;
let tooltip = null;
let hoverStartTime = null;
let currentHoveredElement = null;

/**
 * Tooltip creation
 */
function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.style.position = 'absolute';
    tooltip.style.backgroundColor = 'white';
    tooltip.style.border = '1px solid black';
    tooltip.style.padding = '5px';
    tooltip.style.zIndex = '1000';
    tooltip.style.display = 'none';
    tooltip.style.maxWidth = MAX_WIDTH;
    tooltip.style.overflow = 'auto';
    document.body.appendChild(tooltip);
}

/**
 * Highlight style creation
 */
function createHighlightStyle() {
    const highlightStyle = document.createElement('style');
    highlightStyle.id = HIGHLIGHT_STYLE_ID;
    highlightStyle.textContent = `
    .hover-highlight {
        outline: 2px solid red;
        outline-offset: -2px;
    }
    `;
    document.head.appendChild(highlightStyle);
}

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
 * Get the XPath of an element
 * @param {HTMLElement} element
 * @returns {string}
 */
function getXPath(element) {
    if (element.id) return `//*[@id="${element.id}"]`;
    if (element === document.body) return '/html/body';

    let ix = 0;
    let siblings = element.parentNode ? Array.from(element.parentNode.childNodes) : [];
    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element) return `${getXPath(element.parentNode)}/${element.tagName.toLowerCase()}[${ix + 1}]`;
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
    }
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
 * Update the tooltip with the element's outer HTML
 * @param {MouseEvent} event
 */
function updateTooltip(event) {
    const element = event.target;
    const outerHTML = element.outerHTML;

    if (!hoverTooltipEnabled && !hoverHighlightEnabled) {
        hideTooltip();
        removeHighlight(element);
        return;
    }

    if (hoverHighlightEnabled) {
        highlightElement(element);
    }

    if (hoverTooltipEnabled && isClickable(element)) {
        showTooltip(outerHTML);
    } else {
        hideTooltip();
        removeHighlight(element);
    }
}

/**
 * Hide the tooltip
 */
function hideTooltip() {
    tooltip.style.display = 'none';
    removeHighlight(currentHoveredElement);
    currentHoveredElement = null;
}

/**
 * Show the tooltip with the given content
 * @param {string} content
 */
function showTooltip(content) {
    tooltip.style.display = 'block';
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
    tooltip.innerText = content;
}

/**
 * Highlight an element
 * @param {HTMLElement} element
 */
function highlightElement(element) {
    element.classList.add('hover-highlight');
    currentHoveredElement = element;
}

/**
 * Remove the highlight from an element
 * @param {HTMLElement} element
 */
function removeHighlight(element) {
    if (element) {
        element.classList.remove('hover-highlight');
    }
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
        href: element.href || null,
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
    document.addEventListener('mousemove', updateTooltip, true); // Capture phase
    document.addEventListener('mouseout', hideTooltip, true);  // Capture phase
    document.addEventListener('click', handleClick, true);  // Capture phase
}

// /** TODO unused
//  * Remove event listeners
//  */
// function removeEventListeners() {
//     document.removeEventListener('mousemove', updateTooltip, true);
//     document.removeEventListener('mouseout', hideTooltip, true);
//     document.removeEventListener('click', handleClick, true);
// }

// Chrome storage and message listener
chrome.storage.sync.get(['hover', 'highlight'], function (result) {
    hoverTooltipEnabled = result.hover || false;
    hoverHighlightEnabled = result.highlight || false;
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'toggleHover') {
        hoverEnabled = request.enabled;
        if (!hoverEnabled) {
            hideTooltip();
            removeHighlight(currentHoveredElement);
        }
    }
});

/**
 * Main initialization function
 */
function initialize() {
    createTooltip();
    createHighlightStyle();

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
