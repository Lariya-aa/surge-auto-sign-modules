#!/usr/bin/env bash
set -euo pipefail

LABEL="com.yara.autosign.local-module-server"

launchctl bootout "gui/$UID/$LABEL" >/dev/null 2>&1 || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Stopped $LABEL"
