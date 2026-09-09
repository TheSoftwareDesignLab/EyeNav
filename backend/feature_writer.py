def to_gherkin_step(event):
    """
    Translates a captured Event into a Gherkin step, or None if this kind of
    event isn't meant to become a reproducible step (e.g. continuous mouse
    movement or gaze data, once those sources publish events).
    @param event: an event_model.Event
    @return: a Gherkin step string, or None
    """
    data = event.data

    if event.type == "click":
        if data.get("href"):
            return f'\tAnd I click on tag with href "{data["href"]}"'
        elif data.get("id"):
            return f'\tAnd I click on tag with id "{data["id"]}"'
        else:
            return f'\tAnd I click on tag with xpath "{data["xpath"]}"'

    if event.type == "input":
        return f'\tAnd I input "{data["text"]}"'

    if event.type == "enter":
        return '\tAnd I hit enter'

    if event.type == "back":
        return '\tAnd I go back'

    if event.type == "forward":
        return '\tAnd I go forward'

    if event.type == "go":
        return '\tAnd I scroll down' if data.get("direction", 0) > 0 else '\tAnd I scroll up'

    return None
