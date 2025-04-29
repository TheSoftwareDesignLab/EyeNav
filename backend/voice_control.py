import pyautogui
import pyperclip
import platform
import settings
import os
import queue
import sounddevice as sd
import json
import time  
from vosk import Model, KaldiRecognizer
from websocket_server import message_queue
import interaction_logger
from threading import Lock

# Data structures
command_to_execute = None 
audio_queue = queue.Queue()
is_voice_recognition_active = True
is_typing_mode = False
typed_text_buffer = ""
model_lock = Lock()
current_language = "en-us"
language_config = {}

def load_language_config(language_code):
    global language_config
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "commands.json")
    with open(config_path, "r", encoding="utf-8") as f:
        all_configs = json.load(f)
        language_config = all_configs.get(language_code, {})
        if not language_config:
            print(f"WARNING: Language config for {language_code} not found. Falling back to en-us.")
            language_config = all_configs["en-us"]

def set_voice_language(language_code):
    global model, recognizer, current_language
    with model_lock:
        current_language = language_code
        model = Model(lang=language_code)
        recognizer = KaldiRecognizer(model, 16000)
        load_language_config(language_code)


def get_current_language():
    return current_language

def get_transcription_file():
    return settings.transcription_file if settings.transcription_file else transcription_file


def log_transcription(text):
    """
    Logs the given text to the transcription file
    @param text: text to log
    """
    filename = get_transcription_file()
    with open(filename, "a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {text}\n")


def log_interaction(interaction, *args, **kwargs):
    """
    Logs an interaction to the test file.
    @param interaction: The string representing the interaction (input, back or forward)
    """
    dictionary = {"type": interaction}
    if interaction == "input":
        dictionary["text"] = args[0]
    
    if interaction == "go":
        dictionary["direction"] = args[0]
        dictionary["units"] = args[1]
    
    interaction_logger.interaction_queue.put(dictionary)



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
                log_interaction("input", typed_text_buffer.strip())
                typed_text_buffer = ""
            pyautogui.press("enter")
            log_interaction("enter")
            return
        
        elif command in language_config.get("control_words", []):
            is_typing_mode = False
            
            if typed_text_buffer.strip():
                log_interaction("input", typed_text_buffer.strip())
                typed_text_buffer = ""
            
            if command == language_config.get("click"):
                pyautogui.click()
                print("INFO: Mouse click performed")
            return

        
        filtered_words = [word for word in words if word not in language_config.get("control_words", [])]
        if filtered_words:
            typed_text = ' '.join(filtered_words)
            typed_text_buffer += ' ' + typed_text 
            type(' ' + typed_text)
        return
    
    # Start typing mode
    if language_config.get("typing_trigger") in words:
        print("INFO: Entering typing mode...")
        is_typing_mode = True
        return

    
    if language_config.get("go") in words:
        if language_config.get("back") in words:
            pyautogui.hotkey('command', '[')
            log_interaction("back")
            print("INFO: Going back")
            return
        elif language_config.get("forward") in words:
            pyautogui.hotkey('command', ']')
            log_interaction("forward")
            print("INFO: Going forward")
            return

        try:
            direction = extract_direction_from_words(words)
            if direction is None:
                print("INFO: No valid direction found")
                return
            pyautogui.scroll(10 * direction)
            log_interaction(f"go", direction, 10)
        except (ValueError, IndexError):
            print("INFO: Invalid scroll command")
        return

    if language_config.get("back") in words:
        pyautogui.hotkey('command', '[')
        log_interaction("back")
        print("INFO: Going back")
    elif language_config.get("forward") in words:
        pyautogui.hotkey('command', ']')
        log_interaction("forward")
        print("INFO: Going forward")
    

    if language_config.get("click") in words:
        pyautogui.click()
        print("INFO: Mouse click performed")

def type(text: str):
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


def main(language_code="en-us"):
    """
    Main function
    """
    set_voice_language(language_code)
    print(f"INFO: Starting voice control in {language_code}...")
    
    global is_voice_recognition_active
    is_voice_recognition_active = True  

    with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype='int16',
                           channels=1, callback=audio_callback):
        recognize_voice()


if __name__ == "__main__":
    main()
