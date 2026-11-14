#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
exec java -jar satellite-mission-planner-1.0.0.jar "$@"
