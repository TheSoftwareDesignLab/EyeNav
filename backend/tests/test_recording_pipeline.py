"""
Run from backend/:  venv/bin/python3 -m unittest discover -s tests -t .

Covers the recording pipeline's contracts: how events become Gherkin steps,
what the HTTP routes accept/return, and the session start/stop lifecycle.
No hardware is needed - capturers are replaced with fakes.
"""
import glob
import os
import threading
import time
import unittest
from unittest.mock import patch

import event_bus
import event_model
import feature_writer
import main as main_module
import session_manager
import settings


def read(path):
    with open(path) as f:
        return f.read()


def wait_for(condition, timeout=3.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if condition():
            return True
        time.sleep(0.02)
    return False


def click_event(**data):
    payload = {"selector": None, "href": None, "id": None, "xpath": None}
    payload.update(data)
    return event_model.build_event("browser", "click", payload)


class RecordingTestCase(unittest.TestCase):
    """Starts every test with no session running, and removes the files it created."""

    @classmethod
    def setUpClass(cls):
        cls._dirs = [settings.TEST_DIRECTORY, settings.EVENTS_DIRECTORY, settings.TRANSCRIPTION_DIR]
        cls._existing = {path for d in cls._dirs for path in glob.glob(os.path.join(d, "*"))}

    @classmethod
    def tearDownClass(cls):
        for d in cls._dirs:
            for path in glob.glob(os.path.join(d, "*")):
                if path not in cls._existing:
                    os.remove(path)

    def setUp(self):
        self._stop_any_session()
        session_manager.reset_capturer_cache()
        self.client = main_module.app.test_client()

    def tearDown(self):
        self._stop_any_session()
        session_manager.reset_capturer_cache()

    @staticmethod
    def _stop_any_session():
        if session_manager.is_session_active():
            session_manager.stop_session()


class EventModelTests(unittest.TestCase):
    def test_resize_is_a_browser_event(self):
        event = event_model.build_event("browser", "resize", {"width": 1024, "height": 768})
        self.assertEqual(event.type, "resize")

    def test_resize_is_not_a_voice_event(self):
        with self.assertRaises(event_model.InvalidEventError):
            event_model.validate("voice", "resize", {})


class FeatureWriterTests(unittest.TestCase):
    def test_click_with_xpath_only_scrolls_then_clicks(self):
        step = feature_writer.to_gherkin_step(click_event(xpath='//*[@id="a"]'))
        self.assertEqual(
            step,
            '\tAnd I scroll until I can see the element with xpath "//*[@id=\\"a\\"]"\n'
            '\tAnd I click on tag with xpath "//*[@id=\\"a\\"]"',
        )

    def test_click_by_href_or_id_still_scrolls_to_the_exact_element_by_xpath(self):
        by_href = feature_writer.to_gherkin_step(click_event(href="http://x", xpath="//a[1]"))
        by_id = feature_writer.to_gherkin_step(click_event(id="go", xpath="//a[1]"))
        self.assertEqual(by_href.split("\n"), [
            '\tAnd I scroll until I can see the element with xpath "//a[1]"',
            '\tAnd I click on tag with href "http://x"',
        ])
        self.assertEqual(by_id.split("\n")[1], '\tAnd I click on tag with id "go"')

    def test_click_without_xpath_has_no_scroll_step(self):
        step = feature_writer.to_gherkin_step(click_event(href="http://x"))
        self.assertEqual(step, '\tAnd I click on tag with href "http://x"')

    def test_click_without_any_target_is_skipped(self):
        self.assertIsNone(feature_writer.to_gherkin_step(click_event()))

    def test_resize_reuses_the_viewport_step_text(self):
        event = event_model.build_event("browser", "resize", {"width": 1024, "height": 768})
        self.assertEqual(feature_writer.to_gherkin_step(event), "\tAnd I set the viewport to 1024x768")

    def test_resize_missing_a_dimension_is_skipped(self):
        event = event_model.build_event("browser", "resize", {"width": 1024})
        self.assertIsNone(feature_writer.to_gherkin_step(event))


class RouteTests(RecordingTestCase):
    def start(self, mode="mouse_keyboard", name="P"):
        return self.client.post("/start", json={"pageName": name, "pageUrl": "http://x", "captureMode": mode})

    def test_start_while_running_is_a_409_naming_the_active_mode(self):
        self.assertEqual(self.start().status_code, 200)
        response = self.start(name="Other")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["activeCaptureMode"], "mouse_keyboard")
        # the rejected request must not disturb the running session
        status = self.client.get("/status").get_json()
        self.assertTrue(status["sessionActive"])

    def test_other_start_failures_stay_400(self):
        response = self.start(mode="bogus")
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("activeCaptureMode", response.get_json())

    def test_status_is_derived_from_a_single_snapshot(self):
        self.start()
        real = session_manager._snapshot_active_session
        calls = []

        def counting():
            calls.append(1)
            return real()

        with patch.object(session_manager, "_snapshot_active_session", counting):
            body = self.client.get("/status").get_json()
        self.assertEqual(len(calls), 1)
        self.assertEqual((body["sessionActive"], body["captureMode"]), (True, "mouse_keyboard"))

    def test_status_never_reports_active_without_a_mode(self):
        # What a concurrent /stop between several reads used to produce.
        self.start()
        real = session_manager._snapshot_active_session
        reads = {"n": 0}

        def flaky():
            reads["n"] += 1
            return real() if reads["n"] == 1 else None

        with patch.object(session_manager, "_snapshot_active_session", flaky):
            body = self.client.get("/status").get_json()
        self.assertEqual((body["sessionActive"], body["captureMode"]), (True, "mouse_keyboard"))

    def test_status_after_stop_reports_the_stopped_sessions_errors(self):
        self.start()
        session_manager._active_session.add_error("boom")
        self.client.post("/stop")
        body = self.client.get("/status").get_json()
        self.assertEqual((body["sessionActive"], body["hasErrors"], body["errors"]), (False, True, ["boom"]))

    def test_new_clean_session_does_not_inherit_previous_errors(self):
        self.start()
        session_manager._active_session.add_error("old")
        self.client.post("/stop")
        self.start(name="Clean")
        self.assertFalse(self.client.get("/status").get_json()["hasErrors"])

    def test_viewport_info_lands_in_the_feature_file(self):
        self.start()
        session = session_manager._active_session
        self.assertEqual(self.client.post("/viewport-info", json={"width": 1024, "height": 768}).status_code, 200)
        self.client.post("/stop")  # joins the logger, so the event is written by now
        self.assertIn("And I set the viewport to 1024x768", read(session.test_file))

    def test_viewport_info_ignores_malformed_dimensions(self):
        self.start()
        session = session_manager._active_session
        response = self.client.post("/viewport-info", json={"width": [1024], "height": 768})
        self.assertEqual(response.status_code, 200)
        self.client.post("/stop")
        self.assertNotIn("And I set the viewport", read(session.test_file))

    def test_viewport_info_with_no_session_is_a_noop(self):
        response = self.client.post("/viewport-info", json={"width": 1024, "height": 768})
        self.assertEqual(response.status_code, 200)

    def test_non_object_bodies_are_rejected_on_every_post_route(self):
        for route in ("/start", "/tag-info", "/input-info", "/viewport-info"):
            response = self.client.post(route, data="[1]", content_type="application/json")
            self.assertEqual(response.status_code, 400, route)

    def test_click_and_resize_are_recorded_in_order(self):
        self.start()
        session = session_manager._active_session
        self.client.post("/tag-info", json={"id": "submit", "xpath": '//*[@id="submit"]'})
        self.client.post("/viewport-info", json={"width": 900, "height": 500})
        self.client.post("/stop")
        steps = [line.strip() for line in read(session.test_file).splitlines() if line.strip()]
        scroll = next(i for i, s in enumerate(steps) if s.startswith("And I scroll until"))
        click = next(i for i, s in enumerate(steps) if s.startswith("And I click on tag with id"))
        resize = next(i for i, s in enumerate(steps) if s == "And I set the viewport to 900x500")
        self.assertLess(scroll, click)
        self.assertLess(click, resize)

    def test_input_is_dropped_in_eye_voice_mode_but_clicks_are_not(self):
        # eye_voice dictation is already recorded as a voice event; the
        # browser's own copy of the same text would duplicate it.
        with patch.object(session_manager, "get_active_capture_mode", return_value="eye_voice"), \
                patch.object(event_bus, "publish") as publish:
            self.client.post("/input-info", json={"text": "hi", "xpath": "//input"})
            publish.assert_not_called()
            self.client.post("/tag-info", json={"id": "x", "xpath": "//a"})
            publish.assert_called_once()


