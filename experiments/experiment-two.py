# To activate venv: source tobii-env-rosetta/bin/activate

import tobii_research as tr
import pyautogui
import time

found_eyetrackers = tr.find_all_eyetrackers()
print(found_eyetrackers)
my_eyetracker = found_eyetrackers[0]
global_gaze_data = None

def gaze_data_callback(gaze_data):
    global global_gaze_data
    global_gaze_data = gaze_data

def gaze_data(eyetracker):
    global global_gaze_data

    print("Subscribing to gaze data for eye tracker with serial number {0}.".format(eyetracker.serial_number))
    eyetracker.subscribe_to(tr.EYETRACKER_GAZE_DATA, gaze_data_callback, as_dictionary=True)

    # Wait for a while
    time.sleep(5)

    # Unsubscribe from gaze data
    print("Unsubscribing from gaze data for eye tracker with serial number {0}.".format(eyetracker.serial_number))
    


gaze_data(my_eyetracker)