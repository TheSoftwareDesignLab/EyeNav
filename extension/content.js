/**
 * Tag names EyeNav treats as interactive: relevant for click capture
 * (isRelevantElement below) and for attaching listeners to matching
 * descendants when new DOM subtrees appear (mutationCallback below).
 * @type {string[]}
 */
const INTERACTIVE_TAGS = ['a', 'button', 'input', 'select', 'textarea'];
const INTERACTIVE_TAGS_SELECTOR = INTERACTIVE_TAGS.join(', ');

/**
 * Check if an element is relevant
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isRelevantElement(element) {
    const isVisible = element.offsetWidth > 0 && element.offsetHeight > 0;
    // Deliberately not INTERACTIVE_TAGS: div/span are included here because a
    // visible div/span can still be a custom clickable widget, but they're
    // excluded from INTERACTIVE_TAGS_SELECTOR since auto-attaching a listener
    // to every div/span under a mutated node would be almost every element.
    const isInteractiveTag = [...INTERACTIVE_TAGS, 'div', 'span'].includes(element.tagName.toLowerCase());
    const hasClickSemantics = element.onclick || element.getAttribute('role') === 'button' || element.hasAttribute('tabindex');
    const isLink = element.href !== undefined && element.href !== '';

    return (isVisible && isInteractiveTag) || hasClickSemantics || isLink;
}

/**
 * Report a captured interaction to the backend. Every interaction type
 * (click, input, and whatever gets added later) reports the same way, so
 * this is the one place that knows about the EyeNav server's address.
 * @param {string} endpoint - path under EYENAV_BACKEND_URL (see shared/config.js)
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

        chrome.runtime.sendMessage({ type: EYENAV_MESSAGE_TYPES.REPORT, endpoint, data }, (response) => {
            clearTimeout(timeoutId);

            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response || !response.success) {
                reject(new Error((response && response.error) || 'Unknown error'));
                return;
            }
            // `success` only says the relay reached the backend; `ok` says
            // the backend accepted it. Without this check a 400/500 (a
            // rejected event) was logged as "info received" and the step
            // silently never made it into the .feature.
            if (response.ok === false) {
                reject(new Error(`Backend rejected ${endpoint}: ${(response.data && response.data.status) || 'unknown reason'}`));
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
 * The control a just-clicked <label> belongs to, until that click's task ends.
 * Clicking a label makes the browser click its control too (the checkbox,
 * radio or field it labels), as a second click event within the same task.
 * Recording both would replay as two clicks - a checkbox ticked and then
 * unticked - so that second click is not reported.
 * @type {HTMLElement|null}
 */
let labelledControl = null;

/**
 * Whether a click on `element` is the browser's own click on the control of
 * the label clicked just before, and remembers the control when `element` is
 * a label.
 * @param {Element} element
 * @returns {boolean}
 */
function isLabelEcho(element) {
    if (labelledControl && element === labelledControl) {
        labelledControl = null;
        return true;
    }
    labelledControl = element.tagName.toLowerCase() === 'label' && element.control ? element.control : null;
    if (labelledControl) setTimeout(() => { labelledControl = null; }, 0);
    return false;
}

/**
 * Whether the click landed on the bare page - <body> or <html> itself, on
 * no element of it. There is nothing there to point the replay at: a step
 * that clicks the body clicks the middle of the whole page, which scrolls it
 * and can land on whatever link happens to be there.
 * @param {Element} element
 * @returns {boolean}
 */
function isPageBackground(element) {
    return element === document.body || element === document.documentElement;
}

/**
 * Handle the click event
 * @param {MouseEvent} event
 */
function handleClick(event) {
    if (event.isEyeNavHandled) return;  // Prevent duplicate execution
    event.isEyeNavHandled = true;  // Mark event as handled by EyeNav

    const element = clickedElement(event);
    if (isLabelEcho(element) || isPageBackground(element)) return;

    flushPendingReports();
    commitFocusedField(element);

    // Only what the backend turns into a step (see locator.js). textContent
    // used to be sent too (and ignored there): a click on <body> or a large
    // container posted the whole page's text, whatever it contained.
    reportEvent('/tag-info', describeClickTarget(element), 'Clicked');
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
    const isSelect = element.tagName && element.tagName.toLowerCase() === 'select';
    if (!isSelect && !isTextInput(element)) return;
    if (event.isEyeNavHandled) return;
    event.isEyeNavHandled = true;

    flushPendingReports();

    if (isSelect) {
        reportSelectedOption(element);
        return;
    }

    // `change` only fires when the value actually changed, so this also
    // correctly captures the user clearing a field back to empty - an
    // earlier `if (!value) return` here silently dropped that case. A value
    // commitFocusedField already reported is not reported again.
    if (reportedValues.get(element) === element.value) return;
    reportFieldValue(element);
}

