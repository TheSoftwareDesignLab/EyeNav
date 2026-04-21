from flask import Flask, jsonify, request
from flask_cors import CORS
from websocket_server import start_websocket_server
import threading
import interaction_logger
import time
import os
import settings
import mode_runtime

app = Flask(__name__)
CORS(app)

logging_thread = None
is_tracking = False
start_time = None
current_mode = None
initial_state_written = False 
runtime_state = None

@app.route('/status', methods=['GET'])
def status():
    return jsonify(
        {
            "status": "Server is running",
            "isRecording": is_tracking,
            "mode": current_mode,
            "defaultMode": mode_runtime.DEFAULT_MODE,
            "capabilities": mode_runtime.get_capabilities(),
        }
    ), 200

@app.route('/start', methods=['POST'])
def start_tracking():
    global logging_thread, is_tracking, start_time, current_mode, initial_state_written, runtime_state

    if is_tracking:
        return jsonify({"status": "A session is already running"}), 400

    start_time = time.strftime('%Y-%m-%d_%H-%M-%S')

    data = request.get_json() or {}
    language = request.headers.get('Language', 'en-us')
    page_name = data.get('pageName')
    page_url = data.get('pageUrl')
    requested_mode = data.get('mode', mode_runtime.DEFAULT_MODE)
    current_mode = mode_runtime.normalize_mode(requested_mode)

    capabilities = mode_runtime.get_capabilities()
    mode_capability = capabilities.get(current_mode, {"available": False, "reason": "Unsupported mode"})
    if not mode_capability.get("available"):
        return (
            jsonify(
                {
                    "status": "Failed to start selected mode",
                    "mode": current_mode,
                    "error": mode_capability.get("reason") or "Selected mode is unavailable",
                    "capabilities": capabilities,
                }
            ),
            400,
        )
    
    custom_path = data.get('filePath')
    filename = f"test_session_{start_time}.feature"

    if custom_path:
        if os.path.isdir(custom_path):
            test_file_path = os.path.join(custom_path, filename)
        else:
            test_file_path = custom_path
    else:
        test_file_path = os.path.join(settings.OUTPUT_DIR, filename)

    settings.test_file = test_file_path
    
    output_dir = os.path.dirname(settings.test_file)
    transcription_filename = f"transcription_{start_time}.txt"
    settings.transcription_file = os.path.join(output_dir, transcription_filename)
    
    is_tracking = True
    initial_state_written = False 

    os.makedirs(os.path.dirname(settings.test_file), exist_ok=True)

        
    with open(settings.test_file, "w", encoding="utf-8") as f:
        f.write(f"Feature: Replay of session on {time.strftime('%b %d at %I:%M:%S %p')}\n\n")
        f.write("@user1 @web\n")
        f.write(f'Scenario: User interacts with the web page named "{page_name}"\n\n')
        f.write(f'\tGiven I navigate to page "{page_url}"\n')

    if logging_thread is None or not logging_thread.is_alive():
        logging_thread = threading.Thread(target=interaction_logger.main, daemon=True)
        logging_thread.start()

    mode_start = mode_runtime.start_mode(current_mode, language)
    if not mode_start.get('success'):
        is_tracking = False
        return (
            jsonify(
                {
                    "status": "Failed to start selected mode",
                    "mode": current_mode,
                    "error": mode_start.get('message'),
                    "capabilities": mode_runtime.get_capabilities(),
                }
            ),
            400,
        )
    runtime_state = mode_start.get('runtime')

    return jsonify({"status": f"Session started in {current_mode} mode"}), 200

@app.route('/stop', methods=['GET'])
def stop_tracking():
    global is_tracking, runtime_state, current_mode
    if is_tracking:
        is_tracking = False
        mode_runtime.stop_mode(runtime_state)
        runtime_state = None
        current_mode = None
        return jsonify({"status": "Session stopped"}), 200
    else:
        return jsonify({"status": "A session is not running"}), 400

@app.route('/record-action', methods=['POST'])
def record_action():
    global initial_state_written
    data = request.get_json()

    if not is_tracking:
        return jsonify({"status": "Not recording"}), 400

    action_type = data.get('type')

   
    if not initial_state_written and action_type == 'initialState':
        try:
            viewport = data.get('viewport')
            pixel_ratio = data.get('devicePixelRatio')
            
            if viewport and pixel_ratio is not None:
                width = viewport['width']
                height = viewport['height']
                
                with open(settings.test_file, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                
                navigate_index = -1
                for i, line in enumerate(lines):
                    if 'Given I navigate to page' in line:
                        navigate_index = i
                        break 
                
                if navigate_index != -1:
                    viewport_step = f"\tGiven I set the viewport to {width}x{height}\n"
                    zoom_step = f"\tAnd I set zoom ratio to {pixel_ratio}\n" 
                    lines.insert(navigate_index, viewport_step)
                    lines.insert(navigate_index + 1, zoom_step) 
                
                with open(settings.test_file, 'w', encoding='utf-8') as f:
                    f.writelines(lines)
                
                initial_state_written = True 
                return jsonify({"status": "Initial state recorded"}), 200
            else:
                print("WARNING: initialState action missing data. Passing to logger.")

        except Exception as e:
            print(f"ERROR: Failed to write initial state steps: {e}")
           
    
   
    if action_type in ['initialState', 'zoomChange']:
        return jsonify({"status": "State change event ignored"}), 200
    
    
    interaction_logger.interaction_queue.put(data)
    return jsonify({"status": "Action recorded"}), 200

if __name__ == '__main__':
    start_websocket_server()
    app.run(host='0.0.0.0', port=5001)