import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { utils, writeFile } from 'xlsx';

// -- Storage path builder -----------------------------------------------------

function ndtStoragePath(projectId, record) {
  const method = (record.method || 'unknown').toLowerCase();
  const weldId = record._weldId || record.weld_id || '';
  const filename = `${record.report_no || record.id}_${weldId}`
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${projectId}/ndt/reports/${method}/${filename}`;
}

// -- Result badge -------------------------------------------------------------

const RESULT_MAP = {
  PENDING:  { bg: '#e5e7eb', fg: '#6b7280', t: 'Pending' },
  ACCEPTED: { bg: '#d1fae5', fg: '#065f46', t: 'Accepted' },
  REJECTED: { bg: '#fee2e2', fg: '#991b1b', t: 'Rejected' },
  REPAIRED: { bg: '#fef3c7', fg: '#92400e', t: 'Repaired' },
};

function ResultBadge({ value }) {
  const s = RESULT_MAP[value] || RESULT_MAP.PENDING;
  return (
    <span style={{ ...badge, background: s.bg, color: s.fg }}>{s.t}</span>
  );
}

const badge = {
  display: 'inline-block', padding: '2px 10px', borderRadius: 12,
  fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
};

// -- Method badge -------------------------------------------------------------

function MethodBadge({ value }) {
  if (!value) return '\u2014';
  return (
    <span style={{ ...badge, background: '#f3f4f6', color: '#374151' }}>{value}</span>
  );
}

// -- Table columns ------------------------------------------------------------

const COLS = [
  { k: '_weld_id',        l: 'Weld ID',          w: 120 },
  { k: 'method',          l: 'Method',           w: 90,  render: (v) => <MethodBadge value={v} /> },
  { k: 'extent_pct',      l: 'Extent %',         w: 80 },
  { k: 'report_no',       l: 'Report No',        w: 120 },
  { k: 'technician',      l: 'Technician',       w: 120 },
  { k: 'requested_date',  l: 'Requested Date',   w: 120, render: fmtDate },
  { k: 'examined_date',   l: 'Examined Date',     w: 120, render: fmtDate },
  { k: 'result',          l: 'Result',            w: 120, render: (v) => <ResultBadge value={v} /> },
  { k: 'defect_code',     l: 'Defect Code',       w: 110 },
  { k: 'client_witnessed',l: 'Client Witnessed',  w: 110, render: fmtBool },
  { k: 'client_result',   l: 'Client Result',     w: 110 },
  { k: '_film',           l: 'Film/Report',        w: 100 },
  { k: '_file',           l: 'File',               w: 80 },
  { k: 'notes',           l: 'Notes',             w: 200, wrap: true },
];

// -- Helpers ------------------------------------------------------------------

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

function fmtBool(v) {
  if (v === true) return '\u2713';
  if (v === false) return '';
  return '\u2014';
}

function blank(pid) {
  const o = { project_id: pid };
  const FIELDS_KEYS = ['method','extent_pct','report_no','technician','requested_date',
    'examined_date','result','defect_code','client_witnessed','client_result','film_url'];
  for (const k of FIELDS_KEYS) {
    if (k === 'extent_pct') o[k] = null;
    else if (k === 'result') o[k] = 'PENDING';
    else if (k === 'client_witnessed') o[k] = false;
    else o[k] = '';
  }
  return o;
}

// ---- inject spinner keyframes once ----
if (typeof document !== 'undefined' && !document.getElementById('_spinkf')) {
  const s = document.createElement('style');
  s.id = '_spinkf';
  s.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

// =============================================================================
// MAIN
// =============================================================================

export default function NDTRegister() {
  const project = useProject();

  // data
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // lookup maps for FK display
  const [weldMap, setWeldMap] = useState({});

  // filters
  const [search, setSearch]   = useState('');
  const [fMethod, setFMethod] = useState('');
  const [fResult, setFResult] = useState('');
  const [reportsOnly, setReportsOnly] = useState(false);

  // inline editing
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId]     = useState(null);
  const [flashId, setFlashId]       = useState(null);
  const [errorId, setErrorId]       = useState(null);

  // file upload
  const fileRef = useRef(null);
  const [uploadTargetId, setUploadTargetId] = useState(null);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const supabase = getSupabase();

      const pid = project.id;
      const [ndtData, weldData] = await Promise.all([
        fetchAll(supabase.from('ndt_register').select('*').eq('project_id', pid).order('created_at', { ascending: false })),
        fetchAll(supabase.from('weld_log').select('id, weld_id').eq('project_id', pid)),
      ]);

      if (!c) {
        setRows(ndtData);
        setWeldMap(Object.fromEntries(weldData.map((r) => [r.id, r.weld_id])));
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // -- filter -----------------------------------------------------------------

  const term = search.toLowerCase();
  const filtered = rows.filter((r) => {
    if (term && !(
      has(weldMap[r.weld_id], term) || has(r.report_no, term) ||
      has(r.technician, term) || has(r.defect_code, term)
    )) return false;
    if (fMethod && r.method !== fMethod) return false;
    if (fResult && r.result !== fResult) return false;
    if (reportsOnly && !r.film_url) return false;
    return true;
  });

  // -- stats ------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = rows.length;
    const pending  = rows.filter((r) => r.result === 'PENDING').length;
    const accepted = rows.filter((r) => r.result === 'ACCEPTED').length;
    const rejected = rows.filter((r) => r.result === 'REJECTED').length;
    const rejRate  = total > 0 ? (rejected / total * 100) : 0;
    return { total, pending, accepted, rejected, rejRate };
  }, [rows]);

  const rejRateColor = stats.rejRate > 5 ? '#dc2626'
    : stats.rejRate > 2 ? '#d97706'
    : '#059669';

  // -- autosave ---------------------------------------------------------------

  async function autoSave(rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase()
      .from('ndt_register').update(updates).eq('id', rowId);
    if (!error) {
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...updates } : r));
      setFlashId(rowId);
      setTimeout(() => setFlashId(null), 600);
    } else {
      setErrorId(rowId);
      setTimeout(() => setErrorId(null), 3000);
    }
    setSavingId(null);
  }

  // -- file management ---------------------------------------------------------

  async function handleUpload(rowId, record, file) {
    setSavingId(rowId);
    const path = ndtStoragePath(project.id, { ...record, _weldId: weldMap[record.weld_id] });
    const supabase = getSupabase();
    const { error: upErr } = await supabase.storage
      .from('quality-docs').upload(path, file, { upsert: true });
    if (!upErr) {
      await autoSave(rowId, { film_url: `quality-docs:${path}` });
    }
    setSavingId(null);
  }

  async function openFile(fileUrl) {
    const parts = fileUrl.split(':');
    const bucket = parts[0];
    const path = parts.slice(1).join(':');
    const { data } = await getSupabase().storage.from(bucket).createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function removeFile(rowId, fileUrl) {
    if (!confirm('Remove this report?')) return;
    const parts = fileUrl.split(':');
    const bucket = parts[0];
    const path = parts.slice(1).join(':');
    await getSupabase().storage.from(bucket).remove([path]);
    await autoSave(rowId, { film_url: null });
  }

  // -- add new record ---------------------------------------------------------

  async function addRecord() {
    const supabase = getSupabase();
    const data = blank(project.id);
    const { data: inserted, error } = await supabase
      .from('ndt_register').insert(data).select();
    if (!error && inserted?.length) {
      setRows((p) => [inserted[0], ...p]);
      setExpandedId(inserted[0].id);
    }
  }

  // -- export -----------------------------------------------------------------

  function exportXlsx() {
    const out = filtered.map((r) => ({
      'Weld ID': weldMap[r.weld_id] || '',
      'Method': r.method,
      'Extent %': r.extent_pct,
      'Report No': r.report_no,
      'Technician': r.technician,
      'Requested Date': fmtDate(r.requested_date),
      'Examined Date': fmtDate(r.examined_date),
      'Result': RESULT_MAP[r.result]?.t || r.result,
      'Defect Code': r.defect_code,
      'Client Witnessed': r.client_witnessed ? 'Y' : 'N',
      'Client Result': r.client_result,
      'Film/Report URL': r.film_url,
      'Notes': r.notes,
    }));
    const ws = utils.json_to_sheet(out);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'NDT Register');
    writeFile(wb, `${project.code}_NDT_Register.xlsx`);
  }

  // -- render -----------------------------------------------------------------

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: 'var(--space-lg) var(--space-xl)',
        height: '100%', overflow: 'auto',
      }}>

        {/* header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                       marginBottom:'var(--space-lg)', flexWrap:'wrap', gap:'var(--space-md)' }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:600, marginBottom:2 }}>NDT Register</h1>
            <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>{project.name}</p>
          </div>
          <div style={{ display:'flex', gap:'var(--space-sm)' }}>
            <button onClick={exportXlsx} style={bSec}>Export</button>
            <button onClick={addRecord} style={bPri}>Add NDT</button>
          </div>
        </div>

        {/* stats row */}
        {!loading && rows.length > 0 && (
          <div style={{ display:'flex', gap:'var(--space-lg)', marginBottom:'var(--space-lg)' }}>
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Pending" value={stats.pending} color="var(--color-text-muted)" />
            <StatCard label="Accepted" value={stats.accepted} color="#059669" />
            <StatCard label="Rejected" value={stats.rejected}
              color={stats.rejected > 0 ? '#dc2626' : 'var(--color-text-muted)'} />
            <StatCard label="Rejection Rate"
              value={stats.rejRate.toFixed(1) + '%'}
              color={rejRateColor} />
          </div>
        )}

        {/* filters */}
        <div style={{ display:'flex', gap:'var(--space-sm)', marginBottom:'var(--space-md)', flexWrap:'wrap' }}>
          <input type="text" placeholder="Search weld ID, report, technician\u2026"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...iSt, width:260 }} />
          <select value={fMethod} onChange={(e) => setFMethod(e.target.value)} style={sSt}>
            <option value="">All Methods</option>
            <option value="RT">RT</option>
            <option value="UT">UT</option>
            <option value="PT">PT</option>
            <option value="MT">MT</option>
            <option value="VT">VT</option>
          </select>
          <select value={fResult} onChange={(e) => setFResult(e.target.value)} style={sSt}>
            <option value="">All Results</option>
            {Object.entries(RESULT_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.t}</option>
            ))}
          </select>
        </div>

        {/* body */}
        {loading ? (
          <p style={{ color:'var(--color-text-muted)' }}>Loading&hellip;</p>
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            <p style={{ fontSize:12, color:'var(--color-text-muted)', marginBottom:'var(--space-sm)' }}>
              {filtered.length} of {rows.length} records
            </p>

            <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)',
                           borderRadius:'var(--radius-lg)', overflowX:'auto', width:'100%', maxHeight:'calc(100vh - 300px)' }}>
              <table style={{ minWidth:1800, width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--color-border)', background:'var(--color-bg)' }}>
                    {COLS.map((c) => (
                      <th key={c.k} style={{ ...th, minWidth:c.w, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>{c.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={COLS.length} style={{ padding:'var(--space-lg)', textAlign:'center', color:'var(--color-text-muted)' }}>
                      No results match your filters
                    </td></tr>
                  ) : filtered.map((row) => {
                    const isExpanded = expandedId === row.id;
                    const isFlash = flashId === row.id;
                    const isError = errorId === row.id;
                    const isSaving = savingId === row.id;

                    const rowBg = isFlash ? '#dcfce7'
                      : isError ? '#fef2f2'
                      : 'transparent';

                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid var(--color-border)',
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                            background: rowBg,
                            outline: isError ? '2px solid #dc2626' : 'none',
                          }}
                          onMouseEnter={(e) => { if (!isFlash && !isError) e.currentTarget.style.background = 'var(--color-bg)'; }}
                          onMouseLeave={(e) => { if (!isFlash && !isError) e.currentTarget.style.background = 'transparent'; }}
                        >
                          {COLS.map((c) => {
                            if (c.k === '_weld_id') return <td key={c.k} style={td}>{weldMap[row.weld_id] || '\u2014'}</td>;
                            if (c.k === '_film') return (
                              <td key={c.k} style={td}>
                                {row.film_url
                                  ? <a href={row.film_url} target="_blank" rel="noopener noreferrer"
                                       onClick={(e) => e.stopPropagation()}
                                       style={{ color:'var(--color-primary)', textDecoration:'underline' }}>View</a>
                                  : '\u2014'}
                              </td>
                            );

                            const cellSt = c.wrap ? tdWrap : td;
                            return (
                              <td key={c.k} style={cellSt}>
                                {c.render ? c.render(row[c.k]) : (row[c.k] != null && row[c.k] !== '' ? row[c.k] : '\u2014')}
                              </td>
                            );
                          })}
                        </tr>

                        {/* inline edit panel */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={COLS.length} style={{ padding: 0, background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
                              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

                                {/* Method */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Method</span>
                                  <select value={row.method || ''} style={fi}
                                    onChange={(e) => autoSave(row.id, { method: e.target.value || null })}>
                                    <option value="">-- Select --</option>
                                    <option value="RT">RT</option>
                                    <option value="UT">UT</option>
                                    <option value="PT">PT</option>
                                    <option value="MT">MT</option>
                                    <option value="VT">VT</option>
                                  </select>
                                </label>

                                {/* Report No */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Report No</span>
                                  <input type="text" defaultValue={row.report_no || ''} style={fi}
                                    onBlur={(e) => { if (e.target.value !== (row.report_no || '')) autoSave(row.id, { report_no: e.target.value || null }); }} />
                                </label>

                                {/* Technician */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Technician</span>
                                  <input type="text" defaultValue={row.technician || ''} style={fi}
                                    onBlur={(e) => { if (e.target.value !== (row.technician || '')) autoSave(row.id, { technician: e.target.value || null }); }} />
                                </label>

                                {/* Extent % */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Extent %</span>
                                  <input type="number" defaultValue={row.extent_pct ?? ''} style={fi}
                                    onBlur={(e) => {
                                      const v = e.target.value ? Number(e.target.value) : null;
                                      if (v !== row.extent_pct) autoSave(row.id, { extent_pct: v });
                                    }} />
                                </label>

                                {/* Requested Date */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Requested Date</span>
                                  <input type="date" defaultValue={row.requested_date ? String(row.requested_date).split('T')[0] : ''} style={fi}
                                    onChange={(e) => autoSave(row.id, { requested_date: e.target.value || null })} />
                                </label>

                                {/* Examined Date */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Examined Date</span>
                                  <input type="date" defaultValue={row.examined_date ? String(row.examined_date).split('T')[0] : ''} style={fi}
                                    onChange={(e) => autoSave(row.id, { examined_date: e.target.value || null })} />
                                </label>

                                {/* Result */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Result</span>
                                  <select value={row.result || 'PENDING'} style={fi}
                                    onChange={(e) => autoSave(row.id, { result: e.target.value })}>
                                    <option value="PENDING">Pending</option>
                                    <option value="ACCEPTED">Accepted</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="REPAIRED">Repaired</option>
                                  </select>
                                </label>

                                {/* Defect Code -- only if REJECTED or REPAIRED */}
                                {(row.result === 'REJECTED' || row.result === 'REPAIRED') && (
                                  <label style={{ display: 'block' }}>
                                    <span style={lbl}>Defect Code</span>
                                    <input type="text" defaultValue={row.defect_code || ''} style={fi}
                                      onBlur={(e) => { if (e.target.value !== (row.defect_code || '')) autoSave(row.id, { defect_code: e.target.value || null }); }} />
                                  </label>
                                )}

                                {/* Client Witnessed */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                                  <input type="checkbox" checked={!!row.client_witnessed}
                                    onChange={(e) => autoSave(row.id, { client_witnessed: e.target.checked })} />
                                  <span style={{ fontSize: 13, fontWeight: 500 }}>Client Witnessed</span>
                                </label>

                                {/* Client Result */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Client Result</span>
                                  <input type="text" defaultValue={row.client_result || ''} style={fi}
                                    onBlur={(e) => { if (e.target.value !== (row.client_result || '')) autoSave(row.id, { client_result: e.target.value || null }); }} />
                                </label>

                                {/* Film/Report URL + upload */}
                                <label style={{ display: 'block' }}>
                                  <span style={lbl}>Film / Report URL</span>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <input type="text" defaultValue={row.film_url || ''} style={{ ...fi, flex: 1 }}
                                      onBlur={(e) => { if (e.target.value !== (row.film_url || '')) autoSave(row.id, { film_url: e.target.value || null }); }} />
                                    <label style={{ ...bSec, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', margin: 0 }}>
                                      Upload
                                      <input type="file" style={{ display: 'none' }}
                                        onChange={(e) => { if (e.target.files[0]) handleUpload(row.id, e.target.files[0]); }} />
                                    </label>
                                  </div>
                                </label>

                              </div>

                              {/* feedback row */}
                              <div style={{ padding: '0 16px 12px', fontSize: 12 }}>
                                {isSaving && <span style={{ color: 'var(--color-text-muted)' }}>saving...</span>}
                                {isError && <span style={{ color: '#dc2626' }}>Save failed. Please try again.</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TINY COMPONENTS
// =============================================================================

function StatCard({ label, value, color }) {
  return (
    <div style={{
      padding: 'var(--space-md) var(--space-lg)',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      minWidth: 120,
    }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: color || 'var(--color-text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
}

function Empty() {
  return (
    <div style={{ padding:'var(--space-xl)', background:'var(--color-surface)',
                  border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)',
                  textAlign:'center' }}>
      <p style={{ fontSize:15, color:'var(--color-text-secondary)', marginBottom:'var(--space-xs)' }}>
        No NDT records found.
      </p>
      <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>
        Import data or add NDT records manually.
      </p>
    </div>
  );
}

// =============================================================================
// UTIL
// =============================================================================

function has(val, term) {
  return (val || '').toLowerCase().includes(term);
}

// =============================================================================
// STYLES
// =============================================================================

const th = {
  textAlign:'left', padding:'10px var(--space-md)', fontWeight:600,
  fontSize:11, color:'var(--color-text-secondary)',
  textTransform:'uppercase', letterSpacing:'0.03em', whiteSpace:'nowrap',
};
const td = {
  padding:'10px var(--space-md)', whiteSpace:'nowrap',
};
const tdWrap = {
  padding:'10px var(--space-md)', whiteSpace:'normal',
  wordBreak:'break-word',
};
const iSt = {
  padding:'var(--space-sm) var(--space-md)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
  fontSize:13, outline:'none', background:'var(--color-surface)',
};
const sSt = {
  padding:'var(--space-sm) var(--space-md)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
  fontSize:13, outline:'none', background:'var(--color-surface)', cursor:'pointer',
};
const lbl = {
  display:'block', fontSize:11, fontWeight:600, color:'var(--color-text-secondary)',
  marginBottom:4, textTransform:'uppercase', letterSpacing:'0.03em',
};
const fi = {
  width:'100%', padding:'8px var(--space-sm)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)',
  fontSize:13, outline:'none',
};
const bPri = {
  padding:'8px var(--space-lg)', background:'var(--color-primary)', color:'#fff',
  border:'none', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:500, cursor:'pointer',
};
const bSec = {
  padding:'8px var(--space-lg)', background:'var(--color-surface)', color:'var(--color-text)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
  fontSize:13, cursor:'pointer',
};
