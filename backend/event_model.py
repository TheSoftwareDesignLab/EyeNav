from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

# Sources allowed to publish events to the event bus.
ALLOWED_SOURCES = {"voice", "browser"}

# Event types allowed per source. A source can only publish types listed here.
ALLOWED_TYPES_BY_SOURCE = {
    "voice": {"input", "enter", "back", "forward", "go"},
    "browser": {"click", "input"},
}


class InvalidEventError(ValueError):
    pass


@dataclass(frozen=True)
class Event:
    source: str
    type: str
    # Excluded from hash: it's a dict (unhashable), and frozen dataclasses
    # auto-generate __hash__ from every field by default, which would make
    # hash(event) raise. Still included in __eq__/repr - only hashing skips it.
    data: dict = field(hash=False)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    #python dictionary conversion
    def to_dict(self):
        return asdict(self)


def validate(source, type, data):
    """
    Raises InvalidEventError if source/type/data don't match the allowed schema.
    """
    if source not in ALLOWED_SOURCES:
        raise InvalidEventError(f"Unknown event source: {source}")

    allowed_types = ALLOWED_TYPES_BY_SOURCE[source]
    if type not in allowed_types:
        raise InvalidEventError(f"Unknown event type '{type}' for source '{source}'")

    if not isinstance(data, dict):
        raise InvalidEventError("Event data must be a dict")


def build_event(source, type, data):
    """
    Validates and builds a common Event from a source, type and payload.
    @param source: where the event came from, must be in ALLOWED_SOURCES
    @param type: the kind of event, must be allowed for that source
    @param data: source-specific payload (e.g. href/id/xpath for a click)
    @return: a validated Event
    """
    validate(source, type, data)
    return Event(source=source, type=type, data=dict(data))
