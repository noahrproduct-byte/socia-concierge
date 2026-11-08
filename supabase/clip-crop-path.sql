-- The shots of a clip (lib/clipper/reframe.ts): what the vertical frame shows and
-- when, as [{ "t": seconds, "c": 0..1, "y": 0..1, "s": scale }]. Null means the
-- crop stays at crop_x. Run after own-clipper.sql. Safe to re-run.
alter table public.clips add column if not exists crop_path jsonb null;
