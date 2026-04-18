CREATE TABLE material_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  iso_id uuid REFERENCES iso_register(id),
  fn_pos text,
  fast_no text,
  iso_drawing text,
  sheet text,
  revision text,
  pos text,
  description text,
  size_nd text,
  qty_required numeric,
  unit text,
  material_spec text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE material_receivings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_item_id uuid REFERENCES material_items(id),
  received_date date,
  qty_received numeric,
  heat_no text,
  cert_no text,
  cert_url text,
  supplier text,
  delivery_note text,
  inspected bool DEFAULT false,
  inspection_date date,
  inspector text,
  status text DEFAULT 'pending',
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE packing_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  packing_list_no text,
  received_date date,
  supplier text,
  delivery_note text,
  status text DEFAULT 'pending',
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE packing_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  packing_list_id uuid REFERENCES packing_lists(id) ON DELETE CASCADE,
  material_item_id uuid REFERENCES material_items(id),
  description text,
  size_nd text,
  qty_received numeric,
  heat_no text,
  cert_no text,
  unit text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE material_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_receivings ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members access" ON material_items FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "members access" ON material_receivings FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "members access" ON packing_lists FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "members access" ON packing_list_items FOR ALL USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
