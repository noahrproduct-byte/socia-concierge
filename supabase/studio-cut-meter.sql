-- SOCIA's video cuts count once, when they are handed over (lib/studioClips/cutMeter.ts).
-- 1. studio_builds.cut_counted_at marks a cut that has counted as one
--    AI-made video (meter video_builds). Set by the server only.
-- 2. studio_builds is server only, like the token tables
--    (security-hardening.sql section 11): the browser gets no access, not
--    even to its own rows, so a cut can't be read, copied into the person's
--    own edit or relabelled around the routes that count it. SOCIA's server
--    reaches the table with the service role (lib/supabase/privateTables.ts),
--    always filtered by the owner.
-- Deploy the code first: before it, the server read this table with the
-- person's session. Run after supabase/studio.sql. Safe to re-run.

alter table public.studio_builds add column if not exists cut_counted_at timestamptz;

-- Cuts already exported were counted by their export: mark them, so opening
-- them again doesn't count a second time.
update public.studio_builds
   set cut_counted_at = coalesce(rendered_at, updated_at)
 where cut_counted_at is null
   and render_path is not null
   and opportunity_idx >= -999
   and opportunity_idx <> -1;

revoke all on public.studio_builds from anon, authenticated;
grant all on public.studio_builds to service_role;
