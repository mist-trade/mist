#!/bin/bash
set -e

echo "Packaging release for selected platforms..."

mkdir -p release

# Build release platforms
./tools/build-executable.sh macos-amd64
./tools/build-executable.sh windows-x86

# Copy to release directory
cp dist/executables/mist-* release/

echo "✅ Release packaging complete"
ls -lh release/
