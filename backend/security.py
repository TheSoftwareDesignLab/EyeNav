import re

# Only the EyeNav extension itself should talk to this backend. A web page
# can reach localhost:5001/5002 just as easily as the extension can, so
# without these checks any site the user visits could start a recording
# (microphone + eye tracker), stop it, inject steps into the .feature, or
# read the live voice transcription.
EXTENSION_ORIGIN = re.compile(r"^chrome-extension://[a-p]{32}$")

LOCAL_HOSTNAMES = {"localhost", "127.0.0.1", "[::1]"}


def is_trusted_origin(origin):
    """
    A request with no Origin header (curl, a local script, the test client)
    is not a browser cross-origin request, so it's allowed; one that carries
    an Origin must be the extension's. Browsers always attach Origin to
    cross-origin POSTs and WebSocket handshakes, which is what this relies on.
    """
    return origin is None or EXTENSION_ORIGIN.match(origin) is not None


def is_local_host(host_header):
    """
    Rejects a Host header naming anything but loopback, which is how a DNS
    rebinding page (evil.example resolving to 127.0.0.1) would reach us.
    """
    host = host_header or ""
    # "[::1]:5001" -> "[::1]"; "localhost:5001" -> "localhost"; no port -> as-is
    hostname = host[:host.index("]") + 1] if host.startswith("[") and "]" in host else host.split(":")[0]
    return hostname in LOCAL_HOSTNAMES
