import tobii_research as tr
import pyautogui
import time
import math

global_gaze_data = None
previous_position = None

def gaze_data_callback(gaze_data):
    global global_gaze_data
    global_gaze_data = gaze_data

def subscribe_to_gaze_data(eyetracker):
    global global_gaze_data

    print("Subscribing to gaze data for eye tracker with serial number {0}.".format(eyetracker.serial_number))
    eyetracker.subscribe_to(tr.EYETRACKER_GAZE_DATA, gaze_data_callback, as_dictionary=True)

def smooth_move_to(x, y, previous_x, previous_y, smoothing=0.5):
    target_x = previous_x + (x - previous_x) * smoothing
    target_y = previous_y + (y - previous_y) * smoothing
    pyautogui.moveTo(target_x, target_y)
    return target_x, target_y

def main():
    global previous_position

    found_eyetrackers = tr.find_all_eyetrackers()
    my_eyetracker = found_eyetrackers[0]

    subscribe_to_gaze_data(my_eyetracker)

    screen_w, screen_h = pyautogui.size()

    while True:
        if global_gaze_data:
            gaze_point = global_gaze_data['left_gaze_point_on_display_area']
            if not math.isnan(gaze_point[0]) and not math.isnan(gaze_point[1]):
                screen_x = screen_w * gaze_point[0]
                screen_y = screen_h * gaze_point[1]
                
                if previous_position is None:
                    previous_position = (screen_x, screen_y)

                previous_position = smooth_move_to(screen_x, screen_y, previous_position[0], previous_position[1])
                
        time.sleep(0.01)  # Reduce sleep time for smoother updates

    return

if __name__ == '__main__':
    main()