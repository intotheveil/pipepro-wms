ALTER TABLE spools ADD COLUMN IF NOT EXISTS ndt_vt text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS ndt_mtpt text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS ndt_rtut text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS ndt_pwht text;
ALTER TABLE iso_register ADD COLUMN IF NOT EXISTS drawing_file_url text;
