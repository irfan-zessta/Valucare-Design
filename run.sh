#!/usr/bin/env bash
# HMS3 Corporate New Business - start the application (API + UI).
# Requires only Python 3.9+ (standard library). First start seeds fictional demo data.
#   ./run.sh                 -> http://127.0.0.1:4180/
#   PORT=5000 ./run.sh       -> custom port
#   ./run.sh --reseed        -> rebuild the demo data on start
set -e
cd "$(dirname "$0")"
exec python3 -m server.app --port "${PORT:-4180}" "$@"
