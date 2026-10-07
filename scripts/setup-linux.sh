#!/usr/bin/env bash
# Checks or builds a Linux test app without installing system packages.
set -euo pipefail

if [ "$#" -gt 1 ]; then
  echo "Use --check or --build. Extra arguments are not supported." >&2
  exit 1
fi

MODE="${1:---check}"
case "$MODE" in
  --check|--build) ;;
  *) echo "Use --check or --build. This script does not install an app." >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Linux Node 24 is required. See docs/omarchy-setup.md." >&2
  exit 1
fi

bash "$ROOT/scripts/package-linux.sh" --check
if [ "$MODE" = "--check" ]; then
  echo "Build prerequisites pass. Linux app behavior remains unverified."
  exit 0
fi

if [ -e "$ROOT/node_modules" ] || [ -L "$ROOT/node_modules" ]; then
  echo "Use a fresh checkout with no node_modules directory. Existing dependencies are not removed." >&2
  exit 1
fi

cd "$ROOT"
npm ci
npm run lint
npm run typecheck
npm test
npm run test:archive-security
bash scripts/package-linux.sh --dir
echo "Test app directory: applications/electron/dist/linux-unpacked"
echo "This build is not an installation. See docs/omarchy-setup.md for runtime checks."
