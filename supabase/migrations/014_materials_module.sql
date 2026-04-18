-- 014 — Materials Management module (replaces old 005 material_items / receivings)
-- Tables: materials_catalogue, materials_bom, materials_deliveries,
--         materials_delivery_items, materials_allocations
-- Also adds priority_rank and workfront_ready to iso_register.

-- ============================================================
-- iso_register additions
-- ============================================================
ALTER TABLE iso_register ADD COLUMN IF NOT EXISTS priority_rank integer DEFAULT NULL;
ALTER TABLE iso_register ADD COLUMN IF NOT EXISTS workfront_ready boolean DEFAULT false;

-- ============================================================
-- 1. materials_catalogue  (must exist before materials_bom FK)
-- ============================================================
CREATE TABLE materials_catalogue (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  part_no                 text NOT NULL,
  description             text,
  spec                    text,
  nd                      text,
  category                text,
  qty_ordered             numeric,
  qty_received_mto        numeric,
  unit_of_measure         text,
  weight_kg               numeric,
  unit_price_eur          numeric,
  origin                  text,
  mill                    text,
  delivery_time           text,
  long_code               text,
  long_code_system_token  text,
  raw                     jsonb,
  imported_at             timestamptz DEFAULT now(),
  imported_from           text,
  UNIQUE (project_id, part_no)
);

-- ============================================================
-- 2. materials_bom
-- ============================================================
CREATE TABLE materials_bom (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  iso_id            uuid REFERENCES iso_register(id) ON DELETE SET NULL,
  fn_text           text,
  pos               integer NOT NULL,
  revision          text NOT NULL DEFAULT 'R0',
  is_current        boolean NOT NULL DEFAULT true,
  description       text,
  nd                text,
  qty_raw           text,
  qty_num           numeric,
  qty_unit          text,
  system            text,
  system_code       text,
  sheet             text,
  catalogue_id      uuid REFERENCES materials_catalogue(id) ON DELETE SET NULL,
  match_confidence  numeric,
  imported_at       timestamptz DEFAULT now(),
  imported_from     text,
  UNIQUE (project_id, iso_id, pos, revision)
);

-- ============================================================
-- 3. materials_deliveries
-- ============================================================
CREATE TABLE materials_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  po_no           text NOT NULL,
  amendment        text,
  noi_no          text,
  delivery_date   date,
  supplier        text,
  status          text DEFAULT 'received',
  notes           text,
  raw             jsonb,
  imported_at     timestamptz DEFAULT now(),
  imported_from   text,
  UNIQUE (project_id, po_no, amendment, noi_no)
);

-- ============================================================
-- 4. materials_delivery_items
-- ============================================================
CREATE TABLE materials_delivery_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           uuid NOT NULL REFERENCES materials_deliveries(id) ON DELETE CASCADE,
  catalogue_id          uuid REFERENCES materials_catalogue(id) ON DELETE SET NULL,
  item_code             text,
  description           text,
  qty                   numeric,
  weight_total_kg       numeric,
  sscc                  text,
  pick_number           text,
  heat_number           text,
  manufacturer_origin   text,
  raw                   jsonb
);

-- ============================================================
-- 5. materials_allocations
-- ============================================================
CREATE TABLE materials_allocations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bom_id            uuid NOT NULL REFERENCES materials_bom(id) ON DELETE CASCADE,
  delivery_item_id  uuid NOT NULL REFERENCES materials_delivery_items(id) ON DELETE CASCADE,
  qty_allocated     numeric NOT NULL,
  allocated_at      timestamptz DEFAULT now(),
  allocated_by      uuid,
  method            text DEFAULT 'auto',
  run_id            uuid
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_bom_project_iso_current
  ON materials_bom (project_id, iso_id) WHERE is_current = true;

CREATE INDEX idx_bom_project_catalogue_current
  ON materials_bom (project_id, catalogue_id) WHERE is_current = true;

CREATE INDEX idx_bom_project_current_confidence
  ON materials_bom (project_id, is_current, match_confidence);

CREATE INDEX idx_catalogue_project_partno
  ON materials_catalogue (project_id, part_no);

CREATE INDEX idx_catalogue_project_system_token
  ON materials_catalogue (project_id, long_code_system_token);

CREATE INDEX idx_delivery_items_delivery
  ON materials_delivery_items (delivery_id);

CREATE INDEX idx_delivery_items_catalogue
  ON materials_delivery_items (catalogue_id);

CREATE INDEX idx_allocations_project_bom
  ON materials_allocations (project_id, bom_id);

CREATE INDEX idx_allocations_project_delivery_item
  ON materials_allocations (project_id, delivery_item_id);

CREATE INDEX idx_allocations_run
  ON materials_allocations (run_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE materials_catalogue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access" ON materials_catalogue FOR ALL
USING (project_id IN (
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
));

ALTER TABLE materials_bom ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access" ON materials_bom FOR ALL
USING (project_id IN (
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
));

ALTER TABLE materials_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access" ON materials_deliveries FOR ALL
USING (project_id IN (
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
));

ALTER TABLE materials_delivery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access" ON materials_delivery_items FOR ALL
USING (delivery_id IN (
  SELECT d.id FROM materials_deliveries d
  JOIN project_members pm ON pm.project_id = d.project_id
  WHERE pm.user_id = auth.uid()
));

ALTER TABLE materials_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access" ON materials_allocations FOR ALL
USING (project_id IN (
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
));
