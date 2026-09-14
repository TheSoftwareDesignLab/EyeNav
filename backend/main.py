from flask import Flask, jsonify, request
from flask_cors import CORS
from websocket_server import start_websocket_server
import event_bus
import event_model
import session_manager

app = Flask(__name__)
CORS(app)


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
    # covers a raw request that omits it. mouse_keyboard/all still 400 until
    # mouse_capture/keyboard_capture exist (see session_manager.CAPTURERS).
    capture_mode = data.get('captureMode', 'eye_voice')

    try:
        session_manager.start_session(page_name, page_url, language, capture_mode)
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


if __name__ == '__main__':
    start_websocket_server()
    app.run(host='0.0.0.0', port=5001)  # flask app
