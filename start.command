#!/bin/bash
# ponytail: double-click launcher, no login-item auto-start. Ctrl+C or close
# the Terminal window to stop the relay when done playing.
cd "$(dirname "$0")/relay" || exit 1

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

echo "=================================================="
echo " Gyro Steering Relay"
echo " On your phone, visit: http://${IP}:8765/"
echo " (Keep the Evofox controller connected, then open"
echo "  xbox.com/play in Chrome with the extension on.)"
echo "=================================================="
echo

node server.js
