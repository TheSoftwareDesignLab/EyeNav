import json

import event_bus
import feature_writer


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

        try:
            print(f"INFO: Logging event {event}")
            log_event(session, event)
            log_step(session, event)
        except Exception as e:
            print(f"INFO: Error logging event: {e}")
