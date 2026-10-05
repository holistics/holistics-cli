#!/bin/bash
#
# Build a dev binary of the Holistics CLI that embeds a LOCAL build of
# @holistics/cli-core (instead of downloading the published one from npm),
# so you can copy a single file to another machine (e.g. Windows) and test
# unreleased cli-core changes.
#
# Usage:
#   ./build-dev.sh [--core-dir <path>] [--target <t1,t2,...>] [--skip-core-build]
#
# Options:
#   --core-dir         holistics-core repo root or its packages/cli-core dir
#                      (default: $HOLISTICS_CORE_DIR, else ../holistics-core)
#   --target           comma-separated bun targets: windows-x64, linux-x64, linux-arm64,
#                      darwin-x64, darwin-arm64 (default: windows-x64)
#   --skip-core-build  reuse the existing cli-core dist/ instead of rebuilding it
#
# Output: release-dev/holistics-dev-<target>[.exe]
#
# On the target machine the binary extracts the embedded cli-core into the normal
# cache dir (%LOCALAPPDATA%\holistics on Windows, ~/.cache/holistics elsewhere)
# under a unique "<version>-dev.<timestamp>.<sha>" version, so every build is fresh
# and never collides with released versions.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

CORE_DIR="${HOLISTICS_CORE_DIR:-../holistics-core}"
TARGETS="windows-x64"
SKIP_CORE_BUILD=false

while [ $# -gt 0 ]; do
  case "$1" in
    --core-dir) CORE_DIR="$2"; shift 2 ;;
    --target) TARGETS="$2"; shift 2 ;;
    --skip-core-build) SKIP_CORE_BUILD=true; shift ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "❌ Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Accept either the holistics-core repo root or the cli-core package dir
if [ -f "$CORE_DIR/packages/cli-core/package.json" ]; then
  CORE_DIR="$CORE_DIR/packages/cli-core"
fi
if [ ! -f "$CORE_DIR/package.json" ] || ! grep -q '"name": "@holistics/cli-core"' "$CORE_DIR/package.json"; then
  echo "❌ $CORE_DIR is not the @holistics/cli-core package. Pass --core-dir or set HOLISTICS_CORE_DIR." >&2
  exit 1
fi
CORE_DIR="$(cd "$CORE_DIR" && pwd)"

# ── Toolchain checks ──
command -v bun > /dev/null || { echo "❌ bun is not installed" >&2; exit 1; }
command -v pnpm > /dev/null || { echo "❌ pnpm is not installed" >&2; exit 1; }
REQUIRED_BUN="$(tr -d '\n' < .bun-version)"
CURRENT_BUN="$(bun --version)"
if [ "$CURRENT_BUN" != "$REQUIRED_BUN" ]; then
  echo "⚠️  bun $CURRENT_BUN differs from .bun-version ($REQUIRED_BUN); release builds use $REQUIRED_BUN"
fi

CORE_SHA="$(git -C "$CORE_DIR" rev-parse --short HEAD)"
CORE_BRANCH="$(git -C "$CORE_DIR" rev-parse --abbrev-ref HEAD)"
CORE_DIRTY=""
if [ -n "$(git -C "$CORE_DIR" status --porcelain -- .)" ]; then
  CORE_DIRTY=".dirty"
fi
CORE_VERSION="$(node -p "require('$CORE_DIR/package.json').version")"
DEV_VERSION="${CORE_VERSION}-dev.$(date +%Y%m%d%H%M%S).${CORE_SHA}${CORE_DIRTY}"

echo "📍 cli-core: $CORE_DIR"
echo "   branch $CORE_BRANCH @ $CORE_SHA${CORE_DIRTY:+ (uncommitted changes)}"
echo "   dev version: $DEV_VERSION"

# ── Launcher dependencies ──
if [ ! -d node_modules ]; then
  echo "📦 Installing launcher dependencies..."
  bun install --no-save
  # the repo tracks package-lock.json only; don't leave a stray bun.lock behind
  git ls-files --error-unmatch bun.lock > /dev/null 2>&1 || rm -f bun.lock
fi

# ── Build & pack cli-core ──
if [ "$SKIP_CORE_BUILD" = false ]; then
  echo "🔨 Building cli-core..."
  # CIRCLECI=true makes bun_build.sh rewrite package.json, never do that locally
  (cd "$CORE_DIR" && env -u CIRCLECI pnpm build)
fi
if [ ! -f "$CORE_DIR/dist/commands.js" ]; then
  echo "❌ $CORE_DIR/dist/commands.js not found. Run without --skip-core-build." >&2
  exit 1
fi

echo "📦 Packing cli-core..."
rm -rf .dev-build
mkdir -p .dev-build/pack
(cd "$CORE_DIR" && pnpm pack --pack-destination "$SCRIPT_DIR/.dev-build/pack" > /dev/null)
TARBALL="$(ls .dev-build/pack/*.tgz | head -1)"
mv "$TARBALL" .dev-build/cli-core.tgz
rm -rf .dev-build/pack

# ── Compile ──
mkdir -p release-dev
IFS=',' read -ra TARGET_LIST <<< "$TARGETS"
OUTPUTS=()
for target in "${TARGET_LIST[@]}"; do
  outfile="release-dev/holistics-dev-$target"
  [[ "$target" == windows-* ]] && outfile="$outfile.exe"
  echo "🚀 Compiling $outfile..."
  bun build scripts/dev-entry.ts \
    --compile \
    --minify \
    --target "bun-$target" \
    --define "DEV_CLI_CORE_VERSION=\"$DEV_VERSION\"" \
    --outfile "$outfile"
  OUTPUTS+=("$outfile")
done

# ── Smoke test the binary for the host platform, if built ──
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) HOST_TARGET="linux-x64" ;;
  Linux-aarch64) HOST_TARGET="linux-arm64" ;;
  Darwin-x86_64) HOST_TARGET="darwin-x64" ;;
  Darwin-arm64) HOST_TARGET="darwin-arm64" ;;
  *) HOST_TARGET="" ;;
esac
if [ -n "$HOST_TARGET" ] && [ -f "release-dev/holistics-dev-$HOST_TARGET" ]; then
  echo "🧪 Smoke testing release-dev/holistics-dev-$HOST_TARGET..."
  # Isolated HOME so the extracted dev cli-core doesn't land in your real cache
  SMOKE_HOME="$(mktemp -d)"
  HOME="$SMOKE_HOME" "release-dev/holistics-dev-$HOST_TARGET" --version
  rm -rf "$SMOKE_HOME"
fi

echo ""
echo "🎉 Done:"
for out in "${OUTPUTS[@]}"; do
  ls -lh "$out" | awk '{print "   " $5 "  " $9}'
done
echo ""
echo "On Windows:"
echo "  1. Copy holistics-dev-windows-x64.exe to the PC (e.g. into a folder on PATH, or next to your AML repo)"
echo "  2. Run it like the normal CLI, e.g.:  .\\holistics-dev-windows-x64.exe aml validate"
echo "  3. Set HOLISTICS_DEV_BUILD_INFO=1 to print which embedded cli-core version is used"
echo "  Old dev versions pile up in %LOCALAPPDATA%\\holistics\\@holistics\\cli-core@*-dev.*; delete them anytime."
