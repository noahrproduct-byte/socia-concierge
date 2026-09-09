# phone-agent

Text a Telegram bot from your phone -> a full Claude Code agent runs on this Mac -> it texts you back.

## Install (run on the Mac, once)

    bash ~/my-project/phone-agent/setup.sh

It checks python3, finds or installs the `claude` CLI, writes `config.json`,
and installs a launchd job so the bridge runs at login and restarts if it dies.

If you didn't have your chat id yet: text the bot anything, it replies with your id,
then put that id in `allowed_chat_ids` in `config.json` and run:

    launchctl kickstart -k gui/$UID/com.noah.phone-agent

## Using it

Just say what you want in plain language:

- "what's taking up space in my Downloads folder"
- "commit and push whatever's staged in ~/my-project"
- "screenshot my screen and tell me what's open"
- "find the invoice PDF from March and rename it properly"

Commands:

| | |
|---|---|
| `/new` | forget the conversation, start fresh |
| `/cd <path>` | change working directory |
| `/pwd` | show working directory |
| `/status` | health check |
| `/help` | command list |

The conversation has memory, so follow-ups like "now do the same for Documents" work.

## Operating notes

- **The Mac must be awake.** Sleeping laptop = no replies. `caffeinate -dims` in a
  Terminal window keeps it up, or set Settings > Lock Screen > "never" while on power.
- Long tasks: you'll see "typing..." until it's done. Hard cap is 15 min (`timeout_seconds`).
- Replies over ~3800 chars are split across messages.

## Security -- read this

This runs with `--permission-mode bypassPermissions`, meaning the agent executes
on your Mac without asking. That is what "run anything" costs. Concretely:

1. **The allowlist is the only lock.** Anyone who learns your bot's username can
   message it; only chat ids in `allowed_chat_ids` get through. Keep the username
   non-obvious and never share it.
2. **The token is a password.** `config.json` is chmod 600. If it leaks, revoke via
   BotFather `/revoke` immediately.
3. **Telegram is not end-to-end encrypted** for normal chats. Your commands and the
   agent's replies sit on Telegram's servers. Don't pipe secrets through it.
4. **Prompt injection is real.** If you ask it to read a web page or an email, hostile
   text in that content is being fed to an agent that can run commands on your Mac.

To dial the risk down, change `claude_flags` in `config.json` to
`["--permission-mode", "acceptEdits"]`, or set `workdir` to a single project folder
instead of your home directory.

## Troubleshooting

    tail -f ~/my-project/phone-agent/agent.log     # what the bridge is doing
    tail -f ~/my-project/phone-agent/stderr.log    # crashes
    launchctl print gui/$UID/com.noah.phone-agent  # is it running

No replies at all -> Mac asleep, or the job isn't loaded.
"Can't find the claude binary" -> fix `claude_bin` in `config.json` to the output of `which claude`.
Agent returns nothing -> run `claude` once interactively on the Mac and sign in.
