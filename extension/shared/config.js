/**
 * Single source of truth, for the JS side, of values content.js,
 * background.js, panel.js and popup.js all need to agree on - the backend's
 * URL and the message-type string content.js and background.js use to talk
 * to each other. Before this file, both were repeated as literal strings
 * independently in four files: changing the backend's port meant hunting
 * down every occurrence, and a typo'd or renamed message type would break
 * the content.js <-> background.js relay silently, with no signal until it
 * was exercised live.
 *
 * NOT a complete single source of truth, though: manifest.json's
 * host_permissions also hardcodes "http://localhost:5001/*" separately -
 * JSON can't reference a JS constant, so that one has to be kept in sync
 * with EYENAV_BACKEND_URL below by hand if the backend's origin ever changes.
 *
 * Loaded as a plain script, not an ES module: content scripts and the
 * service worker can't share ES modules without a bundler, but they CAN
 * each load this same plain file - content.js via an extra item in
 * manifest.json's content_scripts.js array (which content.js also appears
 * in, so both share one global scope), background.js via importScripts(),
 * and panel.js/popup.js via an extra <script> tag loaded before them in
 * popup.html/sidepanel.html.
 */
const EYENAV_BACKEND_URL = 'http://localhost:5001';
const EYENAV_WEBSOCKET_URL = 'ws://localhost:5002/';
const EYENAV_MESSAGE_TYPES = {
    REPORT: 'EYENAV_REPORT',
    GET_VIEWPORT: 'EYENAV_GET_VIEWPORT',
};
