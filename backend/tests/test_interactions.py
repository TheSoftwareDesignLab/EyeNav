"""
Run from backend/:  venv/bin/python3 -m unittest discover -s tests -t .

The interactions beyond click, typing and resize that the browser reports:
choosing an option in a <select>, scrolling (the page or one element), and
dragging one element onto another. Each travels as its own event type, becomes
one Gherkin step, and is replayed by a matching step definition.
"""
import json
import os
import unittest

import event_model
import feature_writer
import session_manager
from tests.test_recording_pipeline import RecordingTestCase, read


def browser_event(event_type, **data):
    return event_model.build_event("browser", event_type, data)


class EventTypeTests(unittest.TestCase):
    def test_the_new_interactions_are_browser_events(self):
        for event_type in ("select", "scroll", "drag"):
            self.assertEqual(event_model.build_event("browser", event_type, {}).type, event_type)

    def test_they_are_not_voice_events(self):
        for event_type in ("select", "scroll", "drag"):
            with self.assertRaises(event_model.InvalidEventError):
                event_model.validate("voice", event_type, {})


class SelectStepTests(unittest.TestCase):
    def test_a_choice_becomes_a_select_step(self):
        step = feature_writer.to_gherkin_step(browser_event("select", text="Colombia", id="country", xpath='//*[@id="country"]'))
        self.assertEqual(step, '\tAnd I select "Colombia" in the dropdown with xpath "//*[@id=\\"country\\"]"')

    def test_the_option_text_is_escaped(self):
        step = feature_writer.to_gherkin_step(browser_event("select", text='Say "hi"', xpath="//select"))
        self.assertIn('I select "Say \\"hi\\"" in', step)

    def test_an_empty_option_text_is_still_a_choice(self):
        # a blank first option ("-- choose --" rendered empty) is a real option
        step = feature_writer.to_gherkin_step(browser_event("select", text="", xpath="//select"))
        self.assertEqual(step, '\tAnd I select "" in the dropdown with xpath "//select"')

    def test_without_the_text_or_the_element_there_is_nothing_to_replay(self):
        self.assertIsNone(feature_writer.to_gherkin_step(browser_event("select", text=None, xpath="//select")))
        self.assertIsNone(feature_writer.to_gherkin_step(browser_event("select", text="A", xpath=None)))


class ScrollStepTests(unittest.TestCase):
    def test_a_page_scroll_has_no_element(self):
        step = feature_writer.to_gherkin_step(browser_event("scroll", x=0, y=1200, xpath=None))
        self.assertEqual(step, "\tAnd I scroll the page to 0,1200")

    def test_an_element_scroll_names_the_element(self):
        step = feature_writer.to_gherkin_step(browser_event("scroll", x=0, y=300, xpath='//*[@id="list"]'))
        self.assertEqual(step, '\tAnd I scroll the element with xpath "//*[@id=\\"list\\"]" to 0,300')

    def test_a_negative_offset_is_kept(self):
        # right-to-left pages scroll to negative x
        step = feature_writer.to_gherkin_step(browser_event("scroll", x=-250, y=0, xpath=None))
        self.assertEqual(step, "\tAnd I scroll the page to -250,0")

    def test_a_missing_offset_is_skipped(self):
        self.assertIsNone(feature_writer.to_gherkin_step(browser_event("scroll", x=None, y=5, xpath=None)))
        self.assertIsNone(feature_writer.to_gherkin_step(browser_event("scroll", x=5, y=None, xpath=None)))


class DragStepTests(unittest.TestCase):
    def test_a_drop_names_both_elements(self):
        step = feature_writer.to_gherkin_step(browser_event("drag", source_xpath="//li[1]", target_xpath="//li[3]"))
        self.assertEqual(
            step,
            '\tAnd I drag the element with xpath "//li[1]" onto the element with xpath "//li[3]"',
        )

    def test_it_needs_both_ends(self):
        self.assertIsNone(feature_writer.to_gherkin_step(browser_event("drag", source_xpath="//li[1]", target_xpath=None)))
        self.assertIsNone(feature_writer.to_gherkin_step(browser_event("drag", source_xpath="", target_xpath="//li[3]")))


