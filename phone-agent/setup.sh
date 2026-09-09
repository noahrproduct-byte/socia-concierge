#!/bin/bash
# phone-agent setup -- run this on your Mac:  bash ~/my-project/phone-agent/setup.sh
set -u
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LABEL="com.noah.phone-agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
cd "$DIR"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }

say "1/5  Checking python3"
command -v python3 >/dev/null || { echo "python3 missing. Run: xcode-select --install"; exit 1; }
python3 -V

say "2/5  Locating the claude CLI"
CLAUDE="$(command -v claude || true)"
for c in /opt/homebrew/bin/claude /usr/local/bin/claude "$HOME/.local/bin/claude" "$HOME/.claude/local/claude"; do
  [ -z "$CLAUDE" ] && [ -x "$c" ] && CLAUDE="$c"
done
if [ -z "$CLAUDE" ]; then
  echo "Claude Code isn't installed."
  read -r -p "Install it now with npm? [y/N] " a
  if [[ "$a" =~ ^[Yy]$ ]]; then
    command -v npm >/dev/null || { echo "npm missing. Install Node first: brew install node"; exit 1; }
    npm install -g @anthropic-ai/claude-code || exit 1
    CLAUDE="$(command -v claude || true)"
  fi
fi
[ -n "$CLAUDE" ] || { echo "Still no claude binary. Install it, then re-run."; exit 1; }
echo "found: $CLAUDE"
"$CLAUDE" --version || true
echo
echo "NOTE: if you've never logged in, run '$CLAUDE' once interactively and sign in."

say "3/5  Config"
if [ -f config.json ]; then
  echo "config.json exists -- keeping your token, repairing paths."
  python3 - "$CLAUDE" "$HOME" <<'PY'
import json, sys
c = json.load(open("config.json"))
c["claude_bin"] = sys.argv[1]
if c.get("workdir", "~") == "~":
    c["workdir"] = sys.argv[2]
json.dump(c, open("config.json", "w"), indent=2)
print("  claude_bin ->", c["claude_bin"])
print("  workdir    ->", c["workdir"])
PY
  chmod 600 config.json
  if python3 -c "import json,sys; sys.exit(0 if json.load(open('config.json'))['allowed_chat_ids'] else 1)"; then
    :
  else
    echo
    echo "  NOTE: allowed_chat_ids is empty -- the bot starts in SETUP MODE."
    echo "  Text your bot anything; it will reply with your chat id."
  fi
else
  read -r -p "Paste your BotFather token: " TOKEN
  read -r -p "Your Telegram chat id (press enter to discover it later): " CHATID
  IDS="[]"; [ -n "${CHATID:-}" ] && IDS="[$CHATID]"
  cat > config.json <<JSON
{
  "bot_token": "$TOKEN",
  "allowed_chat_ids": $IDS,
  "workdir": "$HOME",
  "claude_bin": "$CLAUDE",
  "timeout_seconds": 900,
  "claude_flags": ["--permission-mode", "bypassPermissions"]
}
JSON
  chmod 600 config.json
  echo "wrote config.json (chmod 600)"
fi

say "4/5  Installing the background service"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$DIR/agent.py</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$DIR/stdout.log</string>
  <key>StandardErrorPath</key><string>$DIR/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
</dict>
</plist>
PLISTEOF
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"
sleep 2

say "5/5  Status"
launchctl print "gui/$UID/$LABEL" 2>/dev/null | grep -E "state|pid" | head -3 || echo "(not reporting yet)"
echo
tail -n 12 agent.log 2>/dev/null || echo "(no log yet -- give it a few seconds)"
echo
echo "Done. Text your bot on Telegram."
echo "Logs:    tail -f $DIR/agent.log"
echo "Restart: launchctl kickstart -k gui/$UID/$LABEL"
echo "Stop:    launchctl bootout gui/$UID/$LABEL"
