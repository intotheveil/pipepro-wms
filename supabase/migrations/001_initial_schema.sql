-- PipePro WMS — Initial Schema Migration
-- Source: PIPEPRO_SCHEMA.txt
-- Tables in dependency order; RLS enabled at the end.

-- ============================================================
-- 1. projects  (anchor — no project_id)
-- ============================================================
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  client      text,
  contractor  text,
  logo_url    text,
  active_tier text NOT NULL DEFAULT 'starter'
              CHECK (active_tier IN ('starter', 'pro', 'enterprise')),
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 2. project_members
-- ============================================================
CREATE TABLE project_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid,
  role       text NOT NULL CHECK (role IN ('admin', 'qc', 'viewer', 'field')),
  username   text,
  pin        text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 3. subcontractors
-- ============================================================
CREATE TABLE subcontractors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  code       text,
  scope      text CHECK (scope IN ('fabrication', 'erection', 'ndt', 'painting', 'all')),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 4. wps_list  (needed by weld_log)
-- ============================================================
CREATE TABLE wps_list (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wps_no          text NOT NULL,
  process         text CHECK (process IN ('GTAW', 'SMAW', 'FCAW', 'SAW')),
  p_numbers       text,
  thickness_range text,
  position        text,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- 5. welders  (needed by weld_log, supports_list)
-- ============================================================
CREATE TABLE welders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subcon_id         uuid REFERENCES subcontractors(id),
  name              text NOT NULL,
  stamp             text,
  qualified_wps     text[],
  qualification_exp date,
  active            bool DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

-- ============================================================
-- 6. testpacks  (needed by iso_register, flange_joints)
-- ============================================================
CREATE TABLE testpacks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  testpack_no         text NOT NULL,
  system              text,
  sub_system          text,
  fluid               text,
  test_medium         text CHECK (test_medium IN ('Water', 'Air', 'Nitrogen', 'Service')),
  test_pressure_bar   numeric,
  design_pressure_bar numeric,
  line_check_done     bool DEFAULT false,
  line_check_date     date,
  line_checker_id     uuid REFERENCES project_members(id),
  blinding_done       bool DEFAULT false,
  blinding_date       date,
  test_date           date,
  test_result         text CHECK (test_result IN ('PENDING', 'PASS', 'FAIL')),
  reinstatement_done  bool DEFAULT false,
  reinstatement_date  date,
  punch_list_clear    bool DEFAULT false,
  status              text DEFAULT 'draft'
                      CHECK (status IN ('draft', 'line_check', 'blinding', 'testing', 'reinstatement', 'complete')),
  certificate_url     text,
  created_at          timestamptz DEFAULT now()
);

