# SOCIA reel bot

Send an Instagram Reel link (or a downloaded video) to your Telegram bot, with a
prompt if you want one. A Claude Code session on this Mac studies the reel, remakes
it in Remotion, and sends the new version back. Reply **post** and it publishes to
Instagram (through SOCIA) and TikTok (through your Chrome, as @socia57586).

The playbook it follows is `.claude/skills/reel-remake/SKILL.md`. It uses Claude
Code's official Telegram channel (`telegram@claude-plugins-official`), which is a
research preview.

## One-time setup

1. In Telegram, message **@BotFather**, send `/newbot`, pick a name and a username
   ending in `bot`, and copy the token.
2. Save the token in Terminal (it never goes into a chat):

   ```bash
   mkdir -p ~/.claude/channels/telegram && read -s "t?Paste bot token: " && printf 'TELEGRAM_BOT_TOKEN=%s\n' "$t" > ~/.claude/channels/telegram/.env && chmod 600 ~/.claude/channels/telegram/.env && unset t && echo saved
   ```

3. Connect SOCIA's Instagram to a SOCIA workspace, then reconnect the SOCIA
   connector in Claude so the bot can see it.
4. Start the bot (keep the window open):

   ```bash
   sh /Users/noah/my-project/demo-video/reel-bot/start.sh
   ```

5. Pair your Telegram account: DM the bot anything, and it replies with a code. In
   the Claude window, type `/telegram:access pair <code>`, then
   `/telegram:access policy allowlist`. From then on only you can talk to it.

## Day to day

- Run `start.sh`, then leave the Mac on, Terminal open and Chrome open on the SOCIA
  profile (for TikTok).
- Anything outside `settings.json` asks for approval: Allow and Deny buttons appear
  in Telegram and in the Terminal window.
- Downloaded references go to `demo-video/refs/` (git-ignored). Builds go to
  `demo-video/src/<slug>/`, renders to `demo-video/out/`.

## Keep it on

`keep-on.sh` keeps the bot running in the background: it starts at login and restarts
whenever the bot stops. It waits while a bot you started by hand is still running, so
it never takes over mid-job. Install it once (macOS asks nothing; undo with the second
command):

```bash
cp /Users/noah/my-project/demo-video/reel-bot/com.socia.reel-bot.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.socia.reel-bot.plist
```

```bash
launchctl unload ~/Library/LaunchAgents/com.socia.reel-bot.plist && rm ~/Library/LaunchAgents/com.socia.reel-bot.plist
```

Watch it or type into it with `tmux attach -t socia-reel-bot` (leave with Ctrl+B, then D).
The log is `keep-on.log`. It still needs the Mac awake (lid open, or clamshell mode).

## Two reels a day

While the background bot runs, `keep-on.sh` starts a new reel at 08:00 and 14:00
(`SLOTS` in the script; each is ready about an hour later). The bot picks a true
SOCIA feature and a fresh format from `daily-ideas.md`, avoiding what's in
`daily-log.md`, builds it, and sends it on Telegram. Nothing posts until you reply
**post**; any other reply is treated as changes. If the Mac was asleep at a slot, the
reel starts when it wakes, up to 5 hours late.
