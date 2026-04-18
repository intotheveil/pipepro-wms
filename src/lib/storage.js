/**
 * Bucket routing for Supabase Storage uploads.
 *
 * Buckets:
 *   project-docs  – Technical Office (drawings, specs, procedures, transmittals, MTOs)
 *   quality-docs  – Quality (ITPs, QC forms, RFIs, welders, NDT, WPS/PQR, NCRs)
 *   admin-docs    – Admin (contracts, correspondence, progress reports, meeting minutes)
 */

export const BUCKETS = [
  { id: 'project-docs', label: 'Technical Office (project-docs)' },
  { id: 'quality-docs', label: 'Quality (quality-docs)' },
  { id: 'admin-docs', label: 'Admin (admin-docs)' },
];

// Keywords in file_type / document category that map to each bucket.
const PROJECT_DOCS_KW = [
  'drawing', 'spec', 'mto', 'procedure', 'method statement', 'transmittal',
  'iso', 'p&id', 'pid', 'piping', 'civil', 'structural', 'steel', 'mechanical',
  'site instruction', 'technical query',
];
const QUALITY_DOCS_KW = [
  'itp', 'qc', 'ndt', 'wps', 'pqr', 'welder', 'ncr', 'rfi',
  'quality', 'inspection', 'certificate', 'material cert',
];
const ADMIN_DOCS_KW = [
  'contract', 'correspondence', 'report', 'meeting', 'minute', 'progress',
  'handover', 'admin',
];

function matchesAny(text, keywords) {
  const lower = (text || '').toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Determine which bucket a document should be uploaded to based on its
 * file_type (category) string. Falls back to 'project-docs'.
 */
export function resolveBucket(fileType) {
  if (matchesAny(fileType, QUALITY_DOCS_KW)) return 'quality-docs';
  if (matchesAny(fileType, ADMIN_DOCS_KW)) return 'admin-docs';
  if (matchesAny(fileType, PROJECT_DOCS_KW)) return 'project-docs';
  return 'project-docs';
}

/**
 * Build the storage path for a document file.
 * Pattern: {project_id}/{discipline_code}/{doc_no}/{filename}
 */
export function storagePath(projectId, doc, fileName) {
  const disc = sanitize(doc.discipline_code || 'general');
  const docNo = sanitize(doc.doc_no || doc.id || 'unknown');
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${projectId}/${disc}/${docNo}/${safe}`;
}

function sanitize(s) {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
}
