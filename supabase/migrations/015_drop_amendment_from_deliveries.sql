-- 015 — Drop amendment column from materials_deliveries

ALTER TABLE materials_deliveries
  DROP CONSTRAINT materials_deliveries_project_id_po_no_amendment_noi_no_key;

ALTER TABLE materials_deliveries
  DROP COLUMN amendment;

ALTER TABLE materials_deliveries
  ADD CONSTRAINT materials_deliveries_project_id_po_no_noi_no_key
  UNIQUE (project_id, po_no, noi_no);