-- ============================================================
-- 7. iso_register
-- ============================================================
CREATE TABLE iso_register (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fast_no      text,
  drawing_no   text,
  revision     text,
  sheet        text,
  fluid_code   text,
  piping_class text,
  material     text,
  size_nps     text,
  ped_category text,
  system       text,
  area         text,
  testpack_id  uuid REFERENCES testpacks(id),
  status       text DEFAULT 'NOT_STARTED'
               CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ON_HOLD')),
  hold_reason  text,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- 8. spools
-- ============================================================
CREATE TABLE spools (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  iso_id              uuid REFERENCES iso_register(id),
  spool_no            text NOT NULL,
  shop_field          text CHECK (shop_field IN ('shop', 'field')),
  subcon_id           uuid REFERENCES subcontractors(id),
  material_checked    bool,
  material_check_date date,
  fab_started         bool,
  fab_start_date      date,
  fabricated          bool,
  fabricated_date     date,
  qc_released         bool,
  qc_release_date     date,
  sent_to_paint       bool,
  sent_to_paint_date  date,
  painted             bool,
  painted_date        date,
  at_laydown          bool,
  laydown_date        date,
  erected             bool,
  erected_date        date,
  barcode             text,
  location_lat        numeric,
  location_lng        numeric,
  location_updated_at timestamptz,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- ============================================================
-- 9. weld_log
-- ============================================================
CREATE TABLE weld_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  iso_id        uuid REFERENCES iso_register(id),
  spool_id      uuid REFERENCES spools(id),
  weld_id       text,
  joint_type    text CHECK (joint_type IN ('BW', 'SW', 'FW', 'socket')),
  shop_field    text,
  size_nps      text,
  dia_inch      numeric,
  thickness     numeric,
  material_1    text,
  material_2    text,
  wps_id        uuid REFERENCES wps_list(id),
  welder_id     uuid REFERENCES welders(id),
  fit_up_date   date,
  fit_up_by     uuid REFERENCES welders(id),
  weld_date     date,
  welded        bool,
  visual_ok     bool,
  visual_date   date,
  pwht_required bool,
  pwht_done     bool,
  pwht_date     date,
  status        text DEFAULT 'not_started'
                CHECK (status IN ('not_started', 'fit_up', 'welded', 'ndt_pending', 'accepted', 'rejected', 'repaired')),
  reject_count  int DEFAULT 0,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

-- ============================================================
-- 10. ndt_batches  (needed by ndt_register)
-- ============================================================
CREATE TABLE ndt_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_no    text NOT NULL,
  method      text,
  subcon_id   uuid REFERENCES subcontractors(id),
  issued_date date,
  status      text DEFAULT 'open'
              CHECK (status IN ('open', 'submitted', 'closed')),
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- 11. ndt_register
-- ============================================================
CREATE TABLE ndt_register (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  weld_id          uuid REFERENCES weld_log(id),
  method           text CHECK (method IN ('RT', 'UT', 'PT', 'MT', 'VT')),
  extent_pct       numeric,
  batch_id         uuid REFERENCES ndt_batches(id),
  requested_date   date,
  examined_date    date,
  subcon_id        uuid REFERENCES subcontractors(id),
  technician       text,
  report_no        text,
  result           text DEFAULT 'PENDING'
                   CHECK (result IN ('PENDING', 'ACCEPTED', 'REJECTED', 'REPAIRED')),
  defect_code      text,
  repair_weld_id   uuid REFERENCES weld_log(id),
  film_url         text,
  client_witnessed bool DEFAULT false,
  client_result    text,
  created_at       timestamptz DEFAULT now()
);

-- ============================================================
-- 12. ndt_matrix
-- ============================================================
CREATE TABLE ndt_matrix (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  piping_class  text,
  service_class text,
  weld_type     text,
  method        text,
  extent_pct    numeric,
  ped_category  text,
  created_at    timestamptz DEFAULT now()
);

-- ============================================================
-- 13. supports_list
-- ============================================================
CREATE TABLE supports_list (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  iso_id         uuid REFERENCES iso_register(id),
  support_mark   text,
  eidos          text,
  shop_field     text,
  qty            int,
  weight_kg      numeric,
  subcon_id      uuid REFERENCES subcontractors(id),
  welder_id      uuid REFERENCES welders(id),
  fitup_date     date,
  weld_date      date,
  status         text DEFAULT 'not_started'
                 CHECK (status IN ('not_started', 'fitup', 'welded', 'inspected', 'painted', 'complete')),
  paint_date     date,
  installed_date date,
  is_field       bool DEFAULT false,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- ============================================================
-- 14. flange_joints
-- ============================================================
CREATE TABLE flange_joints (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  iso_id               uuid REFERENCES iso_register(id),
  spool_id             uuid REFERENCES spools(id),
  testpack_id          uuid REFERENCES testpacks(id),
  joint_id             text,
  size_nps             text,
  rating               text CHECK (rating IN ('150', '300', '600', '900', '1500', '2500')),
  flange_material      text,
  gasket_type          text CHECK (gasket_type IN ('RF', 'RTJ', 'FF', 'SWG')),
  gasket_material      text,
  bolt_spec            text,
  bolt_qty             int,
  bolt_size            text,
  fluid                text,
  system               text,
  target_torque_dry_nm numeric,
  target_torque_lub_nm numeric,
  lubricant            text,
  assembler_id         uuid REFERENCES project_members(id),
  inspector_id         uuid REFERENCES project_members(id),
  assembly_date        date,
  status               text DEFAULT 'pending'
                       CHECK (status IN ('pending', 'assembled', 'torqued', 'inspected', 'reinstated')),
  reinstated           bool DEFAULT false,
  reinstatement_date   date,
  shop_field           text,
  comments             text,
  created_at           timestamptz DEFAULT now()
);

-- ============================================================
-- 15. flange_torque_steps  (cascades via flange_joint_id)
-- ============================================================
CREATE TABLE flange_torque_steps (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flange_joint_id        uuid NOT NULL REFERENCES flange_joints(id) ON DELETE CASCADE,
  step_pct               int CHECK (step_pct IN (30, 50, 75, 100)),
  actual_torque_nm       numeric,
  torque_wrench_id       text,
  torque_wrench_cert_exp date,
  recorded_by            uuid REFERENCES project_members(id),
  recorded_at            timestamptz,
  created_at             timestamptz DEFAULT now()
);

-- ============================================================
-- 16. punch_items
-- ============================================================
CREATE TABLE punch_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  punch_no                 text,
  category                 text CHECK (category IN ('A', 'B')),
  discipline               text CHECK (discipline IN ('piping', 'structural', 'instruments', 'electrical', 'civil')),
  raised_by_role           text CHECK (raised_by_role IN ('contractor_internal', 'client', 'third_party', 'notified_body')),
  raised_by                uuid REFERENCES project_members(id),
  raised_date              date,
  description              text,
  iso_id                   uuid REFERENCES iso_register(id),
  spool_id                 uuid REFERENCES spools(id),
  weld_id                  uuid REFERENCES weld_log(id),
  support_id               uuid REFERENCES supports_list(id),
  flange_joint_id          uuid REFERENCES flange_joints(id),
  testpack_id              uuid REFERENCES testpacks(id),
  assigned_to              uuid REFERENCES project_members(id),
  target_close_date        date,
  action_taken             text,
  actioned_date            date,
  actioned_by              uuid REFERENCES project_members(id),
  closeout_evidence        text[],
  submitted_for_close_date date,
  closed_by                uuid REFERENCES project_members(id),
  closed_date              date,
  status                   text DEFAULT 'open'
                           CHECK (status IN ('open', 'actioned', 'submitted_for_close', 'closed', 'rejected_close')),
  rejection_reason         text,
  handover_package_id      uuid, -- FK added after handover_packages exists
  created_at               timestamptz DEFAULT now()
);

-- ============================================================
-- 17. rfi_records
-- ============================================================
CREATE TABLE rfi_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rfi_no            text,
  title             text,
  inspection_type   text CHECK (inspection_type IN (
                      'fit_up', 'visual_weld', 'nde_witness', 'support_install',
                      'flange_assembly', 'pressure_test', 'walkdown', 'final_inspection')),
  discipline        text,
  requested_date    date,
  requested_time    text,
  location          text,
  raised_by         uuid REFERENCES project_members(id),
  raised_date       date,
  issued_date       timestamptz,
  acknowledged_date timestamptz,
  inspected_date    date,
  inspector_name    text,
  result            text DEFAULT 'PENDING'
                    CHECK (result IN ('PENDING', 'ACCEPTED', 'CONDITIONALLY_ACCEPTED', 'REJECTED')),
  conditions        text,
  status            text DEFAULT 'draft'
                    CHECK (status IN ('draft', 'issued', 'acknowledged', 'inspected', 'closed', 'cancelled')),
  pdf_url           text,
  email_thread_id   text,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

-- ============================================================
-- 18. rfi_tags
-- ============================================================
CREATE TABLE rfi_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rfi_id     uuid NOT NULL REFERENCES rfi_records(id),
  tag_type   text CHECK (tag_type IN ('iso', 'spool', 'weld', 'support', 'flange_joint', 'testpack')),
  tag_id     uuid,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 19. document_categories
-- ============================================================
CREATE TABLE document_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  parent_id  uuid REFERENCES document_categories(id),
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 20. documents
-- ============================================================
CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES document_categories(id),
  title        text,
  doc_no       text,
  revision     text,
  file_url     text,
  file_type    text,
  file_size_kb int,
  iso_id       uuid REFERENCES iso_register(id),
  weld_id      uuid REFERENCES weld_log(id),
  support_id   uuid REFERENCES supports_list(id),
  testpack_id  uuid REFERENCES testpacks(id),
  uploaded_by  uuid,
  uploaded_at  timestamptz,
  tags         text[],
  status       text DEFAULT 'active'
               CHECK (status IN ('active', 'superseded', 'voided')),
  notes        text,
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- 21. qc_form_templates
-- ============================================================
CREATE TABLE qc_form_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code       text NOT NULL,
  title      text,
  applies_to text CHECK (applies_to IN ('spool', 'weld', 'support', 'testpack', 'iso', 'flange_joint')),
  fields     jsonb,
  active     bool DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 22. qc_records
-- ============================================================
CREATE TABLE qc_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES qc_form_templates(id),
  iso_id          uuid REFERENCES iso_register(id),
  spool_id        uuid REFERENCES spools(id),
  weld_id         uuid REFERENCES weld_log(id),
  support_id      uuid REFERENCES supports_list(id),
  testpack_id     uuid REFERENCES testpacks(id),
  flange_joint_id uuid REFERENCES flange_joints(id),
  data            jsonb,
  status          text DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_by    uuid,
  submitted_at    timestamptz,
  approved_by     uuid,
  approved_at     timestamptz,
  signature_url   text,
  attachments     text[],
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- 23. milestones
-- ============================================================
CREATE TABLE milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code          text,
  name          text NOT NULL,
  category      text CHECK (category IN ('fabrication', 'erection', 'ndt', 'testpack', 'handover')),
  planned_date  date,
  forecast_date date,
  actual_date   date,
  linked_metric text,
  target_value  numeric,
  source        text CHECK (source IN ('manual', 'primavera', 'msproject')),
  import_id     text,
  created_at    timestamptz DEFAULT now()
);

-- ============================================================
-- 24. progress_snapshots
-- ============================================================
CREATE TABLE progress_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date   date NOT NULL,
  module          text CHECK (module IN ('welding', 'ndt', 'fabrication', 'erection', 'supports', 'testpacks')),
  total           int,
  complete        int,
  dia_inch_total  numeric,
  dia_inch_done   numeric,
  weight_total_kg numeric,
  weight_done_kg  numeric,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- 25. import_logs
-- ============================================================
CREATE TABLE import_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  imported_at   timestamptz,
  imported_by   uuid,
  file_name     text,
  import_type   text CHECK (import_type IN ('iso_register', 'weld_log', 'supports', 'ndt', 'schedule', 'material')),
  rows_imported int,
  rows_skipped  int,
  errors        jsonb,
  status        text DEFAULT 'success'
                CHECK (status IN ('success', 'partial', 'failed')),
  created_at    timestamptz DEFAULT now()
);

