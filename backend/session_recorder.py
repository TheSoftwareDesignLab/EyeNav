import os
import time
from dataclasses import dataclass
from datetime import datetime

import feature_writer
import settings

EVENTS_DIRECTORY = "events"

if not os.path.exists(EVENTS_DIRECTORY):
    os.makedirs(EVENTS_DIRECTORY)

SESSION_STATES = {"idle", "running", "stopped"}


@dataclass
class Session:
    session_id: str
    page_name: str
    page_url: str
    language: str
    capture_mode: str
    start_time: str
    test_file: str = None
    transcription_file: str = None
    events_file: str = None
    state: str = "idle"


def generate_session_id():
    """
    Generates a timestamp-based identifier for a session, used to name its
    files. Includes microseconds so two sessions started within the same
    second (e.g. a quick stop then restart) still get distinct ids, instead
    of the second one silently overwriting the first's files.
    """
    return datetime.now().strftime('%Y-%m-%d_%H-%M-%S-%f')


def _feature_header(page_name, page_url, viewport_width=None, viewport_height=None):
    """
    Builds the initial content of a .feature file: same header and first
    step main.py used to write, kept identical so replay output doesn't
    change - plus an optional viewport step, when the caller knows the
    page's size at session start, written before navigating so the page
    loads at that size from the first paint.

    page_name/page_url are escaped the same way feature_writer escapes
    captured click/input data: page_name is a tab title (activeTab.title)
    and can contain a literal double quote just as easily as any clicked
    element's text can, which would otherwise corrupt this Scenario line
    before a single event is even captured.
    """
    lines = [
        f"Feature: Replay of session on {time.strftime('%b %d at %I:%M:%S %p')}\n\n",
        "@user1 @web\n",
        f'Scenario: User interacts with the web page named "{feature_writer.escape_gherkin_string(page_name)}"\n\n',
    ]
    if viewport_width is not None and viewport_height is not None:
        lines.append(f'\tGiven I set the viewport to {viewport_width}x{viewport_height}\n')
    lines.append(f'\tGiven I navigate to page "{feature_writer.escape_gherkin_string(page_url)}"\n')
    return "".join(lines)


def create_session(page_name, page_url, language, capture_mode, viewport_width=None, viewport_height=None):
    """
    Creates a new session: generates its id, creates its .feature file with
    the initial header already written, and reserves the paths for its
    transcription and events files (created lazily by whoever writes to them
    first). Returns the populated Session.
    @param page_name: title of the page the session starts on
    @param page_url: URL of the page the session starts on
    @param language: language code used for voice recognition
    @param capture_mode: capture mode selected for this session
    @param viewport_width: the tracked tab's viewport width at session start, if known
    @param viewport_height: the tracked tab's viewport height at session start, if known
    @return: the created Session
    """
    session_id = generate_session_id()

    test_file = os.path.join(settings.TEST_DIRECTORY, f"test_session_{session_id}.feature")
    transcription_file = os.path.join(settings.TRANSCRIPTION_DIR, f"transcription_{session_id}.log")
    events_file = os.path.join(EVENTS_DIRECTORY, f"events_{session_id}.jsonl")

    with open(test_file, "w") as f:
        f.write(_feature_header(page_name, page_url, viewport_width, viewport_height))

    return Session(
        session_id=session_id,
        page_name=page_name,
        page_url=page_url,
        language=language,
        capture_mode=capture_mode,
        start_time=session_id,
        test_file=test_file,
        transcription_file=transcription_file,
        events_file=events_file,
    )
