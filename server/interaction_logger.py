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
    if interaction["type"] == "click":
        if interaction["href"]:
            return f'\tAnd I click on tag with selector {interaction["selector"]} with href "{interaction["href"]}"'
        elif interaction["id"]:
            return f'\tAnd I click on tag with selector {interaction["selector"]} with id "{interaction["id"]}"'
        else:
            return f'\tAnd I click on tag with selector {interaction["selector"]} with xpath "{interaction["xpath"]}"'
    elif interaction["type"] == "input":
        return f'\tAnd I input "{interaction["text"]}"'
    elif interaction["type"] == "back":
        return f'\tAnd I go back'
    elif interaction["type"] == "forward":
        return f'\tAnd I go forward'
    elif interaction["type"] == "go":
        return f'\tAnd I scroll {interaction["direction"]} {interaction["units"]}'
    else:
        return None
    

def main():
    while True:
        try:
            interaction = interaction_queue.get()
            print(f"Logging interaction: {interaction}")
            log_interaction(interaction)
        except Exception as e:
            print(f"Error logging interaction: {e}")
        time.sleep(1)