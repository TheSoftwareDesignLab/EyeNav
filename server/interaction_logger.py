import queue
import settings


interaction_queue = queue.Queue()
test_file = settings.test_file

def log_interaction(interaction):
    """
    Logs an interaction to the test file.
    @param interaction: The string representing the interaction (click or voice command)
    @param test_file: The path to the test file where interactions are logged
    """
    text = define_interaction(interaction)
    
    if test_file:
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
            return f'\tThen I click on tag "{interaction["type"]}" with href "{interaction["href"]}"'
        elif interaction["id"]:
            return f'\tThen I click on tag "{interaction["type"]}" with id "{interaction["id"]}"'
        else:
            return f'\tThen I click on tag "{interaction["type"]}" with xpath "{interaction["xpath"]}"'
    elif interaction["type"] == "input":
        return f'\tThen I input "{interaction["text"]}"'
    elif interaction["type"] == "back":
        return f'\tThen I go back'
    elif interaction["type"] == "forward":
        return f'\tThen I go forward'
    

def main():
    while True:
        try:
            interaction = interaction_queue.get()
            log_interaction(interaction, settings.test_file)
        except Exception as e:
            print(f"Error logging interaction: {e}")
        time.sleep(1)