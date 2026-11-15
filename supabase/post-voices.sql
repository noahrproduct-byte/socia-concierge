-- The voice an animated video's voiceover was read in, kept on the post it was
-- saved to, so SOCIA can compare how videos in each voice went on to perform
-- (lib/animated/voicePick.ts) and pick the voice from the account's own
-- results. Both columns are null for a post without a voiceover. Run in the
-- Supabase SQL editor after platform-deletions.sql. Idempotent.

alter table public.scheduled_posts
  add column if not exists voice_id text check (voice_id is null or char_length(voice_id) between 1 and 64),
  add column if not exists voice_name text check (voice_name is null or char_length(voice_name) between 1 and 60);

create index if not exists scheduled_posts_voice_idx
  on public.scheduled_posts (user_id, created_at desc) where voice_id is not null;
