from flask import Flask, jsonify, request
from flask_cors import CORS
from websocket_server import start_websocket_server, message_queue
import threading
import eye_tracking
import voice_control
import interaction_logger
import time
import os
import settings

app = Flask(__name__)
CORS(app)

# Threads and global variables
tracking_thread = None
voice_thread = None
logging_thread = None

is_tracking = False
start_time = None


@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "Server is running"}), 200


@app.route('/start', methods=['POST'])
def start_tracking():
    global tracking_thread, voice_thread, logging_thread, is_tracking, start_time
    start_time = time.strftime('%Y-%m-%d_%H-%M-%S')  
        
    settings.test_file = os.path.join(settings.TEST_DIRECTORY, f"test_session_{start_time}.feature")
    settings.transcription_file = os.path.join(settings.TRANSCRIPTION_DIR, f"transcription_{start_time}.log")

    data = request.get_json()
    page_name = data.get('pageName')
    page_url = data.get('pageUrl')

    if tracking_thread is None or not tracking_thread.is_alive():
        is_tracking = True
        
        with open(settings.test_file, "w") as f:
            f.write(f"Feature: Replay of session on {time.strftime('%b %d at %I:%M:%S %p')}\n\n")
            f.write("@user1 @web\n")
            f.write(f'Scenario: User interacts with the web page named "{page_name}"\n\n')
            f.write(f'\tGiven I navigate to page "{page_url}"\n')

        tracking_thread = threading.Thread(target=eye_tracking.start_eye_tracking)
        tracking_thread.start()

        voice_thread = threading.Thread(target=voice_control.main)
        voice_thread.start()
        
        logging_thread = threading.Thread(target=interaction_logger.main, daemon=True)
        logging_thread.start()

        return jsonify({"status": "Eye tracking and voice control started"}), 200
    else:
        return jsonify({"status": "Eye tracking is already running"}), 400


@app.route('/stop', methods=['GET'])
def stop_tracking():
    global is_tracking

    if is_tracking:
        is_tracking = False
        eye_tracking.stop_eye_tracking()
        voice_control.stop_voice_control() 

        return jsonify({"status": "Eye tracking stopped"}), 200
    else:
        return jsonify({"status": "Eye tracking is not running"}), 400


@app.route('/tag-info', methods=['POST'])
def tag_info():
    data = request.get_json()
    tag_name = data.get('tagName')
    href = data.get('href')
    element_id = data.get('id')
    class_name = data.get('className')
    xpath = data.get('xpath')

    if is_tracking:
        interaction_logger.interaction_queue.put({
            "type": "click", 
            "selector": tag_name, 
            "href": href, 
            "id": element_id, 
            "xpath": xpath})
    

    return jsonify({"status": "Tag information received"}), 200


if __name__ == '__main__':
    start_websocket_server()
    app.run(host='0.0.0.0', port=5001) # flask app
