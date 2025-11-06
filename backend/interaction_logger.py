import queue
import time
import settings
import os

interaction_queue = queue.Queue()

def get_selector_keyword(selector):

    if selector and (selector.startswith('/') or selector.startswith('(')):
        return 'xpath'
   
    return 'xpath' 

def get_test_file():

    if not settings.test_file:
        return None
    
    test_dir = os.path.dirname(settings.test_file)
    os.makedirs(test_dir, exist_ok=True)
    
    return settings.test_file

def log_interaction(interaction):
 
    text = define_interaction(interaction)
    test_file = get_test_file()
    
    if test_file and text:
        try:
            with open(test_file, "a", encoding="utf-8") as f:
                f.write(f"{text}\n")
        except Exception as e:
            print(f"ERROR: Could not write interaction to {test_file}: {e}")

def define_interaction(interaction):

    text = None
    interaction_type = interaction.get("type")
    selector = interaction.get("xpath") 
    
 
    ignored_types = ["initialState", "zoomChange", "go"]
    if interaction_type in ignored_types:
        return None
  

    if interaction_type == "click" and selector:
        keyword = get_selector_keyword(selector)
        text = f'\tAnd I click on element with {keyword} "{selector}"'
            
    elif interaction_type == "input" and selector:
        value = interaction.get("value", "")
        keyword = get_selector_keyword(selector)
        text = f'\tAnd I type "{value}" into field with {keyword} "{selector}"'
            
    elif interaction_type == "keypress" and interaction.get("key") == "Enter" and selector:
        keyword = get_selector_keyword(selector)
        text = f'\tAnd I press the "Enter" key on element with {keyword} "{selector}"'
            
    elif interaction_type == "back":
        text = f'\tAnd I go back'
        
    elif interaction_type == "forward":
        text = f'\tAnd I go forward'

   
    elif interaction_type == "viewportChange":
        viewport_data = interaction.get("viewport")
        if viewport_data:
            width = viewport_data.get("width")
            height = viewport_data.get("height")
            if width is not None and height is not None:
                text = f'\tAnd I set the viewport to {width}x{height}'
            else:
                print("WARNING: viewportChange action missing width or height.")
        else:
            print("WARNING: viewportChange action missing viewport data.")

    elif interaction_type: 
       print(f"WARNING: Unhandled interaction type: {interaction_type}")

    return text
    
def main():
    while True:
        try:
            interaction = interaction_queue.get(timeout=1) 
            print(f"INFO: Received interaction {interaction.get('type')}")
            log_interaction(interaction)
        except queue.Empty:
            continue
        except Exception as e:
            print(f"ERROR: Error in logger loop: {e}")