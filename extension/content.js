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
 * Builds an XPath 1.0 string literal for a value that may itself contain
 * quote characters. XPath string literals have no escape mechanism for
 * their own delimiter, so a value with only one quote type is wrapped in
 * the other, and a value with both is built via concat() instead - without
 * this, an id containing a literal `"` (valid in HTML) would produce an
 * unparsable xpath like //*[@id="he"llo"] that fails or matches the wrong
 * element at replay time no matter how the surrounding Gherkin line escapes it.
 * @param {string} value
 * @returns {string}
 */
function xpathLiteral(value) {
    if (!value.includes('"')) return `"${value}"`;
    if (!value.includes("'")) return `'${value}'`;
    const pieces = [];
    value.split('"').forEach((part, index, parts) => {
        pieces.push(`"${part}"`);
        if (index < parts.length - 1) pieces.push(`'"'`);
    });
    return `concat(${pieces.join(', ')})`;
}

/**
 * Get the full XPath of an element
 * @param {HTMLElement} element
 * @returns {string}
 */
function getXPath(element) {
    if (element.id) return `//*[@id=${xpathLiteral(element.id)}]`;
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
 * Report a captured interaction to the backend. Every interaction type
 * (click, input, and whatever gets added later) reports the same way, so
 * this is the one place that knows about the EyeNav server's address.
 * @param {string} endpoint - path under http://localhost:5001
 * @param {Object} data - the interaction's payload
 * @param {string} label - used only for the console logs below
 */
// Chains every POST onto the previous one, so requests always reach the
// backend in the order they happened in the DOM. Without this, a field
// commit (`change`) and a click fired moments apart are two independent,
// unawaited fetches - on Flask's threaded dev server nothing guarantees the
// one that happened first is also the one the server finishes handling
// first, so interaction_logger (which writes steps in arrival order) could
// end up recording the click before the input that preceded it.
let reportQueue = Promise.resolve();

// How long a single report gets before it's given up on. Without this, one
// that never settles (background service worker not responding, a dropped
// connection, anything that leaves it neither resolving nor rejecting)
// would leave every request chained after it - i.e. every interaction for
// the rest of the page's life - waiting forever and never reaching the
// backend, with nothing in the console to explain why.
const REPORT_TIMEOUT_MS = 5000;

/**
 * Asks the background service worker to POST to the backend on this page's
 * behalf. content.js can't fetch() localhost:5001 directly: Chrome's
 * Private Network Access policy blocks a page-context request to a loopback
 * address ("Permission was denied for this request to access the `loopback`
 * address space"), even with host_permissions for it - a content script is
 * still considered part of the page it's injected into for that check. The
 * background service worker runs in the extension's own context instead,
 * which isn't subject to that restriction.
 * @param {string} endpoint
 * @param {Object} data
 * @returns {Promise<Object>} the backend's parsed JSON response
 */
function sendToBackground(endpoint, data) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Report timed out')), REPORT_TIMEOUT_MS);

        chrome.runtime.sendMessage({ type: 'EYENAV_REPORT', endpoint, data }, (response) => {
            clearTimeout(timeoutId);

            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response || !response.success) {
                reject(new Error((response && response.error) || 'Unknown error'));
                return;
            }
            resolve(response.data);
        });
    });
}

function reportEvent(endpoint, data, label) {
    console.log(`${label}, sending info:`, data);

    reportQueue = reportQueue
        .then(() => sendToBackground(endpoint, data))
        .then(responseData => console.log(`${label} info received:`, responseData))
        .catch(error => console.error('Error:', error));

    return reportQueue;
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

    reportEvent('/tag-info', tagData, 'Clicked');
}

/**
 * Elements that are, or ever were, a password field - checked instead of
 * just the live `type` attribute, since a "show password" toggle flips
 * type="password" to type="text" in place. Checking only the current type
 * at commit time would then record the plaintext password the instant the
 * user reveals and un-focuses it. Once an element lands in this set it's
 * excluded permanently, even if it's toggled back to type="password" later.
 * @type {WeakSet<HTMLElement>}
 */
const passwordFields = new WeakSet();

/**
 * Marks an element as a password field if its current type says so.
 * @param {HTMLElement} element
 */
function trackPasswordType(element) {
    if (element.tagName && element.tagName.toLowerCase() === 'input' &&
        (element.getAttribute('type') || '').toLowerCase() === 'password') {
        passwordFields.add(element);
    }
}

/**
 * Check if an element is a text field EyeNav should record typed values for.
 * Password fields are deliberately excluded so credentials never end up in
 * a plaintext .feature file.
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isTextInput(element) {
    if (passwordFields.has(element)) return false;
    const tag = element.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
        const type = (element.getAttribute('type') || 'text').toLowerCase();
        return ['text', 'search', 'email', 'url', 'tel', 'number'].includes(type);
    }
    return false;
}

/**
 * Handle a text field being committed (blurred, or Enter pressed) - sends
 * the field's final value, not one event per keystroke.
 * @param {Event} event
 */
function handleInputCommit(event) {
    const element = event.target;
    if (!isTextInput(element)) return;
    if (event.isEyeNavHandled) return;
    event.isEyeNavHandled = true;

    // `change` only fires when the value actually changed, so this also
    // correctly captures the user clearing a field back to empty - an
    // earlier `if (!value) return` here silently dropped that case.
    const inputData = {
        text: element.value,
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        xpath: getXPath(element)
    };

    reportEvent('/input-info', inputData, 'Input committed');
}

/**
 * Mutation callback function for webpages that are dynamically updated.
 * This will attach click handlers to new elements that are added to the DOM.
 * @param {MutationRecord[]} mutations
 */
function mutationCallback(mutations) {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;

            // Password inputs can arrive already in the DOM (not just via a
            // later type="password" -> type="text" toggle), e.g. a form
            // rendered client-side after this observer started.
            trackPasswordType(node);
            if (node.querySelectorAll) {
                node.querySelectorAll('input').forEach(trackPasswordType);
            }

            if (isRelevantElement(node)) {
                node.addEventListener('click', handleClick, true); // Attach our event handler in capture phase

                // Attach to relevant child elements as well
                node.querySelectorAll('a, button, input, select, textarea').forEach(child => {
                    child.addEventListener('click', handleClick, true); // In capture phase
                });
            }
        });

        if (mutation.type === 'attributes' && mutation.target.nodeType === 1) {
            const node = mutation.target;

            if (mutation.attributeName === 'type') {
                // Covers a field turning INTO a password field.
                trackPasswordType(node);
                // Covers the "show password" case: type flips FROM password
                // to text. The current type alone can't tell us that
                // anymore, so this only works because attributeOldValue is
                // enabled below - once flagged, isTextInput() excludes this
                // element permanently, regardless of its type from now on.
                if ((mutation.oldValue || '').toLowerCase() === 'password') {
                    passwordFields.add(node);
                }
            }

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
    document.addEventListener('change', handleInputCommit, true);  // Fires once the field is committed, not per keystroke
}


/**
 * Main initialization function
 */
function initialize() {
    console.log('EyeNav content script initialized');

    // Password fields already on the page when this script runs also need
    // to be flagged up front, not just ones that arrive/change afterward.
    document.querySelectorAll('input').forEach(trackPasswordType);

    addEventListeners();

    const observer = new MutationObserver(mutationCallback);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'id', 'hidden', 'type'],
        attributeOldValue: true
    });
}

// Call the main initialization function
initialize();

