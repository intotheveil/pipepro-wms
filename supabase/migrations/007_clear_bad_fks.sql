-- Clear orphaned FK references from imports that didn't resolve iso_id / spool_id
UPDATE weld_log SET iso_id = NULL, spool_id = NULL
  WHERE project_id = (SELECT id FROM projects WHERE code = 'KD-0025');
UPDATE spools SET iso_id = NULL
  WHERE project_id = (SELECT id FROM projects WHERE code = 'KD-0025');
UPDATE supports_list SET iso_id = NULL
  WHERE project_id = (SELECT id FROM projects WHERE code = 'KD-0025');
