import queue

import event_model

_queue = queue.Queue()

# Sentinel used to unblock a consumer that's blocked in consume(), so its
# loop can exit cleanly instead of only stopping when the process dies.
_STOP = object()


def publish(source, event_type, data):
    """
    Validates and enqueues an event, in the order it's published. Raises
    InvalidEventError instead of queuing anything that doesn't match the
    common event schema, so capturers can publish without knowing who (if
    anyone) is consuming, and a malformed event never reaches a consumer.
    @param source: where the event came from (see event_model.ALLOWED_SOURCES)
    @param event_type: kind of event (see event_model.ALLOWED_TYPES_BY_SOURCE)
    @param data: source-specific payload
    @return: the Event that was queued
    """
    event = event_model.build_event(source, event_type, data)
    _queue.put(event)
    return event


def consume():
    """
    Blocks until the next event (or the stop signal) is available.
    """
    return _queue.get()


def is_stop_signal(item):
    return item is _STOP


def stop():
    """
    Unblocks whoever is waiting in consume() so it can exit its loop.
    """
    _queue.put(_STOP)


def reset():
    """
    Discards everything still queued and starts from an empty queue. The
    queue is process-global and outlives every session, so anything left in
    it - events nobody consumed (published while no logger was running), or
    a stop sentinel from a stop that was retried - would otherwise be the
    first thing the NEXT session's logger reads: the old events would be
    written into the new session's files, and a stale sentinel would make
    that logger exit immediately so the whole session records nothing.
    Called when a session starts, before its logger thread exists.
    """
    global _queue
    _queue = queue.Queue()
