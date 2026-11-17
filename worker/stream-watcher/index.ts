// SOCIA's stream watcher: the always-on part of Live streams (AI Clipper).
// Vercel stops every request after five minutes, so watching chat for hours
// runs here, on a small server (fly.toml). It:
//   - reads which channels people are watching (stream_watches) every 15 s;
//   - keeps one Twitch EventSub WebSocket per person and subscribes to each
//     watched channel's chat (channel.chat.message, the person's own token
//     with user:read:chat);
//   - feeds every message to that channel's spike detector
//     (lib/streams/spikes.ts) and, at a spike, runs the clip flow
//     (lib/streams/clipFlow.ts): Twitch clip, score, link, and the video
//     where Twitch allows it;
//   - writes what it saw (live or not, messages read, last chat) so the page
//     shows the truth, and checks in every 15 s (watcher_seen_at);
//   - stops a channel after 24 hours of watching.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWITCH_CLIENT_ID,
// TWITCH_CLIENT_SECRET. Run: npx tsx worker/stream-watcher/index.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SpikeDetector } from "../../lib/streams/spikes";
import { clipSpike, type ClipWatch } from "../../lib/streams/clipFlow";
import { clipDownloads, clipsById, createClip, liveStreams, TwitchError } from "../../lib/streams/twitch";
import { streamClipPath, twitchToken } from "../../lib/streams/server";

const STUDIO_BUCKET = "studio-sources";
const SYNC_MS = 15_000;
const LIVE_CHECK_MS = 60_000;
const MAX_WATCH_MS = 24 * 60 * 60 * 1000;
const EVENTSUB_WS = "wss://eventsub.wss.twitch.tv/ws";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
  console.error("[watcher] missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET");
  process.exit(1);
}
const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[watcher]", ...a);

type WatchRow = { id: string; user_id: string; workspace_id: string | null; channel_id: string; channel_login: string; status: string; can_download: boolean | null; clip_duration: number | string; started_at: string };

/** One channel being watched. */
type Channel = { watch: ClipWatch; detector: SpikeDetector; subscriptionId: string | null; seen: number; lastChatAt: number | null; flushed: number };

/** One person: their EventSub socket and their channels. */
class Person {
  channels = new Map<string, Channel>(); // by broadcaster id
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private closing = false;
  constructor(public userId: string) {}

  async token() { return twitchToken(db, this.userId); }

  /** Connect (or follow Twitch's reconnect URL) and resubscribe what's watched. */
  connect(to = EVENTSUB_WS) {
    const ws = new WebSocket(to);
    const old = this.ws;
    this.ws = ws;
    ws.onmessage = (ev) => void this.onMessage(ws, String(ev.data), old);
    ws.onclose = () => {
      if (this.ws !== ws || this.closing) return;
      this.sessionId = null;
      for (const c of this.channels.values()) c.subscriptionId = null;
      log(this.userId, "socket closed; reconnecting in 5 s");
      setTimeout(() => { if (!this.closing && this.channels.size) this.connect(); }, 5000);
    };
  }

  private async onMessage(ws: WebSocket, raw: string, previous: WebSocket | null) {
    let m: { metadata?: { message_type?: string }; payload?: { session?: { id?: string; reconnect_url?: string }; subscription?: { type?: string }; event?: { broadcaster_user_id?: string; chatter_user_id?: string; message?: { text?: string } } } };
    try { m = JSON.parse(raw); } catch { return; }
    const type = m.metadata?.message_type;
    if (type === "session_welcome") {
      this.sessionId = m.payload?.session?.id ?? null;
      if (previous && previous !== ws) { try { previous.close(); } catch { /* already closed */ } }
      // Twitch keeps subscriptions across a reconnect, but not across a fresh connection.
      if (!previous) for (const c of this.channels.values()) c.subscriptionId = null;
      await this.syncSubscriptions();
    } else if (type === "session_reconnect") {
      const next = m.payload?.session?.reconnect_url;
      if (next) this.connect(next);
    } else if (type === "notification" && m.payload?.subscription?.type === "channel.chat.message") {
      const e = m.payload.event;
      const c = e?.broadcaster_user_id ? this.channels.get(e.broadcaster_user_id) : undefined;
      if (!c || !e?.chatter_user_id) return;
      const now = Date.now();
      c.detector.push({ at: now, user: e.chatter_user_id, text: e.message?.text ?? "" });
      c.seen++;
      c.lastChatAt = now;
    } else if (type === "revocation") {
      log(this.userId, "Twitch revoked a subscription", raw.slice(0, 200));
    }
  }

