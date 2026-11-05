/**
 * How EyeNav points at the element an interaction happened on, so the replay
 * can find that same element again. Loaded before content.js (manifest.json),
 * which uses getXPath() for every interaction and describeClickTarget() for
 * clicks.
 *
 * A locator has to survive the page being loaded again, in another browser:
 * third-party widgets injecting elements at the top of <body>, lists
 * rendering in a different order, ids generated at runtime. So each one is
 * built from what is stable about the element - a test id, a real id, its
 * name or label, a link's target, its visible text - and is only used if, on
 * the page as it is right now, it matches exactly one element: this one. The
 * absolute path from /html is the last resort.
 */

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

// Attributes that exist to identify an element in tests, tried first.
const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];

// Attributes that say what an element is, tried after its id.
const DESCRIPTIVE_ATTRIBUTES = ['name', 'aria-label', 'placeholder', 'title', 'alt'];

// Longest attribute value or visible text worth turning into a locator.
const MAX_LOCATOR_VALUE_LENGTH = 80;

/**
 * What a click on something inside it really is a click on: a click on the
 * <span> or <img> inside a link is a click on the link, and recording the
 * link lets the step use its href instead of a long path down to the span.
 */
const CLICKABLE_SELECTOR = [
    'a[href]', 'button', 'input', 'select', 'textarea', 'label', 'summary',
    '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]',
    '[role="checkbox"]', '[role="radio"]', '[role="switch"]', '[role="option"]',
].join(', ');

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
 * Whether an id looks generated at runtime, and so is likely to be different
 * the next time the page loads: React's useId (":r1:"), numbered ids such as
 * YouTube's "skip-button:2", Ember's "ember1234", Drupal's "edit-submit--2",
 * hashes and uuids.
 * @param {string} value
 * @returns {boolean}
 */
function looksGenerated(value) {
    return value.includes(':')
        || /\d{4,}/.test(value)
        || /--\d+$/.test(value)
        || (/^(ember|ext-gen|yui_|ui-id-|react-|radix-|headlessui-|mui-|downshift-|rc-|rc_)/i.test(value) && /\d/.test(value))
        || (/[0-9a-f]{8,}/i.test(value) && /\d/.test(value));
}

function isUsableValue(value) {
    return typeof value === 'string' && value.trim() !== '' &&
        value.length <= MAX_LOCATOR_VALUE_LENGTH && !/[\r\n]/.test(value);
}

/**
 * The element's text the way XPath's normalize-space() sees it: only space,
 * tab, CR and LF count as whitespace there (a no-break space does not), so a
 * text locator built from it matches what the replay will compare.
 * @param {Element} element
 * @returns {string}
 */
function visibleText(element) {
    return (element.textContent || '').replace(/[ \t\r\n]+/g, ' ').trim();
}

/** Elements that are identified by the text they show (a link, a button), not by their content. */
function isIdentifiedByText(element) {
    if (typeof element.matches !== 'function' || !element.matches(CLICKABLE_SELECTOR)) return false;
    return !['input', 'select', 'textarea'].includes(element.tagName.toLowerCase());
}

/**
 * XPath name test for one element. In an HTML document a plain name only
 * matches HTML elements, so an <svg> or <path> needs local-name() instead.
 * @param {Element} element
 * @returns {string}
 */
function xpathNameTest(element) {
    const name = element.localName || element.tagName.toLowerCase();
    if (element.namespaceURI && element.namespaceURI !== XHTML_NAMESPACE) {
        return `*[local-name()=${xpathLiteral(name)}]`;
    }
    return name;
}

/**
 * One positional step ("div[3]") from the element's parent to it, or null
 * for an element with no parent.
 * @param {Element} element
 * @returns {string|null}
 */
