import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// -- Upload config ------------------------------------------------------------

const UPLOAD_CONFIGS = {
  ifc: { col: 'drawing_file_url', label: 'IFC', path: (pid, dn) => `${pid}/drawings/piping/isos-ifc/${dn}_IFC.pdf` },
  fab: { col: 'fab_asbuilt_url',  label: 'FAB', path: (pid, dn) => `${pid}/drawings/piping/as-built-fab/${dn}_FAB.pdf` },
  ere: { col: 'ere_asbuilt_url',  label: 'ERE', path: (pid, dn) => `${pid}/drawings/piping/as-built-ere/${dn}_ERE.pdf` },
};

function matchFile(filename, isoRows) {
  const name = filename.replace(/\.(pdf|PDF)$/, '').replace(/_(IFC|FAB|ERE)$/i, '');
  return isoRows.find(r => {
    const dn = (r.drawing_no || '').trim();
    return dn && name.toLowerCase().includes(dn.toLowerCase());
  });
}

const STATUS_STYLES = {
  NOT_STARTED: { background: '#e5e7eb', color: '#374151', label: 'Not Started' },
  IN_PROGRESS: { background: '#fef3c7', color: '#92400e', label: 'In Progress' },
  COMPLETE:    { background: '#d1fae5', color: '#065f46', label: 'Complete' },
  ON_HOLD:     { background: '#fee2e2', color: '#991b1b', label: 'On Hold' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.NOT_STARTED;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: s.background,
        color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

export default function ISORegister() {
  const project = useProject();
  const { projectSlug } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [weldCounts, setWeldCounts] = useState({});

  // bulk upload
  const bulkRef = useRef(null);
  const [bulkType, setBulkType] = useState(null);
  const [bulkModal, setBulkModal] = useState(null); // { total, done, matched, unmatched, finished }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const sb = getSupabase();
        const [data, weldData] = await Promise.all([
          fetchAll(
            sb.from('iso_register')
              .select('id, drawing_no, fast_no, revision, fluid_code, piping_class, size_nps, status, drawing_file_url, fab_asbuilt_url, ere_asbuilt_url')
              .eq('project_id', project.id)
              .order('drawing_no')
          ),
          fetchAll(
            sb.from('weld_log')
              .select('iso_id, welded')
              .eq('project_id', project.id)
          ),
        ]);
        if (!cancelled) {
          setRows(data);
          const counts = {};
          for (const w of weldData) {
            if (!w.iso_id) continue;
            if (!counts[w.iso_id]) counts[w.iso_id] = { total: 0, welded: 0 };
            counts[w.iso_id].total++;
            if (w.welded) counts[w.iso_id].welded++;
          }
          setWeldCounts(counts);
        }
      } catch {
        // query failed
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [project.id]);

  // -- bulk upload handler -----------------------------------------------------

  async function handleBulkUpload(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !bulkType) return;

    const cfg = UPLOAD_CONFIGS[bulkType];
    const state = { total: files.length, done: 0, matched: 0, unmatched: [], finished: false };
    setBulkModal({ ...state });

    const sb = getSupabase();
    for (const file of files) {
      const row = matchFile(file.name, rows);
      if (row) {
        const path = cfg.path(project.id, row.drawing_no);
        const { error } = await sb.storage.from('project-docs').upload(path, file, { upsert: true });
        if (!error) {
          const fileUrl = `project-docs:${path}`;
          await sb.from('iso_register').update({ [cfg.col]: fileUrl }).eq('id', row.id);
          setRows(prev => prev.map(r => r.id === row.id ? { ...r, [cfg.col]: fileUrl } : r));
          state.matched++;
        }
      } else {
        state.unmatched.push(file.name);
      }
      state.done++;
      setBulkModal({ ...state });
    }
    state.finished = true;
    setBulkModal({ ...state });
    setBulkType(null);
  }

  function startBulk(type) {
    setBulkType(type);
    setTimeout(() => bulkRef.current?.click(), 0);
  }

  const term = search.toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (r.drawing_no || '').toLowerCase().includes(term) ||
      (r.fluid_code || '').toLowerCase().includes(term)
  );

  return (
    <div style={{ padding: 'var(--space-lg) var(--space-xl)' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-lg)',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>ISO Register</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {project.name}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          {Object.entries(UPLOAD_CONFIGS).map(([type, cfg]) => (
            <button
              key={type}
              onClick={() => startBulk(type)}
              style={{
                padding: '8px 14px', background: 'var(--color-surface)', color: 'var(--color-text)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Bulk Upload {cfg.label}
            </button>
          ))}
          <input
            type="text"
            placeholder="Search drawing no. or fluid code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: 280,
              padding: 'var(--space-sm) var(--space-md)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              outline: 'none',
              background: 'var(--color-surface)',
            }}
          />
        </div>
        {/* Hidden file input for bulk upload */}
        <input type="file" accept=".pdf" multiple ref={bulkRef} style={{ display: 'none' }} onChange={handleBulkUpload} />
      </div>

      {/* Content */}
      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-xl)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
            No ISOs found.
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Import data to get started.
          </p>
        </div>
      ) : (
        <>
          {/* Results count */}
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-muted)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            {filtered.length} of {rows.length} ISOs
          </p>

          {/* Table */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                  }}
                >
                  {['Drawing No.', 'Rev', 'Fluid Code', 'Piping Class', 'Size (NPS)', 'Welds', 'Drawings', 'Status'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '10px var(--space-md)',
                          fontWeight: 600,
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: 'var(--space-lg)',
                        textAlign: 'center',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      No results match "{search}"
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const wc = weldCounts[row.id];
                    const pct = wc ? Math.round((wc.welded / wc.total) * 100) : 0;
                    return (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/p/${projectSlug}/iso/${row.fast_no || row.drawing_no}`)}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        transition: 'background var(--transition-fast)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'var(--color-bg)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      <td style={{ padding: '10px var(--space-md)', fontWeight: 500 }}>
                        {row.drawing_no || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {row.revision || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {row.fluid_code || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {row.piping_class || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {row.size_nps || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {wc ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 60, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                              {wc.welded}/{wc.total} &middot; {pct}%
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>&mdash;</span>
                        )}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {row.drawing_file_url && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#dbeafe', color: '#1e40af' }}>IFC</span>}
                          {row.fab_asbuilt_url  && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#d1fae5', color: '#065f46' }}>FAB</span>}
                          {row.ere_asbuilt_url  && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>ERE</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Bulk upload progress modal */}
      {bulkModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-xl)', width: 420, maxHeight: '80vh', overflow: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-md)' }}>
              {bulkModal.finished ? 'Upload Complete' : 'Uploading...'}
            </h3>

            {/* Progress bar */}
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                {bulkModal.finished
                  ? `Matched: ${bulkModal.matched}, Unmatched: ${bulkModal.unmatched.length}`
                  : `Uploading ${bulkModal.done} of ${bulkModal.total}...`}
              </div>
              <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${bulkModal.total ? Math.round((bulkModal.done / bulkModal.total) * 100) : 0}%`,
                  height: '100%', background: bulkModal.finished ? '#22c55e' : 'var(--color-primary)',
                  borderRadius: 4, transition: 'width 0.2s ease',
                }} />
              </div>
            </div>

            {/* Unmatched list */}
            {bulkModal.finished && bulkModal.unmatched.length > 0 && (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>
                  Unmatched files:
                </p>
                <ul style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, paddingLeft: 18 }}>
                  {bulkModal.unmatched.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}

            {bulkModal.finished && (
              <button
                onClick={() => setBulkModal(null)}
                style={{
                  padding: '8px 20px', background: 'var(--color-primary)', color: '#fff',
                  border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13,
                  fontWeight: 500, cursor: 'pointer',
                }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
