import logging

from flask import Flask, jsonify, request
from flask_cors import CORS
from websocket_server import start_websocket_server
import event_bus
import event_model
import session_manager

# interaction_logger, session_manager, voice_control, and eye_tracking log
# recording/capturer failures through the logging module (not print()) so
# they go through a channel an operator can filter or redirect, instead of
# scattered stdout lines. This is the process entry point, so it's the one
# place that configures the root logger those modules' loggers propagate to.
# voice_control.py and eye_tracking.py still use print() for routine status
# output (not failures), and websocket_server.py uses print() exclusively and
# isn't affected by this at all - migrating those is a separate cleanup.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = Flask(__name__)
# allow_private_network=True: Chrome's Private Network Access policy blocks
# a request from a public page (any ordinary https:// site) to a loopback
# address like localhost:5001 unless the server explicitly opts in on the
# preflight. Without this, flask-cors answers Chrome's
# Access-Control-Request-Private-Network preflight with
# Access-Control-Allow-Private-Network: false (its own default), and every
# content.js fetch() to this server fails with "blocked by CORS policy: ...
# loopback address space" - regardless of Access-Control-Allow-Origin
# already being correct.
CORS(app, allow_private_network=True)


def _require_json_object():
    """
    Parses the request body as JSON and returns it only if it's an object
    (dict) - not just "truthy". `if not data` alone lets a syntactically
    valid but non-object body (a JSON array, string, number, or boolean)
    through, and every route below immediately crashes on data.get(...)
    with an unhandled AttributeError (a 500 with a Python traceback)
    instead of the app's own 400 JSON error contract. An empty object ({})
    is a valid, non-None result here - it's falsy in Python but a perfectly
    parseable request with no fields set, which callers may legitimately
    reject on their own (e.g. /start requiring pageName/pageUrl) without
    this helper misreporting it as "not JSON" like the old `if not data`
    check did.
    @return: the parsed dict, or None if the body isn't a JSON object
    """
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def _json_object_or_400():
    """
    Wraps _require_json_object() with the 400 response every POST route below
    needs when the body isn't a JSON object - previously each of the 3 routes
    duplicated the same "check for None, return the same error tuple" guard
    clause, so a future change to that error's wording or status code had to
    be made in three places in lockstep.
    @return: (data, None) on success, or (None, response) to return as-is
    """
    data = _require_json_object()
    if data is None:
        return None, (jsonify({"status": "Request body must be a JSON object"}), 400)
    return data, None


def _as_str(value):
    """
    Returns value if it's a string, else None. _require_json_object() only
    guarantees the BODY is an object - it says nothing about the individual
    field values inside it, and every route below eventually hands a field
    straight to code that assumes str (feature_writer.escape_gherkin_string's
    .replace(), or a `capture_mode not in ALLOWED_CAPTURE_MODES` set-membership
    test that needs its operand to be hashable). Coercing to None here lets
    those wrong-type values flow through the SAME "missing/invalid field"
    handling every route already has for a field that's simply absent,
    instead of crashing several calls deep with an unhandled 500.
    """
    return value if isinstance(value, str) else None


@app.route('/status', methods=['GET'])
def status():
    # Falls back to the just-stopped session's errors only when NO session
    # is active - not `get_active_session_errors() or get_last_session_errors()`,
    # which would be wrong: a currently-running session with zero errors
    # returns [], and [] is falsy in Python, so `or` would incorrectly leak
    # the PREVIOUS session's errors into a clean, still-running one. Checking
    # is_session_active() explicitly avoids that.
    if session_manager.is_session_active():
        errors = session_manager.get_active_session_errors()
    else:
        errors = session_manager.get_last_session_errors()
    return jsonify({
        "status": "Server is running",
        "sessionActive": session_manager.is_session_active(),
        "captureMode": session_manager.get_active_capture_mode(),
        # Previously a session with recording failures (a step that failed
        # to write, etc.) looked identical to a healthy one from here - the
        # only trace was a backend log line nobody watching /status would see.
        "hasErrors": bool(errors),
        "errorCount": len(errors),
        # The actual messages, not just a count - a bare "hasErrors: true"
        # still sends whoever's asking to go find the backend's own log
        # output to learn what happened, which is exactly the visibility
        # gap this field exists to close. Capped so a long degraded session
        # can't balloon this response.
        "errors": errors[-20:],
    }), 200


