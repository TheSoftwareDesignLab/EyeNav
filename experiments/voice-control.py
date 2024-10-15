import pyautogui
import os
import queue
import sounddevice as sd
import json
from vosk import Model, KaldiRecognizer

command_to_execute = None
audio_queue = queue.Queue()

model = Model(lang="en-us")
recognizer = KaldiRecognizer(model, 16000)

def execute_command(command):
    command = command.lower()
    if "click" in command:
        pyautogui.click()
        print("Mouse clicked")
    elif "back" in command:
        pyautogui.hotkey('alt', 'left')
        print("Going back")
    elif "forward" in command:
        pyautogui.hotkey('alt', 'right')
        print("Going forward")
    elif "zoom in" in command:
        pyautogui.hotkey('ctrl', '+')
        print("Zoomed in")
    elif "zoom out" in command:
        pyautogui.hotkey('ctrl', '-')
        print("Zoomed out")
    elif "scroll up" in command:
        pyautogui.scroll(20)
        print("Scrolled up")
    elif "scroll down" in command:
        pyautogui.scroll(-20)
        print("Scrolled down")
    elif "scroll right" in command:
        pyautogui.hscroll(20)
        print("Scrolled right")
    elif "scroll left" in command:
        pyautogui.hscroll(-20)
        print("Scrolled left")

def recognize_voice():
    while True:
        data = audio_queue.get()  
        if recognizer.AcceptWaveform(data):
            result = recognizer.Result()
            result_json = json.loads(result)
            command = result_json.get("text", "")
            if command:
                print(f"Recognized: {command}")
                execute_command(command)

def audio_callback(indata, frames, time, status):
    audio_queue.put(bytes(indata))

def main():
    with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype='int16',
                           channels=1, callback=audio_callback):
        recognize_voice()

if __name__ == "__main__":
    main()