/**
 * The value each text field last reported, so a value is recorded once even
 * when both handleInputCommit and commitFocusedField see it.
 * @type {WeakMap<HTMLElement, string>}
 */
const reportedValues = new WeakMap();

function reportFieldValue(element) {
    reportedValues.set(element, element.value);
    reportEvent('/input-info', {
        text: clipText(element.value),
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        xpath: getXPath(element)
    }, 'Input committed');
}

/** Reports the field's value unless it is the one it already reported, or has had since the page loaded. */
function reportFieldIfChanged(field) {
    const committed = reportedValues.has(field) ? reportedValues.get(field) : field.defaultValue;
    if (field.value !== committed) reportFieldValue(field);
}

/**
 * Reports what was typed into the focused text field before a click on
 * something else, if the field hasn't reported it yet. A field reports its
 * value on `change`, when focus leaves it - but a list of suggestions keeps
 * the focus in the field while one of them is clicked, and that click
 * usually loads another page: `change` never fires, and the typed text was
 * lost, leaving a replay that clicks a suggestion that never appears.
 * @param {Element} clicked - the element the click is on
 */
function commitFocusedField(clicked) {
    const field = document.activeElement;
    if (!field || field === clicked || !isTextInput(field)) return;
    reportFieldIfChanged(field);
}

/**
 * A move through the tab's history. The browser's own Back and Forward
 * (toolbar buttons, a trackpad swipe, a mouse's side buttons, shortcuts) are
 * recorded by background.js, which sees every one of them, whatever page is
 * being left. From here it only needs to know when the page made the move
 * itself (userInitiated is false: history.back() from the page's own "Back"
 * button), because the click that ran it is already recorded. Before the
 * browser moves, whatever was typed into the focused field is reported.
 * @param {NavigateEvent} event
 */
function handleNavigate(event) {
    if (event.navigationType !== 'traverse') return;
    if (!event.userInitiated) {
        chrome.runtime.sendMessage({ type: EYENAV_MESSAGE_TYPES.PAGE_MOVED });
        return;
    }
    flushPendingReports();
    commitFocusedField(null);
}

/**
 * Enter in a single-line text field submits its form (a search box, a login
 * form). The field's value is reported first, then the key, so the replay
 * types the text and then presses Enter. No other key is recorded: what was
 * typed is read from the field itself.
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
    if (event.key !== 'Enter' || event.isComposing) return;
    const field = event.target;
    if (!isTextInput(field) || field.tagName.toLowerCase() === 'textarea') return;

    flushPendingReports();
    reportFieldIfChanged(field);
    reportEvent('/key-info', { key: 'Enter' }, 'Key pressed');
}

// Same limit the backend applies to any single captured field (MAX_FIELD_LENGTH
// in main.py). Cutting here too keeps one huge text from making the whole
// request exceed the backend's body size limit and be rejected outright.
const MAX_REPORTED_TEXT = 4096;

function clipText(value) {
    return String(value).slice(0, MAX_REPORTED_TEXT);
}

/**
 * Reports waiting for a gesture to SETTLE (dragging a window edge, scrolling)
 * instead of firing on every tick of it. They are flushed before anything
 * else is reported - see flushPendingReports.
 * @type {Set<{flush: function}>}
 */
const pendingReporters = new Set();

/**
 * Builds a reporter that calls `send` once `delayMs` has passed with no new
 * trigger, so a gesture that fires dozens of events yields one report: the
 * state it ended in.
 * @param {number} delayMs
 * @param {function(): void} send
 */
function createSettledReporter(delayMs, send) {
    let timer = null;
    const reporter = {
        trigger() {
            clearTimeout(timer);
            timer = setTimeout(reporter.flush, delayMs);
            pendingReporters.add(reporter);
        },
        // Reports now, if something is waiting.
        flush() {
            if (timer === null) return;
            clearTimeout(timer);
            timer = null;
            pendingReporters.delete(reporter);
            send();
        },
        // Drops what is waiting without reporting it.
        cancel() {
            clearTimeout(timer);
            timer = null;
            pendingReporters.delete(reporter);
        },
    };
    return reporter;
}

