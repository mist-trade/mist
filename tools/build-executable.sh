#!/bin/bash
set -euo pipefail

PLATFORM=$1
OUTPUT_DIR="dist/executables"
PKG_BIN="./node_modules/.bin/pkg"

mkdir -p "$OUTPUT_DIR"

if [ ! -x "$PKG_BIN" ]; then
  echo "pkg executable not found at $PKG_BIN. Run pnpm install first." >&2
  exit 1
fi

build_pkg() {
  local target=$1
  local output=$2

  echo "Building $output with pkg target $target"
  "$PKG_BIN" . --targets "$target" --no-bytecode --public --public-packages "*" --output "$output"

  if [ ! -f "$output" ]; then
    echo "Expected executable was not created: $output" >&2
    exit 1
  fi

  ls -lh "$output"
}

case $PLATFORM in
  linux-amd64)
    build_pkg node18-linux-x64 "$OUTPUT_DIR/mist-linux-amd64"
    ;;
  macos-amd64)
    build_pkg node18-macos-x64 "$OUTPUT_DIR/mist-macos-amd64"
    ;;
  macos-arm64)
    build_pkg node18-macos-arm64 "$OUTPUT_DIR/mist-macos-arm64"
    ;;
  windows-x86)
    build_pkg node18-win-x64 "$OUTPUT_DIR/mist-windows-x86.exe"
    ;;
  *)
    echo "Unknown platform: $PLATFORM"
    echo "Supported: linux-amd64, macos-amd64, macos-arm64, windows-x86"
    exit 1
    ;;
esac

echo "✅ Build complete for $PLATFORM"