@app.route('/start', methods=['POST'])
def start_tracking():
    data, error = _json_object_or_400()
    if error:
        return error

    page_name = _as_str(data.get('pageName'))
    page_url = _as_str(data.get('pageUrl'))
    if not page_name or not page_url:
        return jsonify({"status": "pageName and pageUrl are required"}), 400

    language = request.headers.get('Language', 'en-us')
    # The popup and side panel both send captureMode now; the default only
    # covers a raw request that omits it. A non-string captureMode (a JSON
    # array/object) becomes None here, which session_manager.start_session's
    # existing "not in ALLOWED_CAPTURE_MODES" check already turns into a
    # clean 400 - without _as_str, that same value would raise an unhandled
    # TypeError there instead (a set membership test needs a hashable value).
    capture_mode = _as_str(data.get('captureMode', 'eye_voice'))
    # Passed through unvalidated on purpose: session_recorder.parse_viewport_dimension
    # is the one place that sanitizes these now, so the same guarantee holds
    # for any caller of start_session/create_session, not just this route.
    viewport_width = data.get('viewportWidth')
    viewport_height = data.get('viewportHeight')

    try:
        session_manager.start_session(
            page_name, page_url, language, capture_mode, viewport_width, viewport_height)
    except (ValueError, session_manager.SessionStartError, NotImplementedError) as error:
        return jsonify({"status": str(error)}), 400

    return jsonify({"status": f"Eye tracking and voice control started in {language}"}), 200


@app.route('/stop', methods=['GET'])
def stop_tracking():
    try:
        session_manager.stop_session()
    except session_manager.SessionStopError as error:
        return jsonify({"status": str(error)}), 400

    return jsonify({"status": "Eye tracking stopped"}), 200


@app.route('/tag-info', methods=['POST'])
def tag_info():
    data, error = _json_object_or_400()
    if error:
        return error

    tag_name = _as_str(data.get('tagName'))
    href = _as_str(data.get('href'))
    element_id = _as_str(data.get('id'))
    xpath = _as_str(data.get('xpath'))

    if session_manager.is_session_active():
        try:
            event_bus.publish("browser", "click", {
                "selector": tag_name,
                "href": href,
                "id": element_id,
                "xpath": xpath})
        except event_model.InvalidEventError as error:
            return jsonify({"status": str(error)}), 400

    return jsonify({"status": "Tag information received"}), 200


@app.route('/input-info', methods=['POST'])
def input_info():
    data, error = _json_object_or_400()
    if error:
        return error

    text = _as_str(data.get('text'))
    element_id = _as_str(data.get('id'))
    xpath = _as_str(data.get('xpath'))

    # content.js's change listener runs unconditionally in every mode, but in
    # eye_voice mode any text that ends up in a field got there through
    # voice_control's own OS-level paste (a real keystroke the page sees
    # natively) - which voice_control already logs as its own "voice"/"input"
    # event. Publishing this one too would record - and later replay - the
    # same typed text twice. "all" mode is left alone: it means both
    # modalities are meant to work at once, and there's no way to tell here
    # whether a given change came from real typing or from voice.
    if session_manager.is_session_active() and session_manager.get_active_capture_mode() != "eye_voice":
        try:
            event_bus.publish("browser", "input", {
                "text": text,
                "id": element_id,
                "xpath": xpath})
        except event_model.InvalidEventError as error:
            return jsonify({"status": str(error)}), 400

    return jsonify({"status": "Input information received"}), 200


if __name__ == '__main__':
    start_websocket_server()
    app.run(host='0.0.0.0', port=5001)  # flask app
