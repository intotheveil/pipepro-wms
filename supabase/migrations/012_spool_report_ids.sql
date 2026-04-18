ALTER TABLE spools ADD COLUMN IF NOT EXISTS mat_check_report text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS fab_started_report text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS fabricated_report text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS qc_released_report text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS paint_report text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS painted_report text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS laydown_report text;
ALTER TABLE spools ADD COLUMN IF NOT EXISTS erected_report text;
