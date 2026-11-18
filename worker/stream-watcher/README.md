# Stream watcher

The always-on part of **AI Clipper → Live streams**. Vercel stops every request
after five minutes, so reading Twitch chat for hours runs here. It reads which
channels people watch from `stream_watches`, keeps a Twitch EventSub chat
connection per person, finds chat spikes (`lib/streams/spikes.ts`) and clips
them with Twitch's Create Clip (`lib/streams/clipFlow.ts`).

## One-time setup (Noah)

1. **Twitch app** at https://dev.twitch.tv/console/apps → Register Your Application.
   - OAuth Redirect URL: `https://sociaos.com/api/auth/twitch/callback`
     (add `http://localhost:3000/api/auth/twitch/callback` for local testing).
   - Category: Application Integration. Client type: Confidential.
   - Put `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in Vercel (Production) and in the watcher's secrets below.
2. **Database**: run `supabase/stream-clipper.sql`, then `supabase/stream-plans.sql`, in the Supabase SQL editor.
3. **Watcher on Fly.io** (about $5 a month for one small machine):
   ```bash
   fly launch --no-deploy --copy-config --config worker/stream-watcher/fly.toml
   fly secrets set --config worker/stream-watcher/fly.toml NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… TWITCH_CLIENT_ID=… TWITCH_CLIENT_SECRET=…
   fly deploy --config worker/stream-watcher/fly.toml
   fly scale count 1 --config worker/stream-watcher/fly.toml
   ```
   Exactly one machine: two would clip the same moment twice.

## Run it locally

```bash
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… TWITCH_CLIENT_ID=… TWITCH_CLIENT_SECRET=… npx tsx worker/stream-watcher/index.ts
```

## What Twitch allows (checked 2026-11-16)

- Reading chat: any public channel, with the person's own token (`user:read:chat`).
- Create Clip: any live channel with clips on (`clips:edit`). Twitch captures
  about 85 s before the call and 5 s after and publishes the last 30 s, so the
  clip starts about 20 s before chat reacted.
- Clip video download: only the broadcaster and their editors
  (`editor:manage:clips`). Other channels' clips stay on Twitch: SOCIA lists
  them with Twitch's player and edit link.
