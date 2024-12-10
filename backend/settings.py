import os
import time

TEST_DIRECTORY = "test_sessions"
TRANSCRIPTION_DIR = "transcriptions"

if not os.path.exists(TEST_DIRECTORY):
    os.makedirs(TEST_DIRECTORY)

if not os.path.exists(TRANSCRIPTION_DIR):
    os.makedirs(TRANSCRIPTION_DIR)

test_file = None 
transcription_file = None
