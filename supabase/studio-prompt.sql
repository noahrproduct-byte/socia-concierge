-- Content Studio: videos cut from a written brief ("Prompt" mode). A prompt
-- build is a studio_builds row whose opportunity_idx is negative (-1, -2, ...
-- per project) and whose brief is kept in `prompt`, so the builder, export,
-- draft and regenerate paths work unchanged. Re-run safe. Run after deploy.

alter table public.studio_builds
  add column if not exists prompt text;

comment on column public.studio_builds.prompt is
  'The written brief this build was cut from (Prompt mode); null for builds made from a Content Yield post';
