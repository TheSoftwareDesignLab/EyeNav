"""
Test-suite bootstrap. Importing this package (which unittest does before any
test module) points the backend's recording folders at a fresh temporary
directory, via EYENAV_DATA_DIR, BEFORE anything imports `settings`.

Why: the tests start real sessions, which write .feature, .jsonl and
transcription files. Those folders (backend/test_sessions, events,
transcriptions) hold the user's real recordings, are gitignored and have no
backup, so the tests must never share them - not even to "clean up after
themselves". With the data directory redirected, every file a test creates
lands in the temporary directory, which is removed when the run ends.
"""
import atexit
import os
import shutil
import sys
import tempfile

if "settings" in sys.modules:
    raise RuntimeError(
        "settings was imported before the test suite redirected the recording "
        "folders, so the tests would write into the real recordings. Import "
        "nothing from the backend before the `tests` package."
    )

_recordings_dir = tempfile.mkdtemp(prefix="eyenav-test-recordings-")
os.environ["EYENAV_DATA_DIR"] = _recordings_dir
# Only ever removes the directory created just above, never a configured one.
atexit.register(shutil.rmtree, _recordings_dir, ignore_errors=True)
