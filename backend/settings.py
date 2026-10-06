import os

# Anchored to this file, not the working directory: relative paths put the
# recordings wherever the backend happened to be launched from.
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

TEST_DIRECTORY = os.path.join(_BACKEND_DIR, "test_sessions")
TRANSCRIPTION_DIR = os.path.join(_BACKEND_DIR, "transcriptions")
EVENTS_DIRECTORY = os.path.join(_BACKEND_DIR, "events")


def _make_private_directory(directory):
    """
    Creates `directory` readable by its owner only, and tightens it - and the
    recordings already in it - if an earlier version created them 0755/0644,
    i.e. readable by every other account on a shared machine. makedirs alone
    leaves an existing directory's mode untouched.
    """
    os.makedirs(directory, mode=0o700, exist_ok=True)
    os.chmod(directory, 0o700)
    for name in os.listdir(directory):
        path = os.path.join(directory, name)
        if os.path.isfile(path):
            os.chmod(path, 0o600)


# Recordings hold what the user typed and dictated. The umask makes every
# file the backend creates from here on (.feature, .jsonl, transcription
# logs) owner-only, without each writer having to pass a mode.
os.umask(0o077)

for _directory in (TEST_DIRECTORY, TRANSCRIPTION_DIR, EVENTS_DIRECTORY):
    _make_private_directory(_directory)
del _directory  # loop variables aren't scoped in Python - without this it would linger as settings._directory
