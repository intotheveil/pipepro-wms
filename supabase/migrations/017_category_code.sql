-- 017 — Add category_code to BOM and catalogue for fingerprint matching

ALTER TABLE materials_bom ADD COLUMN IF NOT EXISTS category_code text;
ALTER TABLE materials_catalogue ADD COLUMN IF NOT EXISTS category_code text;

CREATE INDEX IF NOT EXISTS idx_bom_category_nd
  ON materials_bom (project_id, category_code, nd) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_catalogue_category_nd
  ON materials_catalogue (project_id, category_code, nd);
