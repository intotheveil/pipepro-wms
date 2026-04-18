-- Personnel Qualifications
CREATE TABLE IF NOT EXISTS personnel_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text,
  company text,
  cert_type text,
  cert_no text,
  cert_url text,
  issue_date date,
  expiry_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE personnel_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access" ON personnel_qualifications FOR ALL
USING (project_id IN (
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
));

-- Equipment Calibration
CREATE TABLE IF NOT EXISTS equipment_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  equipment_name text NOT NULL,
  equipment_id text,
  type text,
  manufacturer text,
  serial_no text,
  calibration_body text,
  cert_no text,
  cert_url text,
  last_calibration_date date,
  expiry_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE equipment_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access" ON equipment_calibration FOR ALL
USING (project_id IN (
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
));
