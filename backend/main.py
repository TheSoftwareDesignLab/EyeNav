from flask import Flask, jsonify, request
from flask_cors import CORS
from websocket_server import start_websocket_server
import event_bus
import event_model
import session_manager

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


def _parse_viewport_dimension(value):
    """
    Returns value as a positive int, or None if it isn't one - so a
    malformed or missing viewportWidth/viewportHeight is silently treated
    as "not provided" rather than producing a Gherkin viewport line that
    fails to match {int}x{int} at replay time.
    """
    # bool is a subclass of int in Python (int(True) == 1), so without this
    # check a JSON `true`/`false` would silently pass as a valid dimension
    # instead of being rejected as malformed.
    if isinstance(value, bool):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        # OverflowError: Python's json module parses the non-standard
        # "Infinity" literal into float('inf') by default, and int() raises
        # OverflowError (not ValueError) converting that to an int.
        return None
    return parsed if parsed > 0 else None


@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        "status": "Server is running",
        "sessionActive": session_manager.is_session_active(),
        "captureMode": session_manager.get_active_capture_mode(),
    }), 200


@app.route('/start', methods=['POST'])
def start_tracking():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "Request body must be JSON"}), 400

    page_name = data.get('pageName')
    page_url = data.get('pageUrl')
    if not page_name or not page_url:
        return jsonify({"status": "pageName and pageUrl are required"}), 400

    language = request.headers.get('Language', 'en-us')
    # The popup and side panel both send captureMode now; the default only
    # covers a raw request that omits it.
    capture_mode = data.get('captureMode', 'eye_voice')
    viewport_width = _parse_viewport_dimension(data.get('viewportWidth'))
    viewport_height = _parse_viewport_dimension(data.get('viewportHeight'))

    try:
        session_manager.start_session(
            page_name, page_url, language, capture_mode, viewport_width, viewport_height)
    except ValueError as error:
        return jsonify({"status": str(error)}), 400
    except (session_manager.SessionStartError, NotImplementedError) as error:
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
    data = request.get_json()
    tag_name = data.get('tagName')
    href = data.get('href')
    element_id = data.get('id')
    xpath = data.get('xpath')

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
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "Request body must be JSON"}), 400

    text = data.get('text')
    element_id = data.get('id')
    xpath = data.get('xpath')

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
