import os
import time

# Directories for test sessions and transcriptions
TEST_DIRECTORY = "test_sessions"
TRANSCRIPTION_DIR = "transcriptions"

# Ensure directories exist
if not os.path.exists(TEST_DIRECTORY):
    os.makedirs(TEST_DIRECTORY)

if not os.path.exists(TRANSCRIPTION_DIR):
    os.makedirs(TRANSCRIPTION_DIR)

# Test file and transcription file paths
test_file = None  # This will be set when a session starts
transcription_file = os.path.join(TRANSCRIPTION_DIR, f"transcription_{time.strftime('%Y-%m-%d_%H-%M-%S')}.log")
