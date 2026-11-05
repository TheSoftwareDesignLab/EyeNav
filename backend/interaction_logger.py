import json
import logging
from datetime import datetime

import event_bus
import feature_writer

logger = logging.getLogger(__name__)

# What a voice command does through the browser itself, which the page then
# reports as its own: a dictation is pasted into the focused field, "enter"
# presses Enter, "back"/"forward" press the browser's shortcut. In "all" mode
# both arrive, and replaying both would type the text twice, press Enter
# twice or go back two pages.
VOICE_ECHO_TYPES = {"input", "enter", "back", "forward"}

# Enter and the history shortcut act at once, so the page's report of them
# follows within this many seconds. A dictated text is reported whenever the
# field is left, which can be much later, so it is matched by its text instead.
VOICE_ECHO_SECONDS = 3


def is_voice_echo(event, last_voice_command):
    """
    Whether a browser event is the page's report of a voice command already
    logged (see VOICE_ECHO_TYPES), and remembers each voice command. A
    dictation absorbs one report of the same text, at any time; any other
    command, the report that comes within VOICE_ECHO_SECONDS.
    @param event: an event_model.Event
    @param last_voice_command: this session's {type: [time, text, absorbed]}, updated here
    @return: True if the event should not be logged
    """
    if event.type not in VOICE_ECHO_TYPES:
        return False
    when = datetime.fromisoformat(event.timestamp)
    if event.source == "voice":
        last_voice_command[event.type] = [when, event.data.get("text"), False]
        return False

    voice = last_voice_command.get(event.type)
    if voice is None:
        return False
    voice_when, voice_text, absorbed = voice
    if event.type == "input":
        if absorbed or event.data.get("text") != voice_text:
            return False
        voice[2] = True
        return True
    return 0 <= (when - voice_when).total_seconds() <= VOICE_ECHO_SECONDS


def log_step(session, event):
    """
    Writes the event's Gherkin step (if it has one) to the session's .feature file.
    """
    step = feature_writer.to_gherkin_step(event)
    if step and session.test_file:
        with open(session.test_file, "a") as f:
            f.write(f"{step}\n")


def log_event(session, event):
    """
    Appends the full event, as JSON, to the session's detailed events file.
    """
    if session.events_file:
        with open(session.events_file, "a") as f:
            f.write(json.dumps(event.to_dict()) + "\n")


def _log_and_record_error(session, action, target, error):
    """
    Logs a failed logging attempt and records it on the session - logging
    alone left this invisible outside the backend's own log output, since
    GET /status had no way to tell a session was silently degraded.
    Shared by both call sites in main() below so the "build a message, log
    it, record it on the session" shape stays in one place.
    @param session: the session_recorder.Session the failure happened for
    @param action: short description of what was being attempted (e.g. "event")
    @param target: the file/resource that couldn't be written to
    @param error: the exception that was raised
    """
    message = f"Error logging {action} to {target}: {error}"
    logger.error(message)
    session.add_error(message)


def main(session):
    """
    Consumes events from the event bus and logs them for the given session,
    until event_bus.stop() unblocks it so the thread can exit cleanly.
    @param session: the session_recorder.Session these events belong to
    """
    last_voice_command = {}
    while True:
        event = event_bus.consume()
        if event_bus.is_stop_signal(event):
            break

        if is_voice_echo(event, last_voice_command):
            logger.info("Skipping %s/%s event: the page's echo of a voice command", event.source, event.type)
            continue

        # Source and type only: the payload carries what the user typed or
        # dictated, which belongs in the session's own (owner-only) files,
        # not in the console output.
        logger.info("Logging %s/%s event", event.source, event.type)

        try:
            log_event(session, event)
        except Exception as error:
            _log_and_record_error(session, "event", session.events_file, error)

        try:
            log_step(session, event)
        except Exception as error:
            _log_and_record_error(session, "step", session.test_file, error)
