-- 016 — Materialized availability views for the Materials page

-- ISO-level availability (one row per ISO that has BOM rows)
-- NULL-qty positions are counted in total but excluded from availability denominators
DROP VIEW IF EXISTS materials_iso_availability;

CREATE VIEW materials_iso_availability AS
WITH bom_per_scope AS (
  SELECT
    b.project_id, b.iso_id, b.scope,
    COUNT(*) AS total_positions,
    COUNT(*) FILTER (WHERE b.qty_num IS NOT NULL) AS total_with_qty,
    COUNT(*) FILTER (WHERE b.qty_num IS NULL) AS null_qty_count,
    COUNT(*) FILTER (
      WHERE b.qty_num IS NOT NULL
        AND b.catalogue_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM materials_catalogue c
          WHERE c.id = b.catalogue_id AND c.qty_ordered >= b.qty_num
        )
    ) AS procured_count,
    COUNT(*) FILTER (
      WHERE b.qty_num IS NOT NULL
        AND b.catalogue_id IS NOT NULL
        AND (
          SELECT COALESCE(SUM(di.qty), 0)
          FROM materials_delivery_items di
          WHERE di.catalogue_id = b.catalogue_id
        ) >= b.qty_num
    ) AS delivered_count,
    COUNT(*) FILTER (
      WHERE b.qty_num IS NOT NULL
        AND (
          SELECT COALESCE(SUM(a.qty_allocated), 0)
          FROM materials_allocations a
          WHERE a.bom_id = b.id
        ) >= b.qty_num
    ) AS allocated_count
  FROM materials_bom b
  WHERE b.is_current = true AND b.iso_id IS NOT NULL
  GROUP BY b.project_id, b.iso_id, b.scope
)
SELECT
  ir.id AS iso_id,
  ir.project_id,
  ir.fast_no,
  ir.drawing_no,
  ir.system,
  COALESCE(fab.total_positions, 0) AS fab_total,
  COALESCE(fab.total_with_qty, 0) AS fab_total_with_qty,
  COALESCE(fab.null_qty_count, 0) AS fab_null_qty,
  COALESCE(fab.procured_count, 0) AS fab_procured,
  COALESCE(fab.delivered_count, 0) AS fab_delivered,
  COALESCE(fab.allocated_count, 0) AS fab_allocated,
  COALESCE(erect.total_positions, 0) AS erect_total,
  COALESCE(erect.total_with_qty, 0) AS erect_total_with_qty,
  COALESCE(erect.null_qty_count, 0) AS erect_null_qty,
  COALESCE(erect.procured_count, 0) AS erect_procured,
  COALESCE(erect.delivered_count, 0) AS erect_delivered,
  COALESCE(erect.allocated_count, 0) AS erect_allocated
FROM iso_register ir
LEFT JOIN bom_per_scope fab ON fab.iso_id = ir.id AND fab.scope = 'fab'
LEFT JOIN bom_per_scope erect ON erect.iso_id = ir.id AND erect.scope = 'erection'
WHERE (fab.total_positions IS NOT NULL OR erect.total_positions IS NOT NULL);

-- Catalogue-level availability (one row per catalogue item with delivery/allocation totals)
CREATE OR REPLACE VIEW materials_catalogue_availability AS
SELECT
  c.*,
  COALESCE((SELECT SUM(di.qty) FROM materials_delivery_items di WHERE di.catalogue_id = c.id), 0) AS qty_delivered,
  COALESCE((SELECT SUM(a.qty_allocated) FROM materials_allocations a
            JOIN materials_bom b ON b.id = a.bom_id
            WHERE b.catalogue_id = c.id), 0) AS qty_allocated,
  GREATEST(
    COALESCE((SELECT SUM(di.qty) FROM materials_delivery_items di WHERE di.catalogue_id = c.id), 0)
    - COALESCE((SELECT SUM(a.qty_allocated) FROM materials_allocations a
                JOIN materials_bom b ON b.id = a.bom_id
                WHERE b.catalogue_id = c.id), 0),
    0
  ) AS qty_available
FROM materials_catalogue c;
