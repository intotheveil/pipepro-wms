-- Unique constraint for document upsert on re-import
ALTER TABLE documents ADD CONSTRAINT documents_doc_no_project_id_unique
  UNIQUE (doc_no, project_id);
