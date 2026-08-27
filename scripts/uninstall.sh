#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${TETHERMARK_INSTALL_DIR:-$HOME/.tethermark/tethermark}"
BACKUP_ROOT="${TETHERMARK_UNINSTALL_BACKUP_DIR:-}"
DRY_RUN=0
CONFIRMED=0
PURGE_DATA=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes) CONFIRMED=1 ;;
    --purge-data) PURGE_DATA=1 ;;
    --prefix=*) INSTALL_DIR="${arg#--prefix=}" ;;
    --backup-dir=*) BACKUP_ROOT="${arg#--backup-dir=}" ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Missing required command: node" >&2
  exit 1
fi

INSTALL_DIR="$(node -e 'console.log(require("node:path").resolve(process.argv[1]))' "$INSTALL_DIR")"
if [ -z "$BACKUP_ROOT" ]; then
  BACKUP_ROOT="$(dirname "$INSTALL_DIR")/uninstall-backups"
fi
BACKUP_ROOT="$(node -e 'console.log(require("node:path").resolve(process.argv[1]))' "$BACKUP_ROOT")"
if [ "$INSTALL_DIR" = "/" ] || [ "$INSTALL_DIR" = "$HOME" ] || [ "$INSTALL_DIR" = "$BACKUP_ROOT" ]; then
  echo "Refusing unsafe uninstall target: $INSTALL_DIR" >&2
  exit 2
fi
if [ ! -d "$INSTALL_DIR" ]; then
  echo "Tethermark install directory does not exist: $INSTALL_DIR"
  exit 0
fi
if ! node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const root = process.argv[1];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (pkg.name !== "tethermark") process.exit(1);
    const markerPath = path.join(root, ".tethermark-install.json");
    if (fs.existsSync(markerPath)) {
      const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
      if (marker.schema_version !== "2026-08-27.install-marker.v1" || !/^[0-9a-f]{40}$/i.test(marker.commit_sha || "")) process.exit(1);
    } else if (!fs.existsSync(path.join(root, ".git"))) process.exit(1);
  } catch { process.exit(1); }
' "$INSTALL_DIR"; then
  echo "Refusing to remove a directory that is not a verified Tethermark installation: $INSTALL_DIR" >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/tethermark-$STAMP"
PRESERVED=(.env .env.local .artifacts .tethermark)

echo "Tethermark uninstall"
echo "Install dir: $INSTALL_DIR"
if [ "$PURGE_DATA" -eq 1 ]; then
  echo "Local configuration, audit data, and managed worker files inside the checkout will be deleted."
else
  echo "Local configuration and data will be preserved under: $BACKUP_DIR"
fi
echo "User-scoped static tools outside the checkout are not removed."

if [ "$DRY_RUN" -eq 0 ] && [ "$CONFIRMED" -eq 0 ]; then
  echo "No changes made. Re-run with --yes after reviewing this target." >&2
  exit 2
fi

if [ "$DRY_RUN" -eq 1 ]; then
  if [ "$PURGE_DATA" -eq 0 ]; then
    echo "+ mkdir -p \"$BACKUP_DIR\""
    for name in "${PRESERVED[@]}"; do
      if [ -e "$INSTALL_DIR/$name" ]; then
        echo "+ mv \"$INSTALL_DIR/$name\" \"$BACKUP_DIR/$name\""
      fi
    done
  fi
  echo "+ rm -rf -- \"$INSTALL_DIR\""
  echo "Uninstall dry run complete; nothing was removed."
  exit 0
fi

if [ "$PURGE_DATA" -eq 0 ]; then
  mkdir -p "$BACKUP_DIR"
  for name in "${PRESERVED[@]}"; do
    if [ -e "$INSTALL_DIR/$name" ]; then
      mv "$INSTALL_DIR/$name" "$BACKUP_DIR/$name"
    fi
  done
fi

rm -rf -- "$INSTALL_DIR"
echo "Removed Tethermark application checkout: $INSTALL_DIR"
if [ "$PURGE_DATA" -eq 0 ]; then
  echo "Preserved local state: $BACKUP_DIR"
fi
