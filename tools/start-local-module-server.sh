#!/usr/bin/env bash
set -euo pipefail

LABEL="com.yara.autosign.local-module-server"
ROOT="/Users/yara/Developer/Proxy/modules"
NODE="/opt/homebrew/bin/node"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_OUT="/tmp/autosign-local-module-server.out.log"
LOG_ERR="/tmp/autosign-local-module-server.err.log"

if [[ ! -x "$NODE" ]]; then
  NODE="$(command -v node)"
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/tools/local-module-server.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_OUT</string>
  <key>StandardErrorPath</key>
  <string>$LOG_ERR</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$UID/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID" "$PLIST"
launchctl kickstart -k "gui/$UID/$LABEL"

echo "Started $LABEL"
echo "Module index: http://127.0.0.1:8787/"
echo "Logs:"
echo "  $LOG_OUT"
echo "  $LOG_ERR"
