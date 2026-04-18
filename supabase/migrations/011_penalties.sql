CREATE TABLE weld_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repair_weld_id uuid NOT NULL REFERENCES weld_log(id),
  original_weld_id uuid NOT NULL REFERENCES weld_log(id),
  penalty_weld_ids uuid[],
  penalty_count int NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE weld_penalties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members access" ON weld_penalties FOR ALL
USING (project_id IN (
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
));
