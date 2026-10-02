import pyautogui
import pyperclip
import platform
import os
import queue
import sounddevice as sd
import json
import logging
import time
from vosk import Model, KaldiRecognizer
from websocket_server import message_queue
import event_bus
from threading import Lock

logger = logging.getLogger(__name__)

# Data structures
command_to_execute = None 
audio_queue = queue.Queue()
is_voice_recognition_active = True
is_typing_mode = False
typed_text_buffer = ""
model_lock = Lock()
current_language = "en-us"
language_config = {}
_transcription_file = None

def load_language_config(language_code, session=None):
    global language_config
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "commands.json")
    with open(config_path, "r", encoding="utf-8") as f:
        all_configs = json.load(f)
        language_config = all_configs.get(language_code, {})
        if not language_config:
            message = f"Language config for {language_code} not found. Falling back to en-us."
            logger.warning(message)
            if session:
                session.add_error(message)
            language_config = all_configs["en-us"]

def set_voice_language(language_code, session=None):
    global model, recognizer, current_language
    with model_lock:
        current_language = language_code
        model = Model(lang=language_code)
        recognizer = KaldiRecognizer(model, 16000)
        load_language_config(language_code, session)


def get_current_language():
    return current_language

def get_transcription_file():
    return _transcription_file


def log_transcription(text):
    """
    Logs the given text to the transcription file
    @param text: text to log
    """
    filename = get_transcription_file()
    with open(filename, "a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {text}\n")


def publish_interaction(interaction, *args, **kwargs):
    """
    Publishes a voice-driven interaction as a common event.
    @param interaction: The event type (input, enter, back, forward or go)
    """
    data = {}
    if interaction == "input":
        data["text"] = args[0]

    if interaction == "go":
        data["direction"] = args[0]
        data["units"] = args[1]

    event_bus.publish("voice", interaction, data)



def extract_direction_from_words(words):
    """
    Extracts a direction from a list of words
    @param words: list of words
    @return: 1 for up, -1 for down, None otherwise
    """
    directions = language_config.get("directions", {})
    for word in words:
        if word in directions:
            return directions[word]
    return None


def execute_command(command):
    """
    Executes a command based on the given text
    @param command: text command
    """
    global is_typing_mode, typed_text_buffer
    
    command = command.lower()
    words = command.split()
    log_transcription(command)
    message_queue.put(command)

    if is_typing_mode:
        print(f"INFO: Typing: {command}")

        if any(word in language_config.get("typing_exit", []) for word in words):
            print("INFO: Stopping typing mode...")
            is_typing_mode = False
            
            if typed_text_buffer.strip():
                publish_interaction("input", typed_text_buffer.strip())
                typed_text_buffer = ""
            pyautogui.press("enter")
            publish_interaction("enter")
            return
        
        elif command in language_config.get("control_words", []):
            is_typing_mode = False
            
            if typed_text_buffer.strip():
                publish_interaction("input", typed_text_buffer.strip())
                typed_text_buffer = ""
            
            if command == language_config.get("click"):
                pyautogui.click()
                print("INFO: Mouse click performed")
            return

        
        filtered_words = [word for word in words if word not in language_config.get("control_words", [])]
        if filtered_words:
            typed_text = ' '.join(filtered_words)
            typed_text_buffer += ' ' + typed_text
            _type_via_clipboard(' ' + typed_text)
        return
    
    # Start typing mode
    if language_config.get("typing_trigger") in words:
        print("INFO: Entering typing mode...")
        is_typing_mode = True
        return

    
    if language_config.get("go") in words:
        if language_config.get("back") in words:
            pyautogui.hotkey('command', '[')
            publish_interaction("back")
            print("INFO: Going back")
            return
        elif language_config.get("forward") in words:
            pyautogui.hotkey('command', ']')
            publish_interaction("forward")
            print("INFO: Going forward")
            return

        try:
            direction = extract_direction_from_words(words)
            if direction is None:
                print("INFO: No valid direction found")
                return
            pyautogui.scroll(10 * direction)
            publish_interaction("go", direction, 10)
        except (ValueError, IndexError):
            print("INFO: Invalid scroll command")
        return

    if language_config.get("back") in words:
        pyautogui.hotkey('command', '[')
        publish_interaction("back")
        print("INFO: Going back")
    elif language_config.get("forward") in words:
        pyautogui.hotkey('command', ']')
        publish_interaction("forward")
        print("INFO: Going forward")
    

    if language_config.get("click") in words:
        pyautogui.click()
        print("INFO: Mouse click performed")

def _type_via_clipboard(text: str):
    """
    Workaround for pyautogui.write to avoid issues with special characters
    @param text: text to type
    """
    pyperclip.copy(text)
    if platform.system() == "Darwin":
        pyautogui.hotkey("command", "v")
    else:
        pyautogui.hotkey("ctrl", "v")

def recognize_voice():
    """
    Recognizes voice commands
    """
    global is_voice_recognition_active
    while is_voice_recognition_active:
        data = audio_queue.get()  
        if recognizer.AcceptWaveform(data):
            result = recognizer.Result()
            result_json = json.loads(result)
            command = result_json.get("text", "")
            if command:
                print(f"INFO: Voice command heard -> {command}")
                execute_command(command)


def prepare_voice_control():
    """
    Resets everything a session's voice run depends on. Called by
    session_manager from the thread that STARTS the session, before the
    capturer thread exists - not from inside main(). main() used to set
    is_voice_recognition_active = True itself, after the (slow) model load: a
    Stop that arrived during that load set it False and main() then set it
    back to True, so the thread never exited and the session could not be
    stopped. Setting it here means a Stop during the load simply wins.

    Also clears what the previous session left behind: typing mode left on
    (the next session would start pasting dictation into whatever has focus),
    a half-typed buffer, and audio recorded before this session started.
    """
    global is_voice_recognition_active, is_typing_mode, typed_text_buffer
    is_voice_recognition_active = True
    is_typing_mode = False
    typed_text_buffer = ""
    while not audio_queue.empty():
        try:
            audio_queue.get_nowait()
        except queue.Empty:
            break


def stop_voice_control():
    """
    Stops voice control
    """
    global is_voice_recognition_active
    is_voice_recognition_active = False


def audio_callback(indata, frames, time, status):
    """
    Callback function for audio input, required in the sd.RawInputStream from sounddevice
    @param indata: input data
    @param frames: number of frames
    @param time: time
    @param status: status
    """
    audio_queue.put(bytes(indata))


def main(session):
    """
    Main function
    @param session: the session_recorder.Session this voice control run belongs to
    """
    global _transcription_file
    _transcription_file = session.transcription_file

    set_voice_language(session.language, session)
    print(f"INFO: Starting voice control in {session.language}...")

    with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype='int16',
                           channels=1, callback=audio_callback):
        recognize_voice()


if __name__ == "__main__":
    import session_recorder
    prepare_voice_control()
    main(session_recorder.create_session("Manual test", "http://localhost", "en-us", "eye_voice"))
