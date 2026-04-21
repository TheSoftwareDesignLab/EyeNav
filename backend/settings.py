import os


desktop_path = os.path.join(os.path.expanduser('~'), 'Desktop')

project_path = os.path.join(desktop_path, 'recorded sessions')

OUTPUT_DIR = os.path.join(project_path, 'testing')

test_file = None
transcription_file = None