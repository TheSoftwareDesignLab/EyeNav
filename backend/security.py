import os
import re

# Only the EyeNav extension itself should talk to this backend. A web page
# can reach localhost:5001/5002 just as easily as the extension can, so
# without these checks any site the user visits could start a recording
# (microphone + eye tracker), stop it, inject steps into the .feature, or
# read the live voice transcription.
#
# Pinned to EyeNav's own id, not any chrome-extension:// origin: every other
# extension the user has installed can reach loopback too, and accepting all
# of them let any of those start/stop recordings or listen to the voice
# transcription. The id is stable because manifest.json carries a "key" (an
# unpacked extension's id is derived from it); if that key changes, this id
# has to change with it. EYENAV_EXTENSION_ID overrides it, e.g. for a build
# loaded with a different key.
EXTENSION_ID = os.environ.get("EYENAV_EXTENSION_ID", "ineabieboinnonmihnblhngmfhbdilkl")
if not re.fullmatch(r"[a-p]{32}", EXTENSION_ID):
    raise ValueError(f"EYENAV_EXTENSION_ID is not a valid Chrome extension id: {EXTENSION_ID!r}")
EXTENSION_ORIGIN = f"chrome-extension://{EXTENSION_ID}"

LOCAL_HOSTNAMES = {"localhost", "127.0.0.1", "[::1]"}

# Language codes accepted from the Language header: "en-us", "es", ... It
# ends up in vosk.Model(lang=...), which looks the model up on disk and can
# download one, so anything else is refused instead of handed to it.
LANGUAGE_CODE = re.compile(r"[a-z]{2,3}(-[a-z]{2,4})?")


def is_valid_language(language):
    return isinstance(language, str) and LANGUAGE_CODE.fullmatch(language) is not None


def is_trusted_origin(origin):
    """
    A request with no Origin header (curl, a local script, the test client)
    is not a browser cross-origin request, so it's allowed; one that carries
    an Origin must be the extension's. Browsers always attach Origin to
    cross-origin POSTs and WebSocket handshakes, which is what this relies on.
    """
    return origin is None or origin == EXTENSION_ORIGIN


def is_local_host(host_header):
    """
    Rejects a Host header naming anything but loopback, which is how a DNS
    rebinding page (evil.example resolving to 127.0.0.1) would reach us.
    """
    host = host_header or ""
    # "[::1]:5001" -> "[::1]"; "localhost:5001" -> "localhost"; no port -> as-is
    hostname = host[:host.index("]") + 1] if host.startswith("[") and "]" in host else host.split(":")[0]
    return hostname in LOCAL_HOSTNAMES
