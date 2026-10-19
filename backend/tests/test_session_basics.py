"""
Run from backend/:  venv/bin/python3 -m unittest discover -s tests -t .

Three small contracts the rest of the backend leans on:
- Session.set_state only accepts the known lifecycle states, so a typo cannot
  silently make a running session look inactive;
- viewport sizes are sanitized when a session is created, so a malformed one
  can never produce a Gherkin step that fails to match {int}x{int} at replay;
- an unsupported voice language falls back to en-us AND says so on the session.
"""
import json
import os
import unittest

import session_manager
import session_recorder
from tests.test_hardening import stub_hardware
from tests.test_recording_pipeline import RecordingTestCase, read


class SessionStateTests(RecordingTestCase):
    def test_a_new_session_is_idle(self):
        session = session_recorder.create_session("P", "http://x", "en-us", "mouse_keyboard")
        self.assertEqual(session.state, "idle")

    def test_every_known_state_is_accepted(self):
        session = session_recorder.create_session("P", "http://x", "en-us", "mouse_keyboard")
        for state in sorted(session_recorder.SESSION_STATES):
            session.set_state(state)
            self.assertEqual(session.state, state)

    def test_a_misspelled_state_is_rejected_and_leaves_the_state_alone(self):
        session = session_recorder.create_session("P", "http://x", "en-us", "mouse_keyboard")
        session.set_state("running")
        for bad in ("runnning", "RUNNING", "", None):
            with self.assertRaises(ValueError):
                session.set_state(bad)
            self.assertEqual(session.state, "running")

    def test_start_and_stop_move_the_session_through_running_to_stopped(self):
        session = session_manager.start_session("P", "http://x", "en-us", "mouse_keyboard")
        self.assertEqual(session.state, "running")
        self.assertTrue(session_manager.is_session_active())
        stopped = session_manager.stop_session()
        self.assertIs(stopped, session)
        self.assertEqual(stopped.state, "stopped")
        self.assertFalse(session_manager.is_session_active())


class ViewportDimensionTests(unittest.TestCase):
    def test_positive_whole_numbers_are_kept(self):
        for value, expected in ((1280, 1280), ("720", 720), (1024.9, 1024), (1, 1)):
            self.assertEqual(session_recorder.parse_viewport_dimension(value), expected, value)

    def test_anything_else_is_treated_as_not_provided(self):
        malformed = [None, 0, -5, "0", "-1", "abc", "1280px", "", [], [1280], {}, {"w": 1},
                     True, False, float("inf"), float("-inf"), float("nan"), 0.4]
        for value in malformed:
            self.assertIsNone(session_recorder.parse_viewport_dimension(value), repr(value))


class SessionHeaderTests(RecordingTestCase):
    def header(self, **kwargs):
        session = session_recorder.create_session("P", "http://x", "en-us", "mouse_keyboard", **kwargs)
        return read(session.test_file)

    def test_a_valid_viewport_is_written_before_navigating(self):
        header = self.header(viewport_width=1280, viewport_height=720)
        self.assertIn("Given I set the viewport to 1280x720", header)
        self.assertLess(header.index("set the viewport"), header.index("navigate to page"))

    def test_a_malformed_viewport_is_left_out_instead_of_breaking_the_scenario(self):
        for width, height in (("wide", 720), (1280, None), (0, 720), (True, 720), (float("inf"), 720), ([1280], 720)):
            header = self.header(viewport_width=width, viewport_height=height)
            self.assertNotIn("set the viewport", header, (width, height))
            self.assertIn('Given I navigate to page "http://x"', header)

    def test_the_page_name_and_url_are_escaped_in_the_header(self):
        session = session_recorder.create_session('Say "hi"\nnow', 'http://x/?q="a"', "en-us", "mouse_keyboard")
        header = read(session.test_file)
        self.assertIn('named "Say \\"hi\\"\\nnow"', header)
        self.assertIn('navigate to page "http://x/?q=\\"a\\""', header)
        # a raw newline or quote would have split or closed the step
        scenario = [line for line in header.splitlines() if line.startswith("Scenario:")]
        self.assertEqual(len(scenario), 1)


class LanguageConfigTests(RecordingTestCase):
    @staticmethod
    def commands():
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "commands.json")
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def session(self):
        return session_recorder.create_session("P", "http://x", "en-us", "eye_voice")

    def test_a_supported_language_loads_its_own_commands_without_an_error(self):
        session = self.session()
        with stub_hardware():
            import voice_control
            voice_control.load_language_config("es", session)
            self.assertEqual(voice_control.language_config, self.commands()["es"])
        self.assertEqual(session.errors, [])

    def test_an_unsupported_language_falls_back_to_english_and_records_it(self):
        session = self.session()
        with stub_hardware():
            import voice_control
            voice_control.load_language_config("xx-nope", session)
            self.assertEqual(voice_control.language_config, self.commands()["en-us"])
        self.assertEqual(len(session.errors), 1)
        self.assertIn("xx-nope", session.errors[0])
        self.assertIn("en-us", session.errors[0])

    def test_the_fallback_also_works_with_no_session_to_report_to(self):
        with stub_hardware():
            import voice_control
            voice_control.load_language_config("xx-nope")
            self.assertEqual(voice_control.language_config, self.commands()["en-us"])

    def test_set_voice_language_reports_the_fallback_on_the_session(self):
        session = self.session()
        with stub_hardware():
            import voice_control
            voice_control.set_voice_language("xx-nope", session)
            self.assertEqual(voice_control.get_current_language(), "xx-nope")
            self.assertEqual(voice_control.language_config, self.commands()["en-us"])
        self.assertEqual(len(session.errors), 1)

    def test_set_voice_language_with_a_supported_language_records_nothing(self):
        session = self.session()
        with stub_hardware():
            import voice_control
            voice_control.set_voice_language("es", session)
            self.assertEqual(voice_control.language_config, self.commands()["es"])
        self.assertEqual(session.errors, [])


if __name__ == "__main__":
    unittest.main()
