import tobii_research as tr
import pyautogui
import time
import math
from collections import deque

global_gaze_data = None
previous_position = None
is_tracking = False
my_eyetracker = None
gaze_buffer = deque(maxlen=5)  
threshold_distance = 30

def gaze_data_callback(gaze_data):
    global global_gaze_data
    global_gaze_data = gaze_data

def subscribe_to_gaze_data(eyetracker):
    print("Subscribing to gaze data for eye tracker with serial number {0}.".format(eyetracker.serial_number))
    eyetracker.subscribe_to(tr.EYETRACKER_GAZE_DATA, gaze_data_callback, as_dictionary=True)

def unsubscribe_from_gaze_data(eyetracker):
    print("Unsubscribing from gaze data for eye tracker with serial number {0}.".format(eyetracker.serial_number))
    eyetracker.unsubscribe_from(tr.EYETRACKER_GAZE_DATA, gaze_data_callback)

def smooth_move_to(x, y, previous_x, previous_y, smoothing=0.5):
    target_x = previous_x + (x - previous_x) * smoothing
    target_y = previous_y + (y - previous_y) * smoothing
    pyautogui.moveTo(target_x, target_y)
    return target_x, target_y

def distance(point1, point2):
    """Helper function to calculate the distance between two points."""
    return math.sqrt((point1[0] - point2[0]) ** 2 + (point1[1] - point2[1]) ** 2)

def track_gaze():
    global previous_position, is_tracking, my_eyetracker, gaze_buffer

    found_eyetrackers = tr.find_all_eyetrackers()
    if len(found_eyetrackers) == 0:
        print("No eye trackers found.")
        return

    my_eyetracker = found_eyetrackers[0]
    subscribe_to_gaze_data(my_eyetracker)

    screen_w, screen_h = pyautogui.size()

    while is_tracking:
        if global_gaze_data:
            gaze_point = global_gaze_data['left_gaze_point_on_display_area']
            if not math.isnan(gaze_point[0]) and not math.isnan(gaze_point[1]):
                screen_x = screen_w * gaze_point[0]
                screen_y = screen_h * gaze_point[1]
                gaze_buffer.append((screen_x, screen_y))

                if len(gaze_buffer) == gaze_buffer.maxlen:
                    avg_x = sum([g[0] for g in gaze_buffer]) / gaze_buffer.maxlen
                    avg_y = sum([g[1] for g in gaze_buffer]) / gaze_buffer.maxlen

                    if previous_position is None:
                        previous_position = (avg_x, avg_y)

                    if distance(previous_position, (avg_x, avg_y)) > threshold_distance:
                        previous_position = smooth_move_to(avg_x, avg_y, previous_position[0], previous_position[1])

        time.sleep(0.01)

    if my_eyetracker:
        unsubscribe_from_gaze_data(my_eyetracker)

def start_eye_tracking():
    global is_tracking
    is_tracking = True
    track_gaze()

def stop_eye_tracking():
    global is_tracking
    is_tracking = False
