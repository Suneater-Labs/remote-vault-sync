#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
VAULT_PATH="${1:-$REPO_ROOT/tst/TestVault}"
SIZE="${2:-5G}"

# Expand ~ if present
VAULT_PATH="${VAULT_PATH/#\~/$HOME}"

OUTPUT_FILE="$VAULT_PATH/test-video-${SIZE}.mp4"

echo "Creating ${SIZE} test video at: $OUTPUT_FILE"

# Check if ffmpeg is available
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg is required but not installed"
    echo "Install with: pacman -S ffmpeg"
    exit 1
fi

# Generate video with specified size limit
ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=30 \
    -f lavfi -i sine=frequency=1000:sample_rate=48000 \
    -c:v libx264 -preset ultrafast -crf 18 \
    -c:a aac -b:a 192k \
    -fs "$SIZE" \
    -y "$OUTPUT_FILE"

echo "✓ Created ${SIZE} test video: $(basename "$OUTPUT_FILE")"
ls -lh "$OUTPUT_FILE"