function positionalStep(element) {
    const parent = element.parentNode;
    if (!parent) return null;
    let index = 0;
    for (const sibling of Array.from(parent.childNodes)) {
        if (sibling.nodeType !== Node.ELEMENT_NODE) continue;
        if (sibling.tagName === element.tagName && sibling.namespaceURI === element.namespaceURI) index++;
        if (sibling === element) return `${xpathNameTest(element)}[${index}]`;
    }
    return null;
}

/** Positional steps from `ancestor` (exclusive) down to `element`, or null if it is not inside it. */
function stepsFrom(ancestor, element) {
    const steps = [];
    for (let node = element; node !== ancestor; node = node.parentNode) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
        const step = positionalStep(node);
        if (!step) return null;
        steps.unshift(step);
    }
    return steps;
}

/** The full positional path from /html - what every locator used to be, now the last resort. */
function absoluteXPath(element) {
    const steps = [];
    for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentNode) {
        const step = positionalStep(node);
        if (!step) break;
        steps.unshift(step);
    }
    return steps.length ? '/' + steps.join('/') : null;
}

/**
 * Whether `xpath` matches exactly one element on the page right now, and
 * that element is `element`. The replay waits for the first match of the
 * xpath, so a locator that also matches anything else could act on the
 * wrong element.
 * @param {string} xpath
 * @param {Element} element
 * @returns {boolean}
 */
function locatesOnly(xpath, element) {
    try {
        const matches = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        return matches.snapshotLength === 1 && matches.snapshotItem(0) === element;
    } catch (error) {
        return false;
    }
}

function stableIdOf(element) {
    const id = element.id;
    return isUsableValue(id) && !looksGenerated(id) ? id : null;
}

function tagOf(element) {
    return element.localName || element.tagName.toLowerCase();
}

/**
 * The element's own attributes to locate it by, most stable first: test ids,
 * its id (unless generated), then the ones that say what it is, and a link's
 * target. The XPath and the shadow DOM selector are both built from this one
 * list; an ancestor used as an anchor only gets the identifying ones.
 * @param {Element} element
 * @param {{identifyingOnly?: boolean}} [options]
 * @returns {Array<[string, string]>} [attribute, value] pairs
 */
function locatorAttributes(element, { identifyingOnly = false } = {}) {
    const pairs = [];
    const add = (attribute, value) => {
        if (isUsableValue(value)) pairs.push([attribute, value]);
    };
    TEST_ID_ATTRIBUTES.forEach(attribute => add(attribute, element.getAttribute(attribute)));
    add('id', stableIdOf(element));
    if (identifyingOnly) return pairs;
    DESCRIPTIVE_ATTRIBUTES.forEach(attribute => add(attribute, element.getAttribute(attribute)));
    const href = element.getAttribute('href');
    if (tagOf(element) === 'a' && !/^javascript:/i.test(href || '')) add('href', href);
    return pairs;
}

/** "//*[@data-testid=...]" for an attribute that identifies by itself, "//a[@href=...]" for one that describes. */
function attributeXPath(element, [attribute, value]) {
    const identifying = attribute === 'id' || TEST_ID_ATTRIBUTES.includes(attribute);
    return `//${identifying ? '*' : xpathNameTest(element)}[@${attribute}=${xpathLiteral(value)}]`;
}

/** Locators made only from the element's own attributes and text, most stable first. */
function ownXPathCandidates(element) {
    const candidates = locatorAttributes(element).map(pair => attributeXPath(element, pair));
    if (isIdentifiedByText(element)) {
        const text = visibleText(element);
        if (isUsableValue(text)) candidates.push(`//${xpathNameTest(element)}[normalize-space()=${xpathLiteral(text)}]`);
    }
    return candidates;
}

/**
 * A short path from the nearest ancestor that can be located by itself, so
 * elements injected elsewhere on the page (a widget's divs at the top of
 * <body>) don't shift it the way they shift an absolute path.
 * @param {Element} element
 * @returns {string|null}
 */
