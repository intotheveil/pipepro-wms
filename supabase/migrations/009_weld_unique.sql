-- Add unique constraint for weld_log upsert on re-import
-- NOTE: Run this AFTER clearing duplicate data:
--   DELETE FROM weld_log a USING weld_log b
--   WHERE a.project_id = b.project_id AND a.weld_id = b.weld_id
--   AND a.created_at < b.created_at;

ALTER TABLE weld_log
ADD CONSTRAINT weld_log_project_weld_unique
UNIQUE (project_id, weld_id);
