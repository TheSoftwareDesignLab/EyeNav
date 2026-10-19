#!/usr/bin/env bash
# Permanently deletes the recorded sessions and transcriptions, and the Python
# caches. The recordings are gitignored and not backed up anywhere, so there is
# no getting them back: copy the ones you want to keep first (testing/copy.sh).
#
# Asks you to type "delete" and does nothing otherwise - including when there
# is no terminal to answer (run from a script, a hook or an editor task).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Same location rule as settings.py: next to this script unless EYENAV_DATA_DIR is set.
DATA_DIR="${EYENAV_DATA_DIR:-$SCRIPT_DIR}"
SESSIONS="$DATA_DIR/test_sessions"
TRANSCRIPTIONS="$DATA_DIR/transcriptions"

count_files() {
    find "$1" -type f 2>/dev/null | wc -l | tr -d ' '
}

echo "This will PERMANENTLY delete:"
echo "  $(count_files "$SESSIONS") recorded session file(s) in $SESSIONS"
echo "  $(count_files "$TRANSCRIPTIONS") transcription file(s) in $TRANSCRIPTIONS"
echo "  the Python caches in $SCRIPT_DIR/__pycache__"
echo "They are not in git and not backed up. Keep any you need first (testing/copy.sh)."

if ! read -r -p "Type 'delete' to continue: " answer || [ "$answer" != "delete" ]; then
    echo "Nothing was deleted."
    exit 1
fi

rm -rf "${SESSIONS:?}"/* "${TRANSCRIPTIONS:?}"/* "${SCRIPT_DIR:?}/__pycache__"
echo "Done."
