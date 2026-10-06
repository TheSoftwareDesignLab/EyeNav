import json
import logging

import event_bus
import feature_writer

logger = logging.getLogger(__name__)


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
    while True:
        event = event_bus.consume()
        if event_bus.is_stop_signal(event):
            break

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
