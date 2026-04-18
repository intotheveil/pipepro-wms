-- Remove duplicate supports from re-imports, keeping the latest
DELETE FROM supports_list a
USING supports_list b
WHERE a.project_id = b.project_id
  AND a.support_mark = b.support_mark
  AND a.created_at < b.created_at;

-- Add unique constraint to prevent future duplicates on re-import
ALTER TABLE supports_list
ADD CONSTRAINT supports_list_project_mark_unique
UNIQUE (project_id, support_mark);

-- NOTE: Before re-importing, clear existing bad data:
-- DELETE FROM supports_list
-- WHERE project_id = (SELECT id FROM projects WHERE code = 'KD-0025');
