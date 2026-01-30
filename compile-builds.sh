#!/bin/bash

# Define the supported architectures for Bun
ARCHITECTURES=("linux-x64" "linux-arm64" "windows-x64" "darwin-x64" "darwin-arm64")

# Create release directory if it doesn't exist
mkdir -p release

echo "🚀 Building for multiple architectures..."

# Loop through each architecture and build
for arch in "${ARCHITECTURES[@]}"; do
  echo "📦 Building for $arch..."
  bun build src/index.ts --compile --outfile "release/holistics-$arch" --minify --treeshake --target "bun-$arch"

  # Check if build was successful
  if [ $? -eq 0 ]; then
    echo "✅ Successfully built for $arch"
  else
    echo "❌ Failed to build for $arch"
    exit 1
  fi
done

echo "🗜️ Compressing binaries with UPX..."

# Compress each binary with UPX (skip Windows .exe for now as UPX may have issues)
for arch in "${ARCHITECTURES[@]}"; do
  binary="release/holistics-$arch"

  # Windows binaries have .exe extension
  if [[ "$arch" == windows-* ]]; then
    binary="${binary}.exe"
  fi

  if [ -f "$binary" ]; then
    echo "🗜️ Compressing $binary..."
    upx --best --lzma "$binary" || echo "⚠️ UPX compression failed for $binary (may not be supported for this platform)"
  fi
done

echo "🎉 All builds completed successfully!"
ls -la release/
