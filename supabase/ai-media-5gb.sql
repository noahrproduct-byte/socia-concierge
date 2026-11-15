-- Raise the Clipper's source upload cap from 2 GB to 5 GB (2026-11-14). The project's global
-- "Upload file size limit" (Dashboard > Storage > Settings) must be at least 5 GB as well.
update storage.buckets set file_size_limit = 5242880000 where id = 'ai-media';
