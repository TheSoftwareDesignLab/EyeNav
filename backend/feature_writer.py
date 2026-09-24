def escape_gherkin_string(value):
    """
    Escapes a value for safe embedding inside a Gherkin {string} parameter.
    Public (not the usual leading-underscore helper) because session_recorder
    needs the exact same escaping for the page name/URL it writes into every
    session's header - a second, slightly-different implementation there
    would be one more place for this kind of bug to creep back in.
    Without this, a literal double quote in captured text, an id, or an
    xpath - content.js's getXPath() always produces id-based xpaths like
    //*[@id="email"], which already contain quotes - breaks the quoting of
    the generated line and the step fails to match anything at replay time.

    Backslashes are doubled first so a stray "\" right before the escaped
    quote can't be mis-read as escaping it, which would shift where Cucumber
    thinks the {string} ends and can make the whole step fail to match
    (verified against the installed cucumber-expressions). Cucumber only
    unescapes \\" back to " on the matching side though, not \\\\ back to \\,
    so this is a one-way trip for backslashes: a value with a literal
    backslash (e.g. a Windows path typed into a field) replays with it
    doubled. ids and xpaths never contain backslashes, so this only affects
    typed text, and only when it contains one.

    Newlines can't appear in a Gherkin step at all - it's a single physical
    line - so they're flattened to a literal "\n" marker rather than left as
    a real line break, which would otherwise split the step across two lines
    and break the whole file's parsing.
    """
    return (
        value.replace("\\", "\\\\")
        .replace("\r\n", "\\n").replace("\r", "\\n").replace("\n", "\\n")
        .replace('"', '\\"')
    )


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
            return f'\tAnd I click on tag with href "{escape_gherkin_string(data["href"])}"'
        elif data.get("id"):
            return f'\tAnd I click on tag with id "{escape_gherkin_string(data["id"])}"'
        elif data.get("xpath"):
            return f'\tAnd I click on tag with xpath "{escape_gherkin_string(data["xpath"])}"'
        # No usable target at all (a malformed event, or getXPath() couldn't
        # resolve one) - nothing to replay, so skip the step instead of
        # crashing on escape_gherkin_string(None) the way this used to.
        return None

    if event.type == "input":
        # Browser-captured input knows which field it came from (content.js
        # sends it); voice-dictated input doesn't (it's just typed into
        # whatever has focus), so it falls back to the untargeted step.
        text = data.get("text")
        if text is None:
            return None
        if data.get("xpath"):
            return f'\tAnd I type "{escape_gherkin_string(text)}" into field with xpath "{escape_gherkin_string(data["xpath"])}"'
        return f'\tAnd I input "{escape_gherkin_string(text)}"'

    if event.type == "enter":
        return '\tAnd I hit enter'

    if event.type == "back":
        return '\tAnd I go back'

    if event.type == "forward":
        return '\tAnd I go forward'

    if event.type == "go":
        return '\tAnd I scroll down' if data.get("direction", 0) > 0 else '\tAnd I scroll up'

    return None
