#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TETHERMARK_REPO_URL:-https://github.com/jjdomain/tethermark.git}"
INSTALL_DIR="${TETHERMARK_INSTALL_DIR:-$HOME/.tethermark/tethermark}"
VERSION_REF="${TETHERMARK_VERSION:-main}"
MODE="install"
SKIP_ONBOARD=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --update) MODE="update" ;;
    --no-onboard) SKIP_ONBOARD=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --prefix=*) INSTALL_DIR="${arg#--prefix=}" ;;
    --repo=*) REPO_URL="${arg#--repo=}" ;;
    --ref=*) VERSION_REF="${arg#--ref=}" ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

print_command() {
  printf "+"
  printf " %q" "$@"
  printf "\n"
}

run() {
  print_command "$@"
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

need git
need node
need npm

INSTALL_DIR="$(node -e 'console.log(require("node:path").resolve(process.argv[1]))' "$INSTALL_DIR")"
if [ -z "$VERSION_REF" ] || [[ "$VERSION_REF" == -* ]]; then
  echo "Ref must be non-empty and must not begin with '-'." >&2
  exit 2
fi
if [ "$INSTALL_DIR" = "/" ] || [ "$INSTALL_DIR" = "$HOME" ]; then
  echo "Refusing unsafe install directory: $INSTALL_DIR" >&2
  exit 2
fi

echo "Tethermark $MODE"
echo "Install dir: $INSTALL_DIR"
echo "Repo: $REPO_URL"
echo "Ref: $VERSION_REF"

if [ "$MODE" = "install" ]; then
  if [ -e "$INSTALL_DIR" ]; then
    echo "Install directory already exists. Use --update for an existing Tethermark checkout: $INSTALL_DIR" >&2
    exit 2
  fi
  run mkdir -p "$(dirname "$INSTALL_DIR")"
  run git clone --filter=blob:none --no-checkout -- "$REPO_URL" "$INSTALL_DIR"
else
  if [ ! -d "$INSTALL_DIR/.git" ] || [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo "Update requires an existing Tethermark git checkout: $INSTALL_DIR" >&2
    exit 2
  fi
  if [ -n "$(git -C "$INSTALL_DIR" status --porcelain)" ]; then
    echo "Refusing to update a checkout with uncommitted or untracked files: $INSTALL_DIR" >&2
    exit 2
  fi
fi

run git -C "$INSTALL_DIR" fetch --depth 1 origin "$VERSION_REF"
run git -C "$INSTALL_DIR" checkout --detach --force FETCH_HEAD

if [ "$SKIP_ONBOARD" -eq 1 ]; then
  run node "$INSTALL_DIR/scripts/first-run.mjs" --no-onboard
else
  run node "$INSTALL_DIR/scripts/first-run.mjs"
fi

if [ "$DRY_RUN" -eq 0 ]; then
  COMMIT_SHA="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
  node "$INSTALL_DIR/scripts/write-install-marker.mjs" --install-dir "$INSTALL_DIR" --repo "$REPO_URL" --ref "$VERSION_REF" --commit "$COMMIT_SHA"
fi

echo "Done. Start Tethermark with:"
echo "  cd \"$INSTALL_DIR\" && npm run oss"
echo "Update this installation with:"
echo "  bash scripts/install.sh --update --prefix=\"$INSTALL_DIR\" --ref=\"$VERSION_REF\""
