"""
Run from backend/:  venv/bin/python3 -m unittest discover -s tests -t .

Regression tests for: only the extension may call the backend (CORS/CSRF/DNS
rebinding/WebSocket origin), a Stop that arrives while a capturer is still
starting up, and capturer crashes being reported on the session. voice_control
and eye_tracking are imported against stub hardware modules, so no Vosk model,
microphone or Tobii tracker is needed.
"""
import base64
import contextlib
import hashlib
import json
import os
import stat
import sys
import threading
import types
import unittest
from unittest.mock import MagicMock, patch

import main
import security
import session_manager
import session_recorder
import websocket_server
from tests.test_recording_pipeline import RecordingTestCase, wait_for

EXTENSION = security.EXTENSION_ORIGIN
OTHER_EXTENSION = "chrome-extension://" + "a" * 32
EVIL = "https://evil.example"


class SecurityHelperTests(unittest.TestCase):
    def test_origins(self):
        self.assertTrue(security.is_trusted_origin(None))
        self.assertTrue(security.is_trusted_origin(EXTENSION))
        self.assertFalse(security.is_trusted_origin(EVIL))
        self.assertFalse(security.is_trusted_origin("null"))
        self.assertFalse(security.is_trusted_origin("chrome-extension://short"))
        self.assertFalse(security.is_trusted_origin(EXTENSION + ".evil.example"))
        self.assertFalse(security.is_trusted_origin(EXTENSION + "\n"))

    def test_another_installed_extension_is_not_trusted(self):
        self.assertFalse(security.is_trusted_origin(OTHER_EXTENSION))

    def test_the_pinned_id_matches_the_manifest_key(self):
        manifest_path = os.path.join(os.path.dirname(__file__), "..", "..", "extension", "manifest.json")
        with open(manifest_path) as f:
            key = base64.b64decode(json.load(f)["key"])
        derived = "".join(chr(ord("a") + int(c, 16)) for c in hashlib.sha256(key).hexdigest()[:32])
        self.assertEqual(derived, security.EXTENSION_ID)

    def test_languages(self):
        for language in ("en-us", "es", "pt-br"):
            self.assertTrue(security.is_valid_language(language), language)
        for language in ("../../x", "en us", "", "e", "en-us/../x", None):
            self.assertFalse(security.is_valid_language(language), language)

    def test_hosts(self):
        for host in ("localhost:5001", "127.0.0.1:5001", "localhost", "[::1]:5001"):
            self.assertTrue(security.is_local_host(host), host)
        for host in ("evil.example:5001", "192.168.1.5:5001", "localhost.evil.example", "", None):
            self.assertFalse(security.is_local_host(host), host)


