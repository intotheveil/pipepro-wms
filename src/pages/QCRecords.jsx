import { useEffect, useState, useRef } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';

// -- Helpers ------------------------------------------------------------------

function typeFromName(name) {
  if (name.includes('DIM')) return 'Dimensional Check';
  if (name.includes('PNT')) return 'Paint Release';
  if (name.includes('SHP')) return 'Site Transport';
  return 'QC Form';
}

function typeBadgeColor(name) {
  if (name.includes('DIM')) return { bg: '#dbeafe', color: '#1e40af' };
  if (name.includes('PNT')) return { bg: '#fef3c7', color: '#92400e' };
  if (name.includes('SHP')) return { bg: '#d1fae5', color: '#065f46' };
  return { bg: '#f3f4f6', color: '#374151' };
}

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

// =============================================================================
// MAIN
// =============================================================================

export default function QCRecords() {
  const project = useProject();

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [uploading, setUploading] = useState(null); // qcfId being uploaded
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const { data, error } = await sb.storage
        .from('quality-docs')
        .list(`${project.id}/qc-forms/prepared`, { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });

      if (!c) {
        setFiles(error ? [] : (data || []));
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // -- download ---------------------------------------------------------------

  async function handleDownload(fileName) {
    const sb = getSupabase();
    const path = `${project.id}/qc-forms/prepared/${fileName}`;
    const { data } = await sb.storage.from('quality-docs').createSignedUrl(path, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  }

  // -- upload signed ----------------------------------------------------------

  function startUploadSigned(qcfId) {
    setUploadTarget(qcfId);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    setUploading(uploadTarget);
    const sb = getSupabase();
    const path = `${project.id}/qc-forms/signed/${uploadTarget}_signed.pdf`;
    const { error } = await sb.storage.from('quality-docs').upload(path, file, { upsert: true });

    if (!error) {
      setToast('Signed document uploaded');
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast('Upload failed: ' + error.message);
      setTimeout(() => setToast(null), 4000);
    }
    setUploading(null);
    setUploadTarget(null);
    e.target.value = '';
  }

  // -- render -----------------------------------------------------------------

  return (
    <div style={{ padding: 'var(--space-lg) var(--space-xl)', height: '100%', overflow: 'auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>QC Records</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Generated quality control form PDFs
        </p>
      </div>

      {/* Hidden file input */}
      <input type="file" accept=".pdf" ref={fileInputRef}
        style={{ display: 'none' }} onChange={handleFileSelected} />

      {/* Body */}
      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
      ) : files.length === 0 ? (
        <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
          textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
            No QC forms generated yet.
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Select spools in the Spool Tracker and generate QC forms.
          </p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
            {files.length} document{files.length !== 1 ? 's' : ''}
          </p>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  <th style={thSt}>QCF ID</th>
                  <th style={thSt}>Type</th>
                  <th style={thSt}>Date</th>
                  <th style={thSt}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const qcfId = f.name.replace('.pdf', '');
                  const badge = typeBadgeColor(f.name);
                  return (
                    <tr key={f.name} style={{ borderBottom: '1px solid var(--color-border)' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdSt}>
                        <span style={{ fontWeight: 600 }}>{qcfId}</span>
                      </td>
                      <td style={tdSt}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: badge.bg, color: badge.color,
                        }}>
                          {typeFromName(f.name)}
                        </span>
                      </td>
                      <td style={tdSt}>{fmtDate(f.created_at)}</td>
                      <td style={tdSt}>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                          <button onClick={() => handleDownload(f.name)} style={btnOutline}>
                            Download
                          </button>
                          <button onClick={() => startUploadSigned(qcfId)} style={btnOutline}
                            disabled={uploading === qcfId}>
                            {uploading === qcfId ? 'Uploading...' : 'Upload Signed'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 24px', background: '#065f46', color: '#fff',
          borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const thSt = {
  textAlign: 'left', padding: '10px var(--space-md)', fontWeight: 600,
  fontSize: 11, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
};

const tdSt = {
  padding: '10px var(--space-md)', whiteSpace: 'nowrap',
};

const btnOutline = {
  padding: '6px 14px', background: 'var(--color-surface)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  fontSize: 12, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
};