  /** Subscribe every watched channel that has no subscription on this session. */
  async syncSubscriptions() {
    if (!this.sessionId) return;
    let auth: { token: string; twitchUserId: string };
    try { auth = await this.token(); } catch (e) { await this.failAll((e as Error).message); return; }
    for (const [bid, c] of this.channels) {
      if (c.subscriptionId) continue;
      const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
        method: "POST",
        headers: { "client-id": process.env.TWITCH_CLIENT_ID!, authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
        body: JSON.stringify({ type: "channel.chat.message", version: "1", condition: { broadcaster_user_id: bid, user_id: auth.twitchUserId }, transport: { method: "websocket", session_id: this.sessionId } }),
      });
      const j = (await res.json().catch(() => null)) as { data?: { id: string }[]; message?: string } | null;
      if (res.ok && j?.data?.[0]?.id) {
        c.subscriptionId = j.data[0].id;
        await updateWatch(c.watch.id, { last_error: null });
        log(this.userId, "reading chat on", c.watch.login);
      } else {
        await updateWatch(c.watch.id, { last_error: `Twitch didn't let SOCIA read this chat (${j?.message ?? res.status}).` });
      }
    }
  }

  async unsubscribe(c: Channel) {
    if (!c.subscriptionId) return;
    try {
      const { token } = await this.token();
      await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${encodeURIComponent(c.subscriptionId)}`, { method: "DELETE", headers: { "client-id": process.env.TWITCH_CLIENT_ID!, authorization: `Bearer ${token}` } });
    } catch { /* the subscription ends with the socket anyway */ }
  }

  async failAll(message: string) {
    for (const c of this.channels.values()) await updateWatch(c.watch.id, { last_error: message });
  }

  close() {
    this.closing = true;
    try { this.ws?.close(); } catch { /* closed */ }
  }

  /** Once a second: look for spikes and clip them. */
  tick(now: number) {
    for (const c of this.channels.values()) {
      const spike = c.detector.check(now);
      if (!spike) continue;
      log(this.userId, "spike on", c.watch.login, JSON.stringify(spike));
      void clipSpike(c.watch, spike, this.clipDeps(c)).catch((e) => log("clip flow failed", (e as Error).message));
    }
  }

  private clipDeps(c: Channel) {
    const call = async <T>(fn: (token: string, me: string) => Promise<T>) => { const a = await this.token(); return fn(a.token, a.twitchUserId); };
    return {
      now: () => Date.now(),
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
      createClip: (bid: string, dur: number) => call((t) => createClip(t, bid, dur)),
      clipsById: (ids: string[]) => call((t) => clipsById(t, ids)),
      clipDownloads: (bid: string, ids: string[]) => call((t, me) => clipDownloads(t, me, bid, ids)),
      saveVideo: async (from: string, rowId: string) => {
        const res = await fetch(from);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const path = streamClipPath(this.userId, rowId);
        const { error } = await db.storage.from(STUDIO_BUCKET).upload(path, Buffer.from(await res.arrayBuffer()), { contentType: "video/mp4", upsert: true });
        if (error) throw error;
        return path;
      },
      insertClip: async (row: Record<string, unknown>) => {
        const { data, error } = await db.from("stream_clips").insert(row).select("id").single();
        if (error) throw error;
        return (data as { id: string }).id;
      },
      updateClip: async (id: string, patch: Record<string, unknown>) => { await db.from("stream_clips").update(patch).eq("id", id).eq("user_id", this.userId); },
      updateWatch: (patch: Record<string, unknown>) => updateWatch(c.watch.id, patch),
      sustainAfter: (s: Parameters<SpikeDetector["sustainAfter"]>[0]) => c.detector.sustainAfter(s, Date.now()),
    };
  }
}

async function updateWatch(id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("stream_watches").update(patch).eq("id", id);
  if (error) log("watch update failed", id, error.message);
}

const people = new Map<string, Person>();
let lastLiveCheck = 0;

/** Match what's running to what people asked for. */
async function sync() {
  const { data, error } = await db.from("stream_watches").select("id, user_id, workspace_id, channel_id, channel_login, status, can_download, clip_duration, started_at").eq("status", "watching");
  if (error) { log("could not read watches:", error.message); return; }
  const rows = (data ?? []) as WatchRow[];
  const now = Date.now();
  // Bounded: a channel stops after a day; starting it again is one click.
  for (const r of rows.filter((r) => now - new Date(r.started_at).getTime() > MAX_WATCH_MS)) {
    await updateWatch(r.id, { status: "stopped", stopped_at: new Date().toISOString(), last_error: "Stopped after 24 hours. Start it again to keep watching." });
  }
  const live = rows.filter((r) => now - new Date(r.started_at).getTime() <= MAX_WATCH_MS);
  const byUser = new Map<string, WatchRow[]>();
  for (const r of live) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  // People who stopped everything.
  for (const [uid, p] of people) {
    if (byUser.has(uid)) continue;
    for (const c of p.channels.values()) await p.unsubscribe(c);
    p.close();
    people.delete(uid);
    log(uid, "nothing left to watch");
  }
  for (const [uid, ws] of byUser) {
    let p = people.get(uid);
    const fresh = !p;
    if (!p) { p = new Person(uid); people.set(uid, p); }
    const wanted = new Set(ws.map((w) => w.channel_id));
    for (const [bid, c] of p.channels) if (!wanted.has(bid)) { await p.unsubscribe(c); p.channels.delete(bid); log(uid, "stopped", c.watch.login); }
    for (const w of ws) {
      if (p.channels.has(w.channel_id)) continue;
      p.channels.set(w.channel_id, {
        watch: { id: w.id, userId: uid, workspaceId: w.workspace_id, channelId: w.channel_id, login: w.channel_login, duration: Number(w.clip_duration) || 30, canDownload: w.can_download },
        detector: new SpikeDetector(), subscriptionId: null, seen: 0, lastChatAt: null, flushed: 0,
      });
    }
    if (fresh) p.connect(); else await p.syncSubscriptions();
  }

  // Check in: what each channel's chat has done since last time, and whether it is live.
  const checkLive = now - lastLiveCheck >= LIVE_CHECK_MS;
  if (checkLive) lastLiveCheck = now;
  for (const p of people.values()) {
    let streams: Awaited<ReturnType<typeof liveStreams>> | null = null;
    if (checkLive) {
      try { const { token } = await p.token(); streams = await liveStreams(token, [...p.channels.keys()]); }
      catch (e) { if (e instanceof TwitchError && e.kind === "auth") await p.failAll(e.message); }
    }
    for (const [bid, c] of p.channels) {
      const patch: Record<string, unknown> = { watcher_seen_at: new Date().toISOString() };
      if (c.seen > c.flushed) {
        const { data: cur } = await db.from("stream_watches").select("messages_seen").eq("id", c.watch.id).maybeSingle();
        patch.messages_seen = ((cur as { messages_seen?: number } | null)?.messages_seen ?? 0) + (c.seen - c.flushed);
        c.flushed = c.seen;
      }
      if (c.lastChatAt) patch.last_chat_at = new Date(c.lastChatAt).toISOString();
      if (streams) {
        const s = streams.find((x) => x.user_id === bid);
        patch.live = Boolean(s);
        patch.stream_title = s?.title ?? null;
      }
      await updateWatch(c.watch.id, patch);
    }
  }
}

log("starting");
setInterval(() => { const now = Date.now(); for (const p of people.values()) p.tick(now); }, 1000);
const loop = async () => { try { await sync(); } catch (e) { log("sync failed:", (e as Error).message); } setTimeout(loop, SYNC_MS); };
void loop();
process.on("SIGTERM", () => { log("stopping"); for (const p of people.values()) p.close(); process.exit(0); });
