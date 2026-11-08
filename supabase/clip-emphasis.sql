-- The words the Clipper colours in a clip's captions (lib/clipper/emphasis.ts),
-- as a JSON list. Null on older clips, which colour only numbers. Run this
-- BEFORE the code that writes it goes live. Safe to re-run.
alter table public.clips add column if not exists emphasis jsonb null;

select count(*) as emphasis_column from information_schema.columns
where table_schema = 'public' and table_name = 'clips' and column_name = 'emphasis';