class SessionLifecycleTests(RecordingTestCase):
    def fake_capturers(self, release):
        return {
            "eye_tracking": lambda: {"start": lambda s: threading.Thread(target=lambda: None), "stop": lambda: None},
            "voice_control": lambda: {
                "start": lambda s: threading.Thread(target=release.wait, daemon=True),
                "stop": lambda: None,
            },
        }

    def test_a_failed_stop_leaves_a_session_that_still_records_and_can_be_stopped_again(self):
        release = threading.Event()
        with patch.dict(session_manager.CAPTURER_FACTORIES, self.fake_capturers(release)), \
                patch.object(session_manager, "THREAD_JOIN_TIMEOUT_SECONDS", 0.3):
            session_manager.reset_capturer_cache()
            session = session_manager.start_session("P", "http://x", "en-us", "eye_voice")

            with self.assertRaises(session_manager.SessionStopError):
                session_manager.stop_session()

            logger_thread = session_manager._active_threads[session_manager.INTERACTION_LOGGER]
            self.assertTrue(session_manager.is_session_active())
            self.assertTrue(logger_thread.is_alive())
            self.assertTrue(event_bus._queue.empty(), "a failed stop must not leave a stop sentinel behind")

            event_bus.publish("browser", "click", {"selector": None, "href": None, "id": "still", "xpath": None})
            self.assertTrue(wait_for(lambda: 'click on tag with id "still"' in read(session.test_file)))

            release.set()
            session_manager.stop_session()
            self.assertFalse(session_manager.is_session_active())
            self.assertFalse(logger_thread.is_alive())

    def test_a_new_session_ignores_a_stale_stop_sentinel(self):
        event_bus.stop()  # left behind by an earlier stop
        session = session_manager.start_session("P", "http://x", "en-us", "mouse_keyboard")
        event_bus.publish("browser", "click", {"selector": None, "href": None, "id": "after", "xpath": None})
        session_manager.stop_session()
        self.assertIn('click on tag with id "after"', read(session.test_file))

    def test_a_new_session_does_not_inherit_events_nobody_consumed(self):
        event_bus.publish("browser", "click", {"selector": None, "href": None, "id": "orphan", "xpath": None})
        session = session_manager.start_session("P", "http://x", "en-us", "mouse_keyboard")
        session_manager.stop_session()
        self.assertNotIn("orphan", read(session.test_file))

    def test_already_running_error_carries_the_mode_and_is_a_start_error(self):
        session_manager.start_session("P", "http://x", "en-us", "mouse_keyboard")
        with self.assertRaises(session_manager.SessionAlreadyRunningError) as caught:
            session_manager.start_session("P2", "http://y", "en-us", "mouse_keyboard")
        self.assertEqual(caught.exception.active_capture_mode, "mouse_keyboard")
        self.assertIsInstance(caught.exception, session_manager.SessionStartError)


if __name__ == "__main__":
    unittest.main()
