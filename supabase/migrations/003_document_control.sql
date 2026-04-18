-- Document Control Register — additional columns for documents table

ALTER TABLE documents ADD COLUMN IF NOT EXISTS serial_number int;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS discipline text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS discipline_code text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_purpose text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS revision_status text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transmittal_in text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transmittal_in_date date;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transmittal_out text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS transmittal_out_date date;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS revision_date date;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS internal_project_id text;