/**
 * Sends every report still waiting for its gesture to settle. Called before
 * each click, field commit, selection and drop is reported: the wait delays a
 * resize or scroll by up to a few hundred ms, so without this an action made
 * right after one was reported FIRST and the .feature would replay them in the
 * wrong order.
 */
function flushPendingReports() {
    [...pendingReporters].forEach(reporter => reporter.flush());
}

// How long to wait after the last resize tick before reporting the viewport
// size - a window drag fires 'resize' continuously (dozens of events for one
// gesture), so reporting on every tick would flood the session with
// near-duplicate viewport steps. Reporting only once resizing settles
// records the one size that actually mattered: the one the user ended up at.
const RESIZE_REPORT_DEBOUNCE_MS = 400;

// Browser zoom (Ctrl +/-) also fires 'resize' and changes innerWidth/Height
// (they're in CSS px), but the window itself didn't change size. It shows up
// as a devicePixelRatio change, which is how handleResize tells the two apart.
let lastDevicePixelRatio = window.devicePixelRatio;

function reportViewportNow() {
    reportEvent('/viewport-info', { width: window.innerWidth, height: window.innerHeight }, 'Viewport resized');
}

const resizeReporter = createSettledReporter(RESIZE_REPORT_DEBOUNCE_MS, reportViewportNow);

/**
 * Handle the window being resized mid-session - debounced (see above), so
 * only the final size after a resize gesture settles gets reported, not
 * every intermediate frame. A resize that is really a zoom change is dropped
 * (along with any pending report, which would carry the zoomed size) instead
 * of being recorded as the window shrinking or growing.
 */
function handleResize() {
    if (window.devicePixelRatio !== lastDevicePixelRatio) {
        lastDevicePixelRatio = window.devicePixelRatio;
        resizeReporter.cancel();
        return;
    }
    resizeReporter.trigger();
}

// ------------------------------------------------------------------ scrolling

// A scroll gesture fires a stream of 'scroll' events; only where it ended up
// matters, so it is reported once it has been quiet this long.
const SCROLL_REPORT_DEBOUNCE_MS = 300;

/** Per scrolled target (the document, or one scrollable element): its settled reporter and last reported position. */
const scrollStates = new WeakMap();

function isPageScroll(target) {
    return target === document || target === document.documentElement || target === document.scrollingElement;
}

/**
 * Typing makes these scroll by themselves (a textarea following the caret, a
 * long line in an input, an editor growing past its box). That is the text
 * being entered, which is recorded on its own, not a scroll the user made.
 */
function scrollsBecauseOfTyping(element) {
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true;
}

function scrollPosition(target) {
    return target === document
        ? { x: Math.round(window.scrollX), y: Math.round(window.scrollY) }
        : { x: Math.round(target.scrollLeft), y: Math.round(target.scrollTop) };
}

function reportScroll(target, state) {
    const position = scrollPosition(target);
    if (state.last && state.last.x === position.x && state.last.y === position.y) return;

    // No xpath means "the page" to the backend, so an element whose xpath can't
    // be computed (a detached node) is skipped rather than sent as a page scroll.
    const xpath = target === document ? null : getXPath(target);
    if (target !== document && !xpath) return;

    state.last = position;
    reportEvent('/scroll-info', { x: position.x, y: position.y, xpath }, 'Scrolled');
}

/**
 * Handle any scroll (captured on the way down: element scrolls don't bubble).
 * @param {Event} event
 */
function handleScroll(event) {
    const target = isPageScroll(event.target) ? document : event.target;
    if (target !== document && (target.nodeType !== 1 || scrollsBecauseOfTyping(target))) return;

    let state = scrollStates.get(target);
    if (!state) {
        state = { last: null };
        state.reporter = createSettledReporter(SCROLL_REPORT_DEBOUNCE_MS, () => reportScroll(target, state));
        scrollStates.set(target, state);
    }
    state.reporter.trigger();
}

// ------------------------------------------------------ dropdowns, rich text

/**
 * Report which option a <select> ended up on. The option's visible text is
 * what the replay picks it by, whitespace normalized the way WebdriverIO's
 * selectByVisibleText compares it. A multiple-select is skipped: its change
 * event only carries the final set, not which option was toggled.
 * @param {HTMLSelectElement} select
 */
