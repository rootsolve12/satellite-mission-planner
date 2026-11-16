#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
(cd frontend && npm ci && npm test && npm run build)
mkdir -p src/main/resources/static
# This directory contains generated frontend assets only.
rm -rf src/main/resources/static/assets
cp -R frontend/dist/. src/main/resources/static/
mvn clean verify
