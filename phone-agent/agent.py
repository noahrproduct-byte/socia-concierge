#!/usr/bin/env python3
"""
phone-agent: Telegram <-> Claude Code bridge.

Text your bot from your phone; it runs a full Claude Code agent on this Mac
and texts the answer back. One conversation per Telegram chat, with memory.
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
CONF = BASE / "config.json"
LOG = BASE / "agent.log"
OFFSET_FILE = BASE / ".offset"
SESS_FILE = BASE / ".sessions.json"

MAX_MSG = 3800


def log(msg):
    line = "%s  %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line, flush=True)
    try:
        with LOG.open("a") as f:
            f.write(line + "\n")
    except Exception:
        pass


if not CONF.exists():
    log("FATAL: config.json not found next to agent.py")
    sys.exit(1)

cfg = json.loads(CONF.read_text())
TOKEN = cfg.get("bot_token", "").strip()
ALLOWED = set(int(x) for x in cfg.get("allowed_chat_ids", []))
WORKDIR = os.path.expanduser(cfg.get("workdir", "~"))
CLAUDE = os.path.expanduser(cfg.get("claude_bin", "claude"))
TIMEOUT = int(cfg.get("timeout_seconds", 900))
EXTRA_FLAGS = cfg.get("claude_flags", ["--permission-mode", "bypassPermissions"])
API = "https://api.telegram.org/bot%s" % TOKEN

if not TOKEN:
    log("FATAL: bot_token is empty in config.json")
    sys.exit(1)


# ---------- Telegram ----------

def tg(method, timeout=70, **params):
    payload = {k: v for k, v in params.items() if v is not None}
    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request("%s/%s" % (API, method), data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        log("HTTP %s on %s: %s" % (e.code, method, e.read()[:400]))
    except Exception as e:
        log("net error on %s: %s" % (method, e))
    return None


def chunks(text, n=MAX_MSG):
    out = []
    while text:
        if len(text) <= n:
            out.append(text)
            break
        cut = text.rfind("\n", 0, n)
        if cut < n // 2:
            cut = n
        out.append(text[:cut])
        text = text[cut:].lstrip("\n")
    return out


def send(chat_id, text):
    if not text.strip():
        text = "(no output)"
    for part in chunks(text):
        tg("sendMessage", chat_id=chat_id, text=part, disable_web_page_preview="true")


class Typing:
    """Keeps the 'typing...' indicator alive while a long job runs."""

    def __init__(self, chat_id):
        self.chat_id = chat_id
        self._stop = threading.Event()
        self._t = None

    def __enter__(self):
        def loop():
            while not self._stop.is_set():
                tg("sendChatAction", timeout=15, chat_id=self.chat_id, action="typing")
                self._stop.wait(5)

        self._t = threading.Thread(target=loop, daemon=True)
        self._t.start()
        return self

    def __exit__(self, *a):
        self._stop.set()


# ---------- session memory ----------

def reload_config():
    """Re-read config.json each poll so edits take effect without a restart."""
    global ALLOWED, CLAUDE, TIMEOUT, EXTRA_FLAGS, cfg
    try:
        new = json.loads(CONF.read_text())
    except Exception:
        return
    if new == cfg:
        return
    before = sorted(ALLOWED)
    cfg = new
    ALLOWED = set(int(x) for x in cfg.get("allowed_chat_ids", []))
    CLAUDE = os.path.expanduser(cfg.get("claude_bin", "claude"))
    TIMEOUT = int(cfg.get("timeout_seconds", 900))
    EXTRA_FLAGS = cfg.get("claude_flags", ["--permission-mode", "bypassPermissions"])
    log("config reloaded; allowed %s -> %s" % (before, sorted(ALLOWED)))


def load_sessions():
    try:
        return json.loads(SESS_FILE.read_text())
    except Exception:
        return {}


def save_sessions(s):
    try:
        SESS_FILE.write_text(json.dumps(s))
    except Exception:
        pass


sessions = load_sessions()


# ---------- the agent ----------

def run_claude(chat_id, prompt):
    cmd = [CLAUDE, "-p", "--output-format", "json"] + list(EXTRA_FLAGS)
    sid = sessions.get(str(chat_id))
    if sid:
        cmd += ["--resume", sid]

    log("run (chat %s, cwd %s): %s" % (chat_id, WORKDIR, prompt[:120].replace("\n", " ")))
    try:
        p = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            cwd=WORKDIR,
            env=os.environ.copy(),
        )
    except subprocess.TimeoutExpired:
        return "Timed out after %ds. Send /new to start a fresh session." % TIMEOUT
    except FileNotFoundError:
        return "Can't find the claude binary at %r. Fix claude_bin in config.json." % CLAUDE

    raw = (p.stdout or "").strip()
    if not raw:
        err = (p.stderr or "").strip()
        # A stale/expired session id is the usual cause -- drop it and retry once.
        if sid:
            sessions.pop(str(chat_id), None)
            save_sessions(sessions)
            log("empty output with session %s; retrying fresh" % sid)
            return run_claude(chat_id, prompt)
        return "Agent returned nothing.\n\n%s" % (err[:1500] or "(no stderr)")

    try:
        data = json.loads(raw)
    except Exception:
        return raw[:MAX_MSG * 3]

    if isinstance(data, list):
        data = data[-1] if data else {}

    new_sid = data.get("session_id")
    if new_sid:
        sessions[str(chat_id)] = new_sid
        save_sessions(sessions)

    result = data.get("result") or data.get("error") or json.dumps(data)[:2000]
    if data.get("is_error"):
        result = "Error: %s" % result
    return result


# ---------- command handling ----------

HELP = (
    "I'm running on your Mac. Just describe what you want and I'll do it.\n\n"
    "/new - forget the conversation, start fresh\n"
    "/cd <path> - change my working directory\n"
    "/pwd - show working directory\n"
    "/status - health check\n"
    "/help - this message"
)


def handle(chat_id, text):
    global WORKDIR
    t = text.strip()

    if t in ("/start", "/help"):
        return HELP

    if t == "/new":
        sessions.pop(str(chat_id), None)
        save_sessions(sessions)
        return "Fresh session. What do you need?"

    if t == "/pwd":
        return WORKDIR

    if t == "/status":
        ok = os.path.exists(CLAUDE) or subprocess.run(
            ["which", CLAUDE], capture_output=True
        ).returncode == 0
        return "up\nworkdir: %s\nclaude: %s (%s)\nsession: %s" % (
            WORKDIR,
            CLAUDE,
            "found" if ok else "MISSING",
            sessions.get(str(chat_id), "none"),
        )

    if t.startswith("/cd "):
        p = os.path.expanduser(t[4:].strip())
        if os.path.isdir(p):
            WORKDIR = p
            return "workdir -> %s" % p
        return "Not a directory: %s" % p

    with Typing(chat_id):
        return run_claude(chat_id, t)


# ---------- main loop ----------

def main():
    try:
        offset = int(OFFSET_FILE.read_text().strip())
    except Exception:
        offset = 0

    me = tg("getMe")
    who = me["result"]["username"] if me and me.get("ok") else "?"
    log("phone-agent up as @%s | workdir=%s | allowed=%s" % (who, WORKDIR, sorted(ALLOWED) or "SETUP MODE"))

    while True:
        reload_config()
        res = tg("getUpdates", offset=offset, timeout=50, allowed_updates=json.dumps(["message"]))
        if not res or not res.get("ok"):
            time.sleep(3)
            continue

        for upd in res["result"]:
            offset = upd["update_id"] + 1
            try:
                OFFSET_FILE.write_text(str(offset))
            except Exception:
                pass

            msg = upd.get("message") or {}
            chat_id = (msg.get("chat") or {}).get("id")
            text = msg.get("text")
            if chat_id is None:
                continue

            if not text:
                send(chat_id, "I only handle text right now.")
                continue

            # Bootstrap: no allowlist configured yet -> report the id, run nothing.
            if not ALLOWED:
                send(chat_id, "SETUP MODE. Your chat id is: %s\nAdd it to allowed_chat_ids in config.json and restart me." % chat_id)
                log("setup mode ping from %s" % chat_id)
                continue

            if chat_id not in ALLOWED:
                log("DENIED chat %s: %s" % (chat_id, text[:80]))
                send(chat_id, "Not authorized.")
                continue

            try:
                send(chat_id, handle(chat_id, text))
            except Exception as e:
                log("handler crash: %r" % e)
                send(chat_id, "Something broke: %r" % e)


if __name__ == "__main__":
    while True:
        try:
            main()
        except KeyboardInterrupt:
            sys.exit(0)
        except Exception as e:
            log("main loop crash, restarting in 5s: %r" % e)
            time.sleep(5)
