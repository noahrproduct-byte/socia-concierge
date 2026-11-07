-- The path the vertical frame follows in a clip (lib/clipper/reframe.ts): where
-- it should be and when, as [{ "t": seconds, "x": 0..1 }]. Null means the crop
-- stays at crop_x. Run after own-clipper.sql. Safe to re-run.
alter table public.clips add column if not exists crop_path jsonb null;
