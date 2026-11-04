#!/bin/zsh
# Keeps the SOCIA reel bot on. launchd (~/Library/LaunchAgents/com.socia.reel-bot.plist)
# runs this at login, and again whenever it exits.
#
# - While a bot you started by hand still holds the Telegram link, this waits, so it
#   never takes the bot over in the middle of a job.
# - Otherwise it starts the bot in a detached tmux session (claude needs a terminal).
#   Each start resumes the bot's own conversation, so jobs and context carry over.
#   Watch it or type into it:  tmux attach -t socia-reel-bot   (leave: Ctrl+B, then D)
# - It keeps access on "allowlist": "disabled" silences the bot, even for Noah.
# - Twice a day it types a "DAILY REEL" line into the bot, which makes a new reel and
#   sends it to Noah for approval (reel-remake skill, "Daily reels").
T=/opt/homebrew/bin/tmux
S=socia-reel-bot
CONV=c1463db3-8c6d-4f3d-bef4-33241b6fe90a
DIR=$HOME/.claude/channels/telegram
# When each daily reel starts being made (24 h clock); it's ready about an hour later.
SLOTS=(0800 1400)
NAMES=(AM PM)
STAMP=/Users/noah/my-project/demo-video/reel-bot/.daily-sent
# While this file exists no DAILY REEL line is sent (Noah paused them 2026-11-02: the SOCIA
# Calendar is scheduled straight from SOCIA now). Delete it to turn the daily reels back on.
PAUSE=/Users/noah/my-project/demo-video/reel-bot/.daily-paused

holder_alive() { [ -f $DIR/bot.pid ] && kill -0 "$(cat $DIR/bot.pid)" 2>/dev/null }

# Once a day per slot, at or after its time and up to 5 hours late (the Mac may have
# been asleep), and only once the bot has been up long enough to take typing.
daily_triggers() {
  local today=$(date +%F) now=$(date +%H%M) i
  local up=$(( $(date +%s) - $($T display -p -t $S '#{session_created}' 2>/dev/null || date +%s) ))
  [ -f $PAUSE ] && return
  (( up < 90 )) && return
  # A signed-out claude answers every line with "Not logged in"; hold the slot until it can work.
  $T capture-pane -p -t $S | tail -5 | grep -q "Not logged in" && return
  for i in {1..${#SLOTS}}; do
    if (( 10#$now >= 10#${SLOTS[i]} && 10#$now < 10#${SLOTS[i]} + 500 )) && ! grep -qx "$today ${NAMES[i]}" $STAMP 2>/dev/null; then
      $T send-keys -t $S -l "DAILY REEL ${NAMES[i]} $today: handle today's ${NAMES[i]} calendar posts now, following the Daily reels section of the reel-remake skill."
      sleep 1
      $T send-keys -t $S Enter
      echo "$today ${NAMES[i]}" >> $STAMP
      echo "$(date '+%F %T') sent DAILY REEL ${NAMES[i]}"
    fi
  done
}

/usr/bin/python3 - "$DIR/access.json" <<'EOF'
import json, sys
p = sys.argv[1]
try:
    d = json.load(open(p))
except Exception:
    sys.exit(0)
if d.get("allowFrom") and d.get("dmPolicy") != "allowlist":
    d["dmPolicy"] = "allowlist"
    json.dump(d, open(p, "w"), indent=2)
EOF

if ! $T has-session -t $S 2>/dev/null; then
  while holder_alive; do sleep 30; done
  $T new-session -d -s $S -x 110 -y 45 \
    "sh /Users/noah/my-project/demo-video/reel-bot/start.sh --resume $CONV --permission-mode auto"
fi
while $T has-session -t $S 2>/dev/null; do
  daily_triggers
  sleep 30
done