class UntrustedCallerTests(RecordingTestCase):
    START = {"pageName": "P", "pageUrl": "http://x", "captureMode": "mouse_keyboard"}

    def test_a_web_page_cannot_start_a_session(self):
        response = self.client.post("/start", json=self.START, headers={"Origin": EVIL})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(session_manager.is_session_active())

    def test_a_web_page_cannot_stop_a_session(self):
        self.client.post("/start", json=self.START)
        self.assertEqual(self.client.post("/stop", headers={"Origin": EVIL}).status_code, 403)
        self.assertTrue(session_manager.is_session_active())

    def test_a_web_page_cannot_inject_steps_or_read_status(self):
        self.client.post("/start", json=self.START)
        self.assertEqual(self.client.post("/tag-info", json={"id": "x"}, headers={"Origin": EVIL}).status_code, 403)
        self.assertEqual(self.client.get("/status", headers={"Origin": EVIL}).status_code, 403)

    def test_stop_is_not_reachable_with_a_plain_get(self):
        # an <img src=".../stop"> sends no Origin header at all
        self.client.post("/start", json=self.START)
        self.assertEqual(self.client.get("/stop").status_code, 405)
        self.assertTrue(session_manager.is_session_active())

    def test_dns_rebinding_host_is_rejected(self):
        response = self.client.post("/start", json=self.START, base_url="http://evil.example:5001")
        self.assertEqual(response.status_code, 403)

    def test_preflight_from_a_web_page_is_not_approved(self):
        response = self.client.open("/start", method="OPTIONS", headers={
            "Origin": EVIL, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Private-Network": "true"})
        self.assertNotEqual(response.headers.get("Access-Control-Allow-Origin"), EVIL)
        self.assertNotEqual(response.headers.get("Access-Control-Allow-Origin"), "*")

    def test_the_extension_can_still_use_every_route(self):
        headers = {"Origin": EXTENSION}
        preflight = self.client.open("/start", method="OPTIONS", headers={
            **headers, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,language"})
        self.assertEqual(preflight.headers.get("Access-Control-Allow-Origin"), EXTENSION)
        self.assertEqual(self.client.post("/start", json=self.START, headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/status", headers=headers).status_code, 200)
        self.assertEqual(self.client.post("/stop", headers=headers).status_code, 200)

    def test_another_extension_cannot_start_a_session(self):
        response = self.client.post("/start", json=self.START, headers={"Origin": OTHER_EXTENSION})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(session_manager.is_session_active())

    def test_an_invalid_language_header_is_rejected(self):
        response = self.client.post("/start", json=self.START, headers={"Language": "../../x"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(session_manager.is_session_active())

    def test_an_oversized_body_is_rejected_as_json(self):
        self.client.post("/start", json=self.START)
        response = self.client.post("/input-info", json={"text": "A" * 100_000, "xpath": "/a"})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.get_json()["status"], "Request body too large")

    def test_a_long_field_is_cut_before_it_is_recorded(self):
        session = session_manager.start_session("P", "http://x", "en-us", "mouse_keyboard")
        self.client.post("/input-info", json={"text": "A" * 10_000, "xpath": "/a"})
        wait_for(lambda: os.path.exists(session.events_file) and os.path.getsize(session.events_file) > 0)
        session_manager.stop_session()
        with open(session.events_file) as f:
            event = json.loads(f.readline())
        self.assertEqual(len(event["data"]["text"]), main.MAX_FIELD_LENGTH)

    def test_recordings_are_readable_by_their_owner_only(self):
        session = session_manager.start_session("P", "http://x", "en-us", "mouse_keyboard")
        self.client.post("/input-info", json={"text": "secret", "xpath": "/a"})
        wait_for(lambda: os.path.exists(session.events_file) and os.path.getsize(session.events_file) > 0)
        session_manager.stop_session()
        for path in (session.test_file, session.events_file):
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600, path)
        self.assertEqual(stat.S_IMODE(os.stat(os.path.dirname(session.test_file)).st_mode), 0o700)

    def test_typed_text_is_not_written_to_the_log(self):
        session_manager.start_session("P", "http://x", "en-us", "mouse_keyboard")
        with self.assertLogs("interaction_logger", level="INFO") as logs:
            self.client.post("/input-info", json={"text": "my secret text", "xpath": "/a"})
            wait_for(lambda: logs.output)
        session_manager.stop_session()
        self.assertFalse(any("my secret text" in line for line in logs.output), logs.output)

    def test_session_errors_are_bounded(self):
        session = session_manager.start_session("P", "http://x", "en-us", "mouse_keyboard")
        for i in range(session_recorder.MAX_SESSION_ERRORS + 50):
            session.add_error(f"error {i}")
        session_manager.stop_session()
        self.assertEqual(len(session.errors), session_recorder.MAX_SESSION_ERRORS)
        self.assertEqual(session.errors[-1], f"error {session_recorder.MAX_SESSION_ERRORS + 49}")

    def test_a_failure_writing_the_session_files_is_a_json_error(self):
        with patch.object(session_recorder, "create_session", side_effect=OSError("disk full")):
            response = self.client.post("/start", json=self.START)
        self.assertEqual(response.status_code, 500)
        self.assertIn("disk full", response.get_json()["status"])
        self.assertFalse(session_manager.is_session_active())


class WebSocketOriginTests(unittest.TestCase):
    def open_connection(self, origin):
        ws = MagicMock()
        ws.environ = {"HTTP_ORIGIN": origin} if origin else {}
        app = websocket_server.WebSocketApp(ws)
        websocket_server.connected_clients.clear()
        app.on_open()
        return ws, app

    def tearDown(self):
        websocket_server.connected_clients.clear()

    def test_a_web_page_cannot_listen_to_the_transcription(self):
        ws, _ = self.open_connection(EVIL)
        ws.close.assert_called_once()
        self.assertEqual(websocket_server.connected_clients, [])

    def test_the_extension_is_accepted(self):
        ws, _ = self.open_connection(EXTENSION)
        ws.close.assert_not_called()
        self.assertEqual(websocket_server.connected_clients, [ws])

    def test_closing_a_rejected_connection_does_not_raise(self):
        _, app = self.open_connection(EVIL)
        app.on_close("bye")


@contextlib.contextmanager
def stub_hardware(vosk_model=None):
    """voice_control / eye_tracking imported against fake vosk, sounddevice,
    pyautogui, pyperclip and tobii_research; gone again afterwards."""
    class FakeStream:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *exc): return False

    vosk = types.ModuleType("vosk")
    vosk.Model = vosk_model or (lambda lang: object())
    vosk.KaldiRecognizer = lambda model, rate: MagicMock()
    sounddevice = types.ModuleType("sounddevice")
    sounddevice.RawInputStream = FakeStream
    tobii = types.ModuleType("tobii_research")
    tobii.EYETRACKER_GAZE_DATA = "gaze"
    tobii.find_all_eyetrackers = lambda: []
    pyautogui = MagicMock()
    pyautogui.size.return_value = (100, 100)
    stubs = {"vosk": vosk, "sounddevice": sounddevice, "tobii_research": tobii,
             "pyautogui": pyautogui, "pyperclip": MagicMock()}
    with patch.dict(sys.modules, stubs):
        try:
            yield tobii
        finally:
            sys.modules.pop("voice_control", None)
            sys.modules.pop("eye_tracking", None)


def new_session(mode="eye_voice"):
    return session_recorder.create_session("P", "http://x", "en-us", mode)


class StopDuringStartupTests(RecordingTestCase):
    def test_stop_during_the_voice_model_load_still_ends_the_thread(self):
        loading, release = threading.Event(), threading.Event()

        def slow_model(lang):
            loading.set()
            release.wait(5)
            return object()

        with stub_hardware(vosk_model=slow_model):
            capturer = session_manager._voice_control_capturer()
            thread = capturer["start"](new_session())
            thread.start()
            self.assertTrue(loading.wait(3))

            capturer["stop"]()      # the user pressed Stop while the model loads
            release.set()           # ...and the load finishes afterwards

            thread.join(3)
            self.assertFalse(thread.is_alive(), "Stop was overwritten by the thread starting up")

    def test_a_new_voice_run_does_not_inherit_typing_mode(self):
        with stub_hardware():
            import voice_control
            voice_control.is_typing_mode = True
            voice_control.typed_text_buffer = "left over"
            voice_control.audio_queue.put(b"old audio")

            voice_control.prepare_voice_control()

            self.assertFalse(voice_control.is_typing_mode)
            self.assertEqual(voice_control.typed_text_buffer, "")
            self.assertTrue(voice_control.audio_queue.empty())
            self.assertTrue(voice_control.is_voice_recognition_active)

    def test_stop_before_the_eye_tracking_thread_runs_still_ends_it(self):
        with stub_hardware() as tobii:
            tracker = MagicMock(serial_number="T1")
            tobii.find_all_eyetrackers = lambda: [tracker]
            capturer = session_manager._eye_tracking_capturer()
            thread = capturer["start"](new_session())

            capturer["stop"]()      # stop lands before the thread was even started
            thread.start()

            thread.join(3)
            self.assertFalse(thread.is_alive(), "Stop was overwritten by the thread starting up")
            tracker.unsubscribe_from.assert_called_once()

    def test_a_new_eye_tracking_run_starts_from_a_clean_state(self):
        with stub_hardware():
            import eye_tracking
            eye_tracking.previous_position = (5, 5)
            eye_tracking.global_gaze_data = {"stale": True}
            eye_tracking.gaze_buffer.append((1, 1))

            eye_tracking.prepare_eye_tracking()

            self.assertIsNone(eye_tracking.previous_position)
            self.assertIsNone(eye_tracking.global_gaze_data)
            self.assertEqual(len(eye_tracking.gaze_buffer), 0)
            self.assertTrue(eye_tracking.is_tracking)


class CapturerCrashTests(RecordingTestCase):
    def test_a_capturer_that_raises_is_recorded_on_the_session(self):
        session = new_session()

        def boom(_session):
            raise RuntimeError("no microphone permission")

        session_manager._guarded("voice_control", boom)(session)
        self.assertEqual(len(session.errors), 1)
        self.assertIn("voice_control", session.errors[0])
        self.assertIn("no microphone permission", session.errors[0])

    def test_a_voice_model_that_fails_to_load_shows_up_in_status(self):
        def broken_model(lang):
            raise RuntimeError("model for 'fr' not found")

        fake_eye = lambda: {"start": lambda s: threading.Thread(target=lambda: None), "stop": lambda: None}
        with stub_hardware(vosk_model=broken_model), \
                patch.dict(session_manager.CAPTURER_FACTORIES, {"eye_tracking": fake_eye}):
            session_manager.reset_capturer_cache()
            session_manager.start_session("P", "http://x", "fr", "eye_voice")

            self.assertTrue(wait_for(lambda: self.client.get("/status").get_json()["hasErrors"]))
            status = self.client.get("/status").get_json()
            self.assertTrue(status["sessionActive"])
            self.assertIn("model for 'fr' not found", status["errors"][-1])

            self.assertEqual(self.client.post("/stop").status_code, 200)
            session_manager.reset_capturer_cache()


if __name__ == "__main__":
    unittest.main()
