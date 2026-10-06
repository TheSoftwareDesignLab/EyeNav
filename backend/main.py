import logging

from flask import Flask, jsonify, request
from flask_cors import CORS
import security
from websocket_server import start_websocket_server
import event_bus
import event_model
import session_manager
import session_recorder

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
# CORS is limited to the extension's own origin (see security.py). It used to
# allow every origin, which let any website the user visits preflight and then
# call /start, /stop and the capture routes on this loopback server.
# allow_private_network=True is still needed: Chrome's Private Network Access
# policy otherwise answers the extension's preflight with
# Access-Control-Allow-Private-Network: false.
CORS(app, origins=[security.EXTENSION_ORIGIN], allow_private_network=True)

# Every request this backend accepts is a few small JSON fields. Without a
# cap, one POST of any size was parsed into memory and its text written to
# both the .jsonl and the .feature (a 20 MB body was accepted and written
# out twice), so any caller could fill the disk or memory.
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

# Longest value kept for any single captured field (typed text, id, xpath,
# href). Comfortably above anything typed by hand into a form field; longer
# values are cut rather than rejected, so the step is still recorded.
MAX_FIELD_LENGTH = 4096


@app.errorhandler(413)
def _request_too_large(_error):
    # Flask's default is an HTML page, which the extension can't parse.
    return jsonify({"status": "Request body too large"}), 413


@app.before_request
def _reject_untrusted_callers():
    """
    CORS only stops a page from READING a response; a "simple" cross-origin
    request (a form POST, an <img> GET) still reaches the route and acts. So
    callers are rejected up front: a foreign Origin, or a Host header that
    isn't loopback (DNS rebinding).
    """
    if not security.is_local_host(request.host) or not security.is_trusted_origin(request.headers.get("Origin")):
        return jsonify({"status": "Forbidden"}), 403


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
    Also cut to MAX_FIELD_LENGTH, so no single field can blow up the files
    it ends up in.
    """
    return value[:MAX_FIELD_LENGTH] if isinstance(value, str) else None


def _publish_browser_event(event_type, data, skip_in_modes=()):
    """
    Publishes a content.js-reported event to the event bus, but only while a
    session is recording - /tag-info, /input-info and /viewport-info all
    share this, so the "is something recording, and did the event pass
    validation" contract lives in one place instead of three copies.
    @param event_type: one of event_model.ALLOWED_TYPES_BY_SOURCE["browser"]
    @param data: the event's payload
    @param skip_in_modes: capture modes in which this event is deliberately dropped
    @return: an error response to return from the route, or None
    """
    # One read gives both "is a session active" (None means no) and its mode.
    mode = session_manager.get_active_capture_mode()
    if mode is None or mode in skip_in_modes:
        return None
    try:
        event_bus.publish("browser", event_type, data)
    except event_model.InvalidEventError as error:
        return jsonify({"status": str(error)}), 400
    return None


@app.route('/status', methods=['GET'])
def status():
    snapshot = session_manager.get_status()
    errors = snapshot["errors"]
    return jsonify({
        "status": "Server is running",
        "sessionActive": snapshot["sessionActive"],
        "captureMode": snapshot["captureMode"],
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

    language = request.headers.get('Language', 'en-us').lower()
    if not security.is_valid_language(language):
        return jsonify({"status": "Invalid Language header"}), 400
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
    except session_manager.SessionAlreadyRunningError as error:
        # 409, not the 400 every other start failure gets: the request itself
        # was fine, it just conflicts with the current state - and the body
        # says which mode is in the way so the panel can name it, instead of
        # showing a generic "failed to start".
        return jsonify({"status": str(error), "activeCaptureMode": error.active_capture_mode}), 409
    except (ValueError, session_manager.SessionStartError, NotImplementedError) as error:
        return jsonify({"status": str(error)}), 400
    except OSError as error:
        # create_session writing the .feature file (disk full, read-only dir):
        # without this it was an HTML 500 the extension can't parse.
        return jsonify({"status": f"Failed to create the session files: {error}"}), 500

    return jsonify({"status": f"Eye tracking and voice control started in {language}"}), 200


# POST, not GET: a GET that changes state can be fired by any page with an
# <img src> (no Origin header to check), a POST cannot.
@app.route('/stop', methods=['POST'])
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

    error = _publish_browser_event("click", {
        "selector": tag_name,
        "href": href,
        "id": element_id,
        "xpath": xpath})
    if error:
        return error

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
    error = _publish_browser_event("input", {
        "text": text,
        "id": element_id,
        "xpath": xpath}, skip_in_modes=("eye_voice",))
    if error:
        return error

    return jsonify({"status": "Input information received"}), 200


@app.route('/viewport-info', methods=['POST'])
def viewport_info():
    data, error = _json_object_or_400()
    if error:
        return error

    # Reuses session_recorder's own viewport validation instead of a second
    # copy - it already rejects the same malformed-value cases (wrong type,
    # zero, negative, Infinity, a JSON boolean) that /start's viewport fields
    # need rejected, and a resize event is just a viewport value arriving
    # mid-session instead of at session start.
    width = session_recorder.parse_viewport_dimension(data.get('width'))
    height = session_recorder.parse_viewport_dimension(data.get('height'))

    if width is not None and height is not None:
        error = _publish_browser_event("resize", {"width": width, "height": height})
        if error:
            return error

    return jsonify({"status": "Viewport information received"}), 200


if __name__ == '__main__':
    start_websocket_server()
    app.run(host='127.0.0.1', port=5001)  # flask app, loopback only
