#!/usr/bin/env bash
# Builds the production app for macOS arm64, signs it ad-hoc, and with
# --install copies it to /Applications.
set -euo pipefail

# The build needs Node.js 24 or later. Check the active Node version instead
# of a fixed path, so the script runs on any machine with the right version
# on PATH.
NODE_MAJOR="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Error: Node.js 24 or later is required. Found: $(node --version)" >&2
  exit 1
fi

export CC=/usr/bin/cc CXX=/usr/bin/c++
export CSC_IDENTITY_AUTO_DISCOVERY=false

cd "$(dirname "$0")/.."

npm run download:plugins
npm run build:production
npm exec --workspace applications/electron -- electron-builder --config electron-builder.yml --mac --arm64 --publish never

APP="applications/electron/dist/mac-arm64/AI1.app"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
echo "Packaged: $APP"

if [ "${1:-}" = "--install" ]; then
  TARGET="/Applications/AI1.app"
  rm -rf "$TARGET"
  ditto "$APP" "$TARGET"
  echo "Installed: $TARGET"
fi
