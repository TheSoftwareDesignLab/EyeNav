import threading
import interaction_logger
import session_recorder
import event_bus

ALLOWED_CAPTURE_MODES = {"eye_voice", "mouse_keyboard", "all"}

# Which capturers a given capture mode needs, on top of content.js's click
# and input capture, which run unconditionally in every mode as long as a
# session is active (see main.py's /tag-info and /input-info). mouse_keyboard
# needs no dedicated capturer at all: content.js already reports clicks and
# typed input with full DOM context, which is everything that mode records.
CAPTURE_MODE_CAPTURERS = {
    "eye_voice": ["eye_tracking", "voice_control"],
    "mouse_keyboard": [],
    "all": ["eye_tracking", "voice_control"],
}


def _eye_tracking_capturer():
    import eye_tracking
    return {
        "start": lambda session: threading.Thread(target=eye_tracking.start_eye_tracking),
        "stop": eye_tracking.stop_eye_tracking,
    }


def _voice_control_capturer():
    import voice_control
    return {
        "start": lambda session: threading.Thread(target=voice_control.main, args=(session,)),
        "stop": voice_control.stop_voice_control,
    }


# Factories, not ready-made capturers: eye_tracking/voice_control pull in
# optional, heavy dependencies (tobii_research, vosk, sounddevice) that
# mouse_keyboard mode doesn't need at all. Importing them lazily means
# someone who only wants mouse_keyboard mode isn't forced to install the
# Tobii SDK just for the whole backend to start.
CAPTURER_FACTORIES = {
    "eye_tracking": _eye_tracking_capturer,
    "voice_control": _voice_control_capturer,
}

_capturer_cache = {}


def _resolve_capturer(name):
    """
    Lazily imports and builds a capturer's start/stop functions, caching the
    result. Returns None if the capturer isn't registered, or if its
    dependencies aren't installed - instead of crashing at import time just
    because an optional mode's SDK is missing.
    """
    if name in _capturer_cache:
        return _capturer_cache[name]

    factory = CAPTURER_FACTORIES.get(name)
    if not factory:
        return None

    try:
        capturer = factory()
    except Exception as error:
        # Not just ImportError: a dependency can fail to import for other
        # reasons too (e.g. pyautogui raising on a display-less environment),
        # and any of them should degrade to "capturer unavailable" instead of
        # crashing start_session. Not cached: if the missing dependency gets
        # installed without restarting the backend, the next attempt should
        # actually retry the import instead of reusing this failure forever.
        print(f"INFO: Capturer '{name}' unavailable: {error}")
        return None

    _capturer_cache[name] = capturer
    return capturer


class SessionError(Exception):
    pass


class SessionStartError(SessionError):
    pass


class SessionStopError(SessionError):
    pass

_active_session = None
_active_threads = {}
# Guards the read-check-then-write around _active_session/_active_threads in
# start_session/stop_session. Flask's dev server is threaded by default, so
# without this, two overlapping /start requests could both observe
# is_session_active() == False before either sets _active_session, and both
# go on to start capturer threads against eye_tracking/voice_control's
# shared module-level flags - orphaning one thread when the other session
# is later stopped and clears that shared flag out from under it.
_session_lock = threading.Lock()


def is_session_active():
    return _active_session is not None and _active_session.state == "running"


def get_active_capture_mode():
    return _active_session.capture_mode if is_session_active() else None


def _stop_threads(threads):
    """
    Signals every capturer thread in `threads` to stop and waits for each one
    to actually exit before returning, so a caller never proceeds (e.g. lets
    a new session start) while an old thread might still be alive - which
    would otherwise leave it consuming from the shared event_bus queue and
    writing into whichever session happens to be active by then.
    interaction_logger has no entry in CAPTURER_FACTORIES: it's signalled by
    unblocking its consume() call via event_bus.stop(), not a stop function.
    @param threads: {name: Thread} of threads to stop
    @return: names of threads still alive after the timeout (should be empty)
    """
    stuck = []

    for name, thread in threads.items():
        if name == "interaction_logger":
            continue
        capturer = _resolve_capturer(name)
        stop_fn = capturer.get("stop") if capturer else None
        if stop_fn:
            try:
                stop_fn()
            except Exception:
                pass
        thread.join(timeout=10)
        if thread.is_alive():
            stuck.append(name)

    if "interaction_logger" in threads:
        event_bus.stop()
        threads["interaction_logger"].join(timeout=10)
        if threads["interaction_logger"].is_alive():
            stuck.append("interaction_logger")

    return stuck


def start_session(page_name, page_url, language, capture_mode, viewport_width=None, viewport_height=None):
    """
    Starts a new session: validates the capture mode, creates its files via
    session_recorder, and starts only the capturers that mode requires plus
    the logger. If any capturer fails to start, stops whatever was already
    started and raises instead of leaving a half-started session active.
    @param page_name: title of the page the session starts on
    @param page_url: URL of the page the session starts on
    @param language: language code used for voice recognition
    @param capture_mode: one of ALLOWED_CAPTURE_MODES
    @param viewport_width: the tracked tab's viewport width at session start, if known
    @param viewport_height: the tracked tab's viewport height at session start, if known
    @return: the started Session
    """
    global _active_session, _active_threads

    if capture_mode not in ALLOWED_CAPTURE_MODES:
        raise ValueError(f"Unknown capture mode: {capture_mode}")

    with _session_lock:
        if is_session_active():
            raise SessionStartError("A session is already running")

        required_capturers = CAPTURE_MODE_CAPTURERS[capture_mode]
        missing = [name for name in required_capturers if _resolve_capturer(name) is None]
        if missing:
            raise NotImplementedError(f"Capturer(s) not available: {', '.join(missing)}")

        session = session_recorder.create_session(
            page_name, page_url, language, capture_mode, viewport_width, viewport_height)

        started_threads = {}
        try:
            for name in required_capturers:
                thread = _resolve_capturer(name)["start"](session)
                thread.start()
                started_threads[name] = thread

            logging_thread = threading.Thread(target=interaction_logger.main, args=(session,), daemon=True)
            logging_thread.start()
            started_threads["interaction_logger"] = logging_thread

        except Exception as error:
            stuck = _stop_threads(started_threads)
            message = f"Failed to start session: {error}"
            if stuck:
                message += f" (also timed out stopping: {', '.join(stuck)})"
            raise SessionStartError(message) from error

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

    with _session_lock:
        if not is_session_active():
            raise SessionStopError("No session is currently running")

        stuck = _stop_threads(_active_threads)
        if stuck:
            raise SessionStopError(f"Timed out waiting for: {', '.join(stuck)}")

        stopped_session = _active_session
        stopped_session.state = "stopped"

        _active_session = None
        _active_threads = {}

    return stopped_session
