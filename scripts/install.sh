#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Read plugin ID from manifest.json
PLUGIN_ID=$(grep -o '"id": *"[^"]*"' "$REPO_ROOT/manifest.json" | cut -d'"' -f4)

# Default vault path (relative to repo root)
DEFAULT_VAULT="$REPO_ROOT/tst/TestVault"

VAULT_PATH="${1:-$DEFAULT_VAULT}"

# Expand ~ if present
VAULT_PATH="${VAULT_PATH/#\~/$HOME}"

PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"

echo "Installing plugin '$PLUGIN_ID' to: $PLUGIN_DIR"

# Create plugin directory
mkdir -p "$PLUGIN_DIR"

# Copy plugin files (overwrite if exists)
cp -f "$REPO_ROOT/main.js" "$PLUGIN_DIR/" 2>/dev/null || echo "Warning: main.js not found (run npm run build first)"
cp -f "$REPO_ROOT/manifest.json" "$PLUGIN_DIR/"
cp -f "$REPO_ROOT/styles.css" "$PLUGIN_DIR/" 2>/dev/null || true

$SCRIPT_DIR/reload.sh
