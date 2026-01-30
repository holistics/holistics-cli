#!/bin/bash

# Define the supported architectures for Bun
ARCHITECTURES=("linux-x64" "linux-arm64" "windows-x64" "darwin-x64" "darwin-arm64")

# Create release directory if it doesn't exist
mkdir -p release

# Compress Bun runtime with UPX before building
# This is a workaround for UPX not working directly on compiled binaries
# See: https://github.com/oven-sh/bun/issues/10051
echo "🗜️ Compressing Bun runtime with UPX..."
BUN_PATH=$(which bun)
if [ -n "$BUN_PATH" ]; then
  # Check if already compressed
  if upx -t "$BUN_PATH" 2>/dev/null; then
    echo "✅ Bun runtime is already compressed"
  else
    upx --best --lzma "$BUN_PATH" && echo "✅ Bun runtime compressed successfully" || echo "⚠️ Failed to compress Bun runtime, continuing anyway"
  fi
else
  echo "⚠️ Could not find Bun binary, skipping compression"
fi

echo "🚀 Building for multiple architectures..."

# Loop through each architecture and build
for arch in "${ARCHITECTURES[@]}"; do
  echo "📦 Building for $arch..."
  bun build src/index.ts --compile --outfile "release/holistics-$arch" --minify --target "bun-$arch"

  # Check if build was successful
  if [ $? -eq 0 ]; then
    echo "✅ Successfully built for $arch"
  else
    echo "❌ Failed to build for $arch"
    exit 1
  fi
done

echo "🎉 All builds completed successfully!"
ls -la release/
