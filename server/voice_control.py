import pyautogui
import settings
import os
import queue
import sounddevice as sd
import json
import time  
from vosk import Model, KaldiRecognizer
from websocket_server import message_queue
import interaction_logger

# Data structures

command_to_execute = None 
audio_queue = queue.Queue()
is_voice_recognition_active = True
is_typing_mode = False

model = Model(lang="en-us")
recognizer = KaldiRecognizer(model, 16000)

number_words = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10
}
control_words = ["input", "stop", "enter", "click", "back", "forward", "go"]


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
    
    print(f"DEBUG: Interaction -> {interaction}")
    interaction_logger.interaction_queue.put(dictionary)


def extract_number_from_words(words):
    """
    Extracts a number from a list of words
    @param words: list of words
    @return: number if found, None otherwise
    """
    for word in words:
        if word in number_words:
            return number_words[word]
    return None


def extract_direction_from_words(words):
    """
    Extracts a direction from a list of words
    @param words: list of words
    @return: 1 for up, -1 for down, None otherwise
    """
    if "up" in words:
        return -1  # Scroll down is negative
    elif "down" in words:
        return 1  # Scroll up is positive
    return None


def execute_command(command):
    """
    Executes a command based on the given text
    @param command: text command
    """
    global is_typing_mode
    
    command = command.lower()
    words = command.split()

    # Log the recognized command
    log_transcription(command)
    # send command to socket
    message_queue.put(command)

    if is_typing_mode:
        print(f"Typing: {command}")

        if "stop" in words or "enter" in words:
            print("Stopping typing mode...")
            is_typing_mode = False
            pyautogui.press("enter") 
            log_interaction("input", command)
            return
        
        elif command in control_words:
            print("Control word detected")
            is_typing_mode = False
            
            if command == "click":
                pyautogui.click()
                print("Mouse click performed")
            return

        filtered_words = [word for word in words if word not in control_words]
        if filtered_words:
            pyautogui.write(' '.join(filtered_words)) 
        return
    
    # Start typing mode
    if "input" in words:
        print("Entering typing mode...")
        is_typing_mode = True
        return

    
    if "go" in words:
        if "back" in words:
            pyautogui.hotkey('command', '[')
            log_interaction("back")
            print("Going back")
            return
        elif "forward" in words:
            pyautogui.hotkey('command', ']')
            log_interaction("forward")
            print("Going forward")
            return

        try:
            direction = extract_direction_from_words(words)
            if direction is None:
                print("No valid direction found")
                return
            
            scroll_units = extract_number_from_words(words)
            if scroll_units is None:
                print("No valid number of units found")
                return
            
            pyautogui.scroll(scroll_units * 10 * direction)
            log_interaction(f"go {direction}", direction, scroll_units)
            direction_text = "down" if direction == -1 else "up"
            print(f"Scrolling {scroll_units} units {direction_text}")
        except (ValueError, IndexError):
            print("Invalid scroll command")
        return

    if "back" in words:
        pyautogui.hotkey('command', '[')
        log_interaction("back")
        print("Going back")
    elif "forward" in words:
        pyautogui.hotkey('command', ']')
        log_interaction("forward")
        print("Going forward")
    

    if "click" in words:
        pyautogui.click()
        print("Mouse click performed")


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
                print(f"VOICE COMMAND HEARD: {command}")
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


def main():
    """
    Main function
    """
    global is_voice_recognition_active
    is_voice_recognition_active = True  

    with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype='int16',
                           channels=1, callback=audio_callback):
        recognize_voice()


if __name__ == "__main__":
    main()