function reportSelectedOption(select) {
    if (select.multiple) return;
    const option = select.selectedOptions && select.selectedOptions[0];
    if (!option) return;

    reportEvent('/select-info', {
        text: clipText(option.text.replace(/\s+/g, ' ').trim()),
        id: select.id || null,
        xpath: getXPath(select)
    }, 'Option selected');
}

/**
 * The element that owns the editing of a contenteditable region: typing lands
 * in the host, but focus events can come from a descendant of it.
 * @param {Element} element
 * @returns {Element|null}
 */
function editingHost(element) {
    if (!element || element.nodeType !== 1 || !element.isContentEditable) return null;
    let host = element;
    while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
    return host;
}

/** Text of each editing host when focus arrived, to tell whether it changed by the time focus leaves. */
const editableBaselines = new WeakMap();

function handleEditableFocusIn(event) {
    const host = editingHost(event.target);
    if (host) editableBaselines.set(host, host.innerText);
}

/**
 * A contenteditable region fires no `change` event, so what was typed into it
 * is read when focus leaves, like a text field's commit - and replayed with
 * the same step, since to the replay it is just a field to type into.
 * @param {FocusEvent} event
 */
function handleEditableFocusOut(event) {
    const host = editingHost(event.target);
    if (!host || !editableBaselines.has(host)) return;

    const before = editableBaselines.get(host);
    editableBaselines.delete(host);
    if (host.innerText === before) return;

    flushPendingReports();
    reportEvent('/input-info', {
        text: clipText(host.innerText),
        tagName: host.tagName.toLowerCase(),
        id: host.id || null,
        xpath: getXPath(host)
    }, 'Rich text committed');
}

// --------------------------------------------------------------- drag and drop

/** The element a drag started on, until it is dropped or cancelled. */
let dragSource = null;

function elementOf(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement || null;
}

function handleDragStart(event) {
    dragSource = elementOf(event.target);
}

function handleDragEnd() {
    dragSource = null;
}

/**
 * Report an HTML5 drag-and-drop from one element of the page onto another.
 * A drop with no drag started on this page (a file from the desktop) has no
 * source to replay, so it is ignored. Drags driven by mouse events instead
 * of the HTML5 API (many sortable-list libraries) fire none of these events
 * and are not captured.
 * @param {DragEvent} event
 */
function handleDrop(event) {
    const source = dragSource;
    const target = elementOf(event.target);
    dragSource = null;
    if (!source || !target || source === target) return;

    const sourceXpath = getXPath(source);
    const targetXpath = getXPath(target);
    if (!sourceXpath || !targetXpath) return;

    flushPendingReports();
    reportEvent('/drag-info', { sourceXpath, targetXpath }, 'Dragged');
}

/**
 * Attaches the click handler to `node` itself and to every descendant that
 * matches INTERACTIVE_TAGS_SELECTOR - shared by both branches of
 * mutationCallback below, since a newly-added node and a node whose
 * attributes just changed need the exact same "this node plus its
 * interactive descendants" treatment.
 * @param {HTMLElement} node
 */
function attachClickListeners(node) {
    node.addEventListener('click', handleClick, true); // Capture phase
    node.querySelectorAll(INTERACTIVE_TAGS_SELECTOR).forEach(child => {
        child.addEventListener('click', handleClick, true); // Capture phase
    });
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
                attachClickListeners(node);
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
                attachClickListeners(node);
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
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('focusin', handleEditableFocusIn, true);
    document.addEventListener('focusout', handleEditableFocusOut, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('dragend', handleDragEnd, true);
    document.addEventListener('drop', handleDrop, true);
    if (window.navigation) window.navigation.addEventListener('navigate', handleNavigate);
}

/**
 * Reports this page's current viewport size on request. Answering from here
 * (a content script that's already running, declared unconditionally in
 * manifest.json) instead of panel.js injecting a script via
 * chrome.scripting.executeScript sidesteps that API's permission model:
 * executeScript only works on the one tab Chrome granted `activeTab` to -
 * whichever tab was focused the moment the extension's icon was clicked -
 * and the side panel is designed to stay open across tab switches, so asking
 * for the viewport of a DIFFERENT tab than that one silently failed.
 * chrome.tabs.sendMessage, by contrast, just needs a content script already
 * listening in the target tab, which this one always is.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== EYENAV_MESSAGE_TYPES.GET_VIEWPORT) return false;
    sendResponse({ width: window.innerWidth, height: window.innerHeight });
    return false; // synchronous response, no need to keep the channel open
});


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

