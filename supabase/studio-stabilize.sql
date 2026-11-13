-- Stabilized copies of a clip (lib/studioClips/stabilize.ts): one per strength,
-- made on the server with ffmpeg vidstab and stored next to the source.
--   stabilized: { "<low|medium|high>": { "status": "working"|"done"|"failed", "path": "<uid>/<project>/<clip>/stable-<strength>.mp4", "progress": 0..1, "error": null|text, "at": iso } }
alter table public.studio_clips add column if not exists stabilized jsonb;
