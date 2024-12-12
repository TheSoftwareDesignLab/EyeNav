import queue
import time
import settings

interaction_queue = queue.Queue()

def get_test_file():
    return settings.test_file

def log_interaction(interaction):
    """
    Logs an interaction to the test file.
    @param interaction: The string representing the interaction (click or voice command)
    @param test_file: The path to the test file where interactions are logged
    """
    text = define_interaction(interaction)
    test_file = get_test_file()
    
    if test_file and text:
        with open(test_file, "a") as f:
            f.write(f"{text}\n")

def define_interaction(interaction):
    """
    Makes a string representation of the interaction
    @param interaction: The interaction dictionary
    @return: The string representation of the interaction
    """
    
    text = None
    if interaction["type"] == "click":
        if interaction["href"]:
            text = f'\tAnd I click on tag with href "{interaction["href"]}"'
        elif interaction["id"]:
            text = f'\tAnd I click on tag with id "{interaction["id"]}"'
        else:
            text = f'\tAnd I click on tag with xpath "{interaction["xpath"]}"'
    elif interaction["type"] == "input":
        text = f'\tAnd I input "{interaction["text"]}"'
    elif interaction["type"] == "enter":
        text = f'\tAnd I hit enter'
    elif interaction["type"] == "back":
        text = f'\tAnd I go back'
    elif interaction["type"] == "forward":
        text = f'\tAnd I go forward'
    elif interaction["type"] == "go":
        if interaction["direction"] > 0:
            text = f'\tAnd I scroll down'
        else:
            text = f'\tAnd I scroll up'
    
    return text
    

def main():
    while True:
        try:
            interaction = interaction_queue.get()
            print(f"INFO: Logging interaction {interaction}")
            log_interaction(interaction)
        except Exception as e:
            print(f"INFO: Error logging interaction: {e}")
        time.sleep(1)