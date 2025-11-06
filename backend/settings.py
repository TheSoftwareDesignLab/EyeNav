import os


desktop_path = os.path.join(os.path.join(os.environ['USERPROFILE']), 'Desktop')

project_path = os.path.join(desktop_path, 'data', 'EyeNav2')

OUTPUT_DIR = os.path.join(project_path, 'testing')

test_file = None
transcription_file = None