-- A ranking clip (lib/clipper/ranking.ts): what is being ranked and its moments
-- in playing order, as { "title": text, "items": [{ "rank", "label", "startMs",
-- "endMs", "reason" }] }. Null on every other clip. Safe to re-run.
alter table public.clips add column if not exists ranking jsonb null;

select count(*) as ranking_column from information_schema.columns
where table_schema = 'public' and table_name = 'clips' and column_name = 'ranking';