class InteractionRouteTests(RecordingTestCase):
    def setUp(self):
        super().setUp()
        self.client.post("/start", json={"pageName": "P", "pageUrl": "http://x", "captureMode": "mouse_keyboard"})
        self.session = session_manager._active_session

    def recorded_steps(self):
        self.client.post("/stop")  # joins the logger, so every event is already written
        return [line.strip() for line in read(self.session.test_file).splitlines() if line.strip().startswith("And")]

    def logged_events(self):
        """Event types in the raw events log (the file is only created by the first event)."""
        self.client.post("/stop")
        if not os.path.exists(self.session.events_file):
            return []
        return [json.loads(line)["type"] for line in read(self.session.events_file).splitlines() if line.strip()]

    def test_a_select_is_recorded(self):
        response = self.client.post("/select-info", json={"text": "Colombia", "id": "c", "xpath": "//select"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.recorded_steps(), ['And I select "Colombia" in the dropdown with xpath "//select"'])

    def test_a_page_scroll_and_an_element_scroll_are_recorded(self):
        self.client.post("/scroll-info", json={"x": 0, "y": 900, "xpath": None})
        self.client.post("/scroll-info", json={"x": 0, "y": 40, "xpath": "//div[2]"})
        self.assertEqual(self.recorded_steps(), [
            "And I scroll the page to 0,900",
            'And I scroll the element with xpath "//div[2]" to 0,40',
        ])

    def test_a_drag_is_recorded(self):
        self.client.post("/drag-info", json={"sourceXpath": "//li[1]", "targetXpath": "//li[2]"})
        self.assertEqual(self.recorded_steps(), [
            'And I drag the element with xpath "//li[1]" onto the element with xpath "//li[2]"',
        ])

    def test_a_malformed_select_is_ignored_not_crashed_on(self):
        for body in ({"text": ["Colombia"], "xpath": "//select"}, {"text": "A", "xpath": 7},
                     {"text": "A"}, {"xpath": "//select"}, {}):
            self.assertEqual(self.client.post("/select-info", json=body).status_code, 200, body)
        self.assertEqual(self.recorded_steps(), [])
        self.assertEqual(self.logged_events(), [])

    def test_malformed_scroll_offsets_are_ignored(self):
        for body in ({"x": "far", "y": 1}, {"x": 0, "y": [5]}, {"x": True, "y": 1}, {"x": 0},
                     {"x": 0, "y": float("inf")}, {"x": 0, "y": 10 ** 12}, {}):
            self.assertEqual(self.client.post("/scroll-info", json=body).status_code, 200, body)
        self.assertEqual(self.recorded_steps(), [])
        self.assertEqual(self.logged_events(), [])

    def test_a_scroll_with_a_malformed_xpath_is_not_recorded_as_a_page_scroll(self):
        # an xpath that is present but unusable must not turn into "scroll the page"
        for xpath in (["//div"], 5, {"a": 1}):
            self.client.post("/scroll-info", json={"x": 0, "y": 10, "xpath": xpath})
        self.assertEqual(self.recorded_steps(), [])
        self.assertEqual(self.logged_events(), [])

    def test_a_malformed_drag_is_ignored(self):
        for body in ({"sourceXpath": ["//li"], "targetXpath": "//li[2]"}, {"sourceXpath": "//li"}, {}):
            self.assertEqual(self.client.post("/drag-info", json=body).status_code, 200, body)
        self.assertEqual(self.recorded_steps(), [])
        self.assertEqual(self.logged_events(), [])

    def test_whole_number_strings_and_floats_are_accepted_as_offsets(self):
        self.client.post("/scroll-info", json={"x": "12", "y": 340.7})
        self.assertEqual(self.recorded_steps(), ["And I scroll the page to 12,340"])

    def test_nothing_is_recorded_outside_a_session(self):
        self.client.post("/stop")
        for route, body in (("/select-info", {"text": "A", "xpath": "//select"}),
                            ("/scroll-info", {"x": 0, "y": 1}),
                            ("/drag-info", {"sourceXpath": "//a", "targetXpath": "//b"})):
            self.assertEqual(self.client.post(route, json=body).status_code, 200, route)
        self.assertNotIn("And I", read(self.session.test_file))

    def test_non_object_bodies_are_rejected(self):
        for route in ("/select-info", "/scroll-info", "/drag-info"):
            self.assertEqual(self.client.post(route, data="[1]", content_type="application/json").status_code, 400, route)

    def test_a_long_option_text_is_cut_like_any_other_field(self):
        # under the request size limit, over the per-field one
        self.client.post("/select-info", json={"text": "A" * 10_000, "xpath": "//select"})
        step = self.recorded_steps()[0]
        self.assertIn("A" * 4096, step)
        self.assertNotIn("A" * 4097, step)

    def test_a_request_over_the_size_limit_is_refused(self):
        response = self.client.post("/select-info", json={"text": "A" * 100_000, "xpath": "//select"})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.recorded_steps(), [])

    def test_interactions_keep_the_order_they_were_reported_in(self):
        self.client.post("/tag-info", json={"id": "open", "xpath": '//*[@id="open"]'})
        self.client.post("/select-info", json={"text": "B", "xpath": "//select"})
        self.client.post("/scroll-info", json={"x": 0, "y": 500})
        self.client.post("/drag-info", json={"sourceXpath": "//li[1]", "targetXpath": "//li[2]"})
        steps = self.recorded_steps()
        kinds = ["scroll until" if "scroll until" in s else s.split()[2] for s in steps]
        self.assertEqual(kinds, ["scroll until", "click", "select", "scroll", "drag"])


if __name__ == "__main__":
    unittest.main()