-- ============================================================
-- 26. handover_packages
-- ============================================================
CREATE TABLE handover_packages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_no           text NOT NULL,
  title                text,
  scope_type           text CHECK (scope_type IN ('testpack', 'system', 'iso_group', 'full_project')),
  testpack_id          uuid REFERENCES testpacks(id),
  system               text,
  compiled_by          uuid REFERENCES project_members(id),
  compiled_at          timestamptz,
  submitted_date       date,
  client_accepted_date date,
  status               text DEFAULT 'draft'
                       CHECK (status IN ('draft', 'compiled', 'submitted', 'accepted', 'rejected')),
  rejection_reason     text,
  open_b_items         int DEFAULT 0,
  package_url          text,
  notes                text,
  created_at           timestamptz DEFAULT now()
);

-- Deferred FK: punch_items → handover_packages
ALTER TABLE punch_items
  ADD CONSTRAINT punch_items_handover_package_id_fkey
  FOREIGN KEY (handover_package_id) REFERENCES handover_packages(id);

-- ============================================================
-- 27. package_items  (cascades via package_id)
-- ============================================================
CREATE TABLE package_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_id           uuid NOT NULL REFERENCES handover_packages(id) ON DELETE CASCADE,
  item_type            text CHECK (item_type IN (
                         'iso', 'weld', 'ndt_record', 'qc_record', 'rfi',
                         'punch_item', 'document', 'flange_joint', 'pressure_test')),
  item_id              uuid,
  item_ref             text,
  item_status_snapshot text,
  file_url             text,
  section              text,
  sort_order           int DEFAULT 0,
  created_at           timestamptz DEFAULT now()
);

-- ============================================================
-- Enable Row Level Security on all tables
-- ============================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE wps_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE welders ENABLE ROW LEVEL SECURITY;
ALTER TABLE testpacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE iso_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE spools ENABLE ROW LEVEL SECURITY;
ALTER TABLE weld_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ndt_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ndt_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE ndt_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE supports_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE flange_joints ENABLE ROW LEVEL SECURITY;
ALTER TABLE flange_torque_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfi_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfi_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items ENABLE ROW LEVEL SECURITY;