function anchoredXPath(element) {
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        const anchor = locatorAttributes(ancestor, { identifyingOnly: true })
            .map(pair => attributeXPath(ancestor, pair))
            .find(xpath => locatesOnly(xpath, ancestor));
        if (!anchor) continue;
        const steps = stepsFrom(ancestor, element);
        if (!steps) return null;
        const xpath = `${anchor}/${steps.join('/')}`;
        return locatesOnly(xpath, element) ? xpath : null;
    }
    return null;
}

/** The shadow root an element lives in, or null when it is part of the page itself. */
function shadowRootOf(element) {
    if (typeof element.getRootNode !== 'function') return null;
    const root = element.getRootNode();
    return root && root !== document && root.host ? root : null;
}

/**
 * The best XPath for an element of the page: the first of its own locators
 * that matches only it, else a path from a locatable ancestor, else the
 * absolute path. Null for an element XPath cannot reach (inside a shadow
 * root, or detached from the page).
 * @param {Element} element
 * @returns {string|null}
 */
function getXPath(element) {
    if (shadowRootOf(element)) return null;
    if (element === document.body) return '/html/body';
    return ownXPathCandidates(element).find(xpath => locatesOnly(xpath, element))
        || anchoredXPath(element)
        || absoluteXPath(element);
}

// ------------------------------------------------------------------ shadow DOM

/** Every open shadow root on the page, nested ones included. Closed ones can't be reached by anyone. */
function openShadowRoots(root = document, found = []) {
    root.querySelectorAll('*').forEach(element => {
        if (element.shadowRoot) {
            found.push(element.shadowRoot);
            openShadowRoots(element.shadowRoot, found);
        }
    });
    return found;
}

/**
 * CSS selectors for an element inside a shadow root, for the replay's ">>>"
 * lookup (WebdriverIO's deep selector, which searches every open shadow
 * root). Values with quotes, backslashes or combinator characters are left
 * out: that lookup strips the spaces around > + ~ even inside quotes.
 */
