import os

TEST_DIRECTORY = "test_sessions"
TRANSCRIPTION_DIR = "transcriptions"
EVENTS_DIRECTORY = "events"

for _directory in (TEST_DIRECTORY, TRANSCRIPTION_DIR, EVENTS_DIRECTORY):
    os.makedirs(_directory, exist_ok=True)
del _directory  # loop variables aren't scoped in Python - without this it would linger as settings._directory
