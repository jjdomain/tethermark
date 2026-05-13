#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TETHERMARK_REPO_URL:-https://github.com/jjdomain/tethermark.git}"
INSTALL_DIR="${TETHERMARK_INSTALL_DIR:-$HOME/.tethermark/tethermark}"
SKIP_ONBOARD=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --no-onboard) SKIP_ONBOARD=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --prefix=*) INSTALL_DIR="${arg#--prefix=}" ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

run() {
  echo "+ $*"
  if [ "$DRY_RUN" -eq 0 ]; then
    "$@"
  fi
}

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    echo "Install $1, then rerun this installer." >&2
    exit 1
  fi
}

echo "Tethermark installer"
echo "Install dir: $INSTALL_DIR"
echo "Repo: $REPO_URL"

need git
need node
need npm

if [ ! -d "$INSTALL_DIR/.git" ]; then
  run mkdir -p "$(dirname "$INSTALL_DIR")"
  run git clone "$REPO_URL" "$INSTALL_DIR"
else
  run git -C "$INSTALL_DIR" pull --ff-only
fi

run npm --prefix "$INSTALL_DIR" install

if [ "$SKIP_ONBOARD" -eq 0 ]; then
  run npm --prefix "$INSTALL_DIR" run scan -- onboard
fi

echo "Done. Start Tethermark with:"
echo "  cd \"$INSTALL_DIR\" && npm run oss"
