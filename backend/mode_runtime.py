import importlib
import threading

MODE_KEYBOARD_MOUSE = "keyboard-mouse"
MODE_EYE_VOICE = "eye-voice"
DEFAULT_MODE = MODE_KEYBOARD_MOUSE
SUPPORTED_MODES = {MODE_KEYBOARD_MOUSE, MODE_EYE_VOICE}


def normalize_mode(requested_mode):
    if requested_mode in SUPPORTED_MODES:
        return requested_mode
    return DEFAULT_MODE


def _detect_eye_voice_capability():
    try:
        importlib.import_module("tobii_research")
        importlib.import_module("vosk")
        importlib.import_module("sounddevice")
    except Exception as exc:
        return {
            "available": False,
            "reason": f"Missing optional dependencies: {exc}",
        }

    return {
        "available": True,
        "reason": None,
    }


def get_capabilities():
    return {
        MODE_KEYBOARD_MOUSE: {
            "available": True,
            "reason": None,
        },
        MODE_EYE_VOICE: _detect_eye_voice_capability(),
    }


def start_mode(mode, language_code="en-us"):
    selected_mode = normalize_mode(mode)
    runtime = {
        "mode": selected_mode,
        "threads": {},
        "modules": {},
    }

    if selected_mode == MODE_KEYBOARD_MOUSE:
        return {
            "success": True,
            "runtime": runtime,
            "message": "Keyboard/mouse mode started.",
        }

    capabilities = get_capabilities().get(MODE_EYE_VOICE, {})
    if not capabilities.get("available"):
        return {
            "success": False,
            "runtime": runtime,
            "message": capabilities.get("reason") or "Eye/voice mode is unavailable.",
        }

    try:
        eye_tracking = importlib.import_module("eye_tracking")
        voice_control = importlib.import_module("voice_control")
    except Exception as exc:
        return {
            "success": False,
            "runtime": runtime,
            "message": f"Failed to load eye/voice modules: {exc}",
        }

    runtime["modules"] = {
        "eye_tracking": eye_tracking,
        "voice_control": voice_control,
    }

    tracking_thread = threading.Thread(target=eye_tracking.start_eye_tracking, daemon=True)
    voice_thread = threading.Thread(target=voice_control.main, args=(language_code,), daemon=True)
    tracking_thread.start()
    voice_thread.start()

    runtime["threads"] = {
        "tracking_thread": tracking_thread,
        "voice_thread": voice_thread,
    }

    return {
        "success": True,
        "runtime": runtime,
        "message": "Eye/voice mode started.",
    }


def stop_mode(runtime):
    if not runtime:
        return

    mode = runtime.get("mode")
    if mode != MODE_EYE_VOICE:
        return

    modules = runtime.get("modules", {})
    eye_tracking = modules.get("eye_tracking")
    voice_control = modules.get("voice_control")

    if eye_tracking:
        try:
            eye_tracking.stop_eye_tracking()
        except Exception as exc:
            print(f"WARNING: Failed to stop eye tracking cleanly: {exc}")

    if voice_control:
        try:
            voice_control.stop_voice_control()
        except Exception as exc:
            print(f"WARNING: Failed to stop voice control cleanly: {exc}")
