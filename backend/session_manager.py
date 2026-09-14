import threading
import eye_tracking
import voice_control
import interaction_logger
import session_recorder
import event_bus

ALLOWED_CAPTURE_MODES = {"eye_voice", "mouse_keyboard", "all"}

# Which capturers a given capture mode needs. mouse_capture/keyboard_capture
# are not implemented yet (see the input_capture step) - modes that need them
# will fail fast in start_session until those modules exist.
CAPTURE_MODE_CAPTURERS = {
    "eye_voice": ["eye_tracking", "voice_control"],
    "mouse_keyboard": ["mouse_capture", "keyboard_capture"],
    "all": ["eye_tracking", "voice_control", "mouse_capture", "keyboard_capture"],
}

# Registry of capturers that actually exist today. Each entry knows how to
# start itself as a thread for a given session, and how to stop itself.
CAPTURERS = {
    "eye_tracking": {
        "start": lambda session: threading.Thread(target=eye_tracking.start_eye_tracking),
        "stop": eye_tracking.stop_eye_tracking,
    },
    "voice_control": {
        "start": lambda session: threading.Thread(target=voice_control.main, args=(session,)),
        "stop": voice_control.stop_voice_control,
    },
}


class SessionError(Exception):
    pass


class SessionStartError(SessionError):
    pass


class SessionStopError(SessionError):
    pass

_active_session = None
_active_threads = {}


def is_session_active():
    return _active_session is not None and _active_session.state == "running"


def get_active_capture_mode():
    return _active_session.capture_mode if is_session_active() else None


def start_session(page_name, page_url, language, capture_mode):
    """
    Starts a new session: validates the capture mode, creates its files via
    session_recorder, and starts only the capturers that mode requires plus
    the logger. If any capturer fails to start, stops whatever was already
    started and raises instead of leaving a half-started session active.
    @param page_name: title of the page the session starts on
    @param page_url: URL of the page the session starts on
    @param language: language code used for voice recognition
    @param capture_mode: one of ALLOWED_CAPTURE_MODES
    @return: the started Session
    """
    global _active_session, _active_threads

    if capture_mode not in ALLOWED_CAPTURE_MODES:
        raise ValueError(f"Unknown capture mode: {capture_mode}")

    if is_session_active():
        raise SessionStartError("A session is already running")

    required_capturers = CAPTURE_MODE_CAPTURERS[capture_mode]
    missing = [name for name in required_capturers if name not in CAPTURERS]
    if missing:
        raise NotImplementedError(f"Capturer(s) not implemented yet: {', '.join(missing)}")

    session = session_recorder.create_session(page_name, page_url, language, capture_mode)

    started_threads = {}
    try:
        for name in required_capturers:
            thread = CAPTURERS[name]["start"](session)
            thread.start()
            started_threads[name] = thread

        logging_thread = threading.Thread(target=interaction_logger.main, args=(session,), daemon=True)
        logging_thread.start()
        started_threads["interaction_logger"] = logging_thread

    except Exception as error:
        for name in started_threads:
            stop_fn = CAPTURERS.get(name, {}).get("stop")
            if stop_fn:
                try:
                    stop_fn()
                except Exception:
                    pass
        raise SessionStartError(f"Failed to start session: {error}") from error

    session.state = "running"
    _active_session = session
    _active_threads = started_threads

    return session


def stop_session():
    """
    Stops the active session's capturers and marks it as stopped.
    @return: the stopped Session
    """
    global _active_session, _active_threads

    if not is_session_active():
        raise SessionStopError("No session is currently running")

    for name in _active_threads:
        if name == "interaction_logger":
            continue
        stop_fn = CAPTURERS.get(name, {}).get("stop")
        if stop_fn:
            stop_fn()

    # interaction_logger isn't in CAPTURERS: it always runs regardless of
    # capture mode, and it's stopped by unblocking its consume() call rather
    # than an external stop() function, so it gets a clean, joinable shutdown.
    event_bus.stop()
    _active_threads["interaction_logger"].join(timeout=5)

    stopped_session = _active_session
    stopped_session.state = "stopped"

    _active_session = None
    _active_threads = {}

    return stopped_session