function shadowSelectorCandidates(element) {
    return locatorAttributes(element)
        .filter(([, value]) => !/["\\>+~]/.test(value))
        .map(([attribute, value]) => `${tagOf(element)}[${attribute}="${value}"]`);
}

/** Every element of the page and of its open shadow roots that matches `selector`, or null if it isn't valid CSS. */
function deepMatches(roots, selector) {
    try {
        return roots.flatMap(root => Array.from(root.querySelectorAll(selector)));
    } catch (error) {
        return null;
    }
}

/** The element's parent, or its host at the top of a shadow root - how the ">>>" lookup climbs. */
function parentOrHost(element) {
    const parent = element.parentNode;
    return parent && parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? parent.host || null : parent;
}

/** The first of the element's own selectors that matches it and nothing else, in any root. */
function ownShadowSelector(element, roots) {
    return shadowSelectorCandidates(element).find(selector => {
        const matches = deepMatches(roots, selector);
        return matches !== null && matches.length === 1 && matches[0] === element;
    }) || null;
}

/** "p:nth-child(2)": the element's position among its parent's (or shadow root's) children. */
function nthChildStep(element) {
    return `${element.localName}:nth-child(${Array.from(element.parentNode.children).indexOf(element) + 1})`;
}

/**
 * For an element with nothing stable of its own - the text of a cookie
 * banner, a wrapper div - the nearest ancestor that has, in the same shadow
 * root or as its host, followed by the positions down to the element: the
 * shadow DOM counterpart of anchoredXPath. The ">>>" lookup reads
 * "anchor > a > b" as a b that is a child of a, itself a child of anchor (or
 * at the top of anchor's shadow root, when anchor is the host).
 * @param {Element} element
 * @param {Array<Document|ShadowRoot>} roots
 * @returns {string|null}
 */
function anchoredShadowSelector(element, roots) {
    const chain = [];
    for (let node = element; node.parentNode; node = node.parentNode) {
        chain.unshift(nthChildStep(node));
        const anchorNode = parentOrHost(node);
        if (!anchorNode || anchorNode.nodeType !== Node.ELEMENT_NODE) return null;
        const anchor = ownShadowSelector(anchorNode, roots);
        if (anchor) {
            const path = chain.join(' > ');
            // A CSS query can't cross into a shadow root, so the step from
            // the anchor to the top of the path is checked by hand.
            const matches = (deepMatches(roots, path) || []).filter(match => {
                let top = match;
                for (let step = 1; step < chain.length; step++) top = top.parentNode;
                const above = parentOrHost(top);
                return above && above.nodeType === Node.ELEMENT_NODE && above.matches(anchor);
            });
            return matches.length === 1 && matches[0] === element ? `${anchor} > ${path}` : null;
        }
        // Reached the host and it has nothing stable either.
        if (anchorNode !== node.parentNode) return null;
    }
    return null;
}

/**
 * A selector that finds this element, and nothing else, across the page and
 * every open shadow root - or null when neither it nor any ancestor up to its
 * host has anything stable to build one from.
 * @param {Element} element
 * @returns {string|null}
 */
function getShadowSelector(element) {
    const roots = [document, ...openShadowRoots()];
    return ownShadowSelector(element, roots) || anchoredShadowSelector(element, roots);
}

/** The element in the page itself that hosts `element`, through every level of shadow roots. */
function outermostHost(element) {
    for (let root = shadowRootOf(element); root; root = shadowRootOf(element)) element = root.host;
    return element;
}

// ---------------------------------------------------------------------- clicks

function firstMatch(selector) {
    try {
        return document.querySelector(selector);
    } catch (error) {
        return null;
    }
}

/**
 * The element a click was really on. A listener on the document only gets
 * the shadow host as event.target for a click inside a shadow root (a cookie
 * banner, a web component), so the composed path is read instead; and a
 * click inside a link or button counts as a click on it. content.js decides
 * from this element whether the click is recorded at all.
 * @param {MouseEvent} event
 * @returns {Element}
 */
function clickedElement(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = path.find(node => node && node.nodeType === Node.ELEMENT_NODE) || event.target;
    const clickable = typeof target.closest === 'function' ? target.closest(CLICKABLE_SELECTOR) : null;
    return clickable || target;
}

/** The id, if the id step's own lookup ("#" + id) lands on this element. */
function clickableId(element) {
    const id = stableIdOf(element);
    if (!id || !/^[A-Za-z][\w-]*$/.test(id)) return null;
    return firstMatch(`#${id}`) === element ? id : null;
}

/** The href, if the href step's own lookup (the first a[href="..."]) lands on this link. */
function clickableHref(element) {
    if (element.tagName.toLowerCase() !== 'a') return null;
    const href = element.getAttribute('href');
    if (!href || /["\\]/.test(href) || /^javascript:/i.test(href)) return null;
    return firstMatch(`a[href="${href}"]`) === element ? href : null;
}

/**
 * Everything the backend needs to turn a click on `element` (see
 * clickedElement) into replayable steps. An element inside a shadow root
 * gets a shadow selector (XPath can't reach into one), built from the
 * element itself or from its nearest ancestor with something stable. Only if
 * nothing up to its host has, the click falls back to the host, as before.
 * @param {Element} element
 * @returns {{tagName: string, href: ?string, id: ?string, xpath: ?string, shadowSelector: ?string}}
 */
function describeClickTarget(element) {
    if (shadowRootOf(element)) {
        const shadowSelector = getShadowSelector(element);
        if (shadowSelector) {
            return { tagName: element.localName, href: null, id: null, xpath: null, shadowSelector };
        }
        element = outermostHost(element);
    }
    return {
        tagName: element.tagName.toLowerCase(),
        href: clickableHref(element),
        id: clickableId(element),
        xpath: getXPath(element),
        shadowSelector: null,
    };
}
