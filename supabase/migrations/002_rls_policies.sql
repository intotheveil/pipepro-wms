-- PipePro WMS — RLS Policies
-- Rule: users can only access rows for projects they are a member of.

-- projects (check id, SELECT only)
CREATE POLICY "members can view own projects" ON projects
FOR SELECT USING (
  id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- project_members (direct user_id check — avoids circular self-reference)
CREATE POLICY "users can see own memberships" ON project_members
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users can manage own memberships" ON project_members
FOR ALL USING (user_id = auth.uid());

-- subcontractors
CREATE POLICY "members can access own project data" ON subcontractors
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- wps_list
CREATE POLICY "members can access own project data" ON wps_list
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- welders
CREATE POLICY "members can access own project data" ON welders
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- testpacks
CREATE POLICY "members can access own project data" ON testpacks
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- iso_register
CREATE POLICY "members can access own project data" ON iso_register
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- spools
CREATE POLICY "members can access own project data" ON spools
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- weld_log
CREATE POLICY "members can access own project data" ON weld_log
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- ndt_batches
CREATE POLICY "members can access own project data" ON ndt_batches
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- ndt_register
CREATE POLICY "members can access own project data" ON ndt_register
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- ndt_matrix
CREATE POLICY "members can access own project data" ON ndt_matrix
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- supports_list
CREATE POLICY "members can access own project data" ON supports_list
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- flange_joints
CREATE POLICY "members can access own project data" ON flange_joints
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- flange_torque_steps
CREATE POLICY "members can access own project data" ON flange_torque_steps
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- punch_items
CREATE POLICY "members can access own project data" ON punch_items
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- rfi_records
CREATE POLICY "members can access own project data" ON rfi_records
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- rfi_tags
CREATE POLICY "members can access own project data" ON rfi_tags
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- document_categories
CREATE POLICY "members can access own project data" ON document_categories
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- documents
CREATE POLICY "members can access own project data" ON documents
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- qc_form_templates
CREATE POLICY "members can access own project data" ON qc_form_templates
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- qc_records
CREATE POLICY "members can access own project data" ON qc_records
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- milestones
CREATE POLICY "members can access own project data" ON milestones
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- progress_snapshots
CREATE POLICY "members can access own project data" ON progress_snapshots
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- import_logs
CREATE POLICY "members can access own project data" ON import_logs
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- handover_packages
CREATE POLICY "members can access own project data" ON handover_packages
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- package_items
CREATE POLICY "members can access own project data" ON package_items
FOR ALL USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);
