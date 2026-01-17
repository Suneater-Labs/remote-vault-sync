#!/usr/bin/env bash
set -euo pipefail

# Kill all Obsidian instances (OS-specific)
if [[ "$OSTYPE" == "darwin"* ]]; then
    pkill -x "Obsidian" 2>/dev/null || true
else
    # Linux: kill electron process running obsidian
    pkill -f "/usr/lib/obsidian" 2>/dev/null || pkill -f "obsidian" 2>/dev/null || true
fi

# Wait a moment for clean shutdown
sleep 0.5

# Reopen Obsidian (OS-specific)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a "Obsidian"
elif command -v obsidian &> /dev/null; then
    obsidian &>/dev/null &
    disown
else
    echo "Please manually restart Obsidian to reload the plugin"
fi
