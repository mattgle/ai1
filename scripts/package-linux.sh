#!/usr/bin/env bash
# Builds an x64 Linux directory for the compatibility probe. Does not install it.
set -euo pipefail

if [ "$#" -gt 1 ]; then
  echo "Use --check or --dir. Extra arguments are not supported." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:---check}"
node "$ROOT/scripts/linux-build-check.mjs" "$MODE" "$ROOT"
if [ "$MODE" = "--check" ]; then
  exit 0
fi

cd "$ROOT"
npm run download:plugins
npm run build:production
npm exec --yes=false --workspace applications/electron -- electron-builder --config electron-builder-linux.yml --linux --x64 --dir --publish never
echo "Probe directory: applications/electron/dist/linux-unpacked"
echo "No app is installed. Native loading, sandbox, Wayland graphics, and keyring checks remain required."
