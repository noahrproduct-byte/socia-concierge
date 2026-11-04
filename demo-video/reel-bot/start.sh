#!/bin/sh
# Starts the SOCIA reel bot: a Claude Code session that listens to Noah's Telegram
# bot, remakes the reels he sends (playbook: .claude/skills/reel-remake/SKILL.md)
# and posts them to Instagram and TikTok only when he replies "post".
# Keep this Terminal window open; caffeinate stops the Mac sleeping while it runs.
# Permission rules for the bot are in reel-bot/settings.json; anything else asks
# for approval in Telegram (Allow / Deny buttons) and in this window.
# The Telegram plugin is switched on only here (enabledPlugins in settings.json):
# one bot token serves one session, and a newer session takes the bot over.
#
# Usage: sh start.sh                  start fresh
#        sh start.sh --resume <id>    pick a stopped bot conversation back up
#                                     (restart rather than /mcp reconnect: a
#                                     reconnected link stops delivering messages)
cd /Users/noah/my-project || exit 1
prompt="You are the SOCIA reel bot. Load the reel-remake skill, then wait for Noah's Telegram messages and follow it for each one."
[ "$1" = "--resume" ] && prompt="You were restarted to fix the Telegram link, so Noah's latest Telegram messages may not have reached you. Load the reel-remake skill again, tell Noah on Telegram where the current job stands, and carry on."
exec caffeinate -i claude "$@" \
  --channels plugin:telegram@claude-plugins-official \
  --chrome \
  --settings demo-video/reel-bot/settings.json \
  "$prompt"
