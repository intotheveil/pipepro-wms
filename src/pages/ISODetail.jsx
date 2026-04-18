import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// -- Helpers ------------------------------------------------------------------

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDD(dateStr) {
  if (!dateStr) return '';
  const d = String(dateStr).split('T')[0];
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}`;
}

// -- Drawing upload config ----------------------------------------------------

const DRAWING_TYPES = {
  ifc: { col: 'drawing_file_url', label: 'IFC Drawing',  path: (pid, dn) => `${pid}/drawings/piping/isos-ifc/${dn}_IFC.pdf` },
  fab: { col: 'fab_asbuilt_url',  label: 'FAB As-Built', path: (pid, dn) => `${pid}/drawings/piping/as-built-fab/${dn}_FAB.pdf` },
  ere: { col: 'ere_asbuilt_url',  label: 'ERE As-Built', path: (pid, dn) => `${pid}/drawings/piping/as-built-ere/${dn}_ERE.pdf` },
};

// -- Signed URL hook ----------------------------------------------------------

function useSignedUrl(fileUrl) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!fileUrl) { setUrl(null); return; }
    let c = false;
    (async () => {
      const parts = fileUrl.split(':');
      const { data } = await getSupabase().storage.from(parts[0]).createSignedUrl(parts.slice(1).join(':'), 3600);
      if (!c && data?.signedUrl) setUrl(data.signedUrl);
    })();
    return () => { c = true; };
  }, [fileUrl]);
  return url;
}

// =============================================================================
// STYLES (hoisted for use in sub-components)
// =============================================================================

const card = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-lg)',
  marginBottom: 'var(--space-lg)',
};

const cardTitle = {
  fontSize: 14,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: 'var(--color-text-secondary)',
  marginBottom: 'var(--space-md)',
};

const metaLbl = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: 2,
};

const metaVal = {
  display: 'block',
  fontSize: 13,
  color: 'var(--color-text)',
};

const lbl = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const fi = {
  width: '100%',
  padding: '8px var(--space-sm)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  outline: 'none',
};

const bPri = {
  padding: '8px var(--space-lg)',
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const bSec = {
  padding: '8px var(--space-lg)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
  cursor: 'pointer',
};

const bSmall = {
  padding: '6px 10px',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

// -- Drawing zone component ---------------------------------------------------

function DrawingZone({ title, fileUrl, onUpload, uploading }) {
  const signedUrl = useSignedUrl(fileUrl);
  const ref = useRef(null);
  return (
    <div style={{ flex: 1, minWidth: 0, ...card }}>
      <h2 style={cardTitle}>{title}</h2>
      {fileUrl && signedUrl ? (
        <div>
          <iframe src={signedUrl} width="100%" height={300} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'block' }} />
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
            <a href={signedUrl} target="_blank" rel="noopener noreferrer" style={{ ...bSec, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', fontSize: 12 }}>Open</a>
            <input type="file" accept=".pdf" ref={ref} style={{ display: 'none' }} onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
            <button onClick={() => ref.current?.click()} style={{ ...bSec, fontSize: 12 }} disabled={uploading}>{uploading ? 'Uploading...' : 'Replace'}</button>
          </div>
        </div>
      ) : (
        <div style={{
          background: '#f3f4f6', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)',
          padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-muted)',
        }}>
          <p style={{ marginBottom: 'var(--space-sm)', fontSize: 13 }}>No {title.toLowerCase()} uploaded</p>
          <input type="file" accept=".pdf" ref={ref} style={{ display: 'none' }} onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
          <button onClick={() => ref.current?.click()} style={bPri} disabled={uploading}>
            {uploading ? 'Uploading...' : `Upload ${title}`}
          </button>
        </div>
      )}
    </div>
  );
}

// -- Fab stages ---------------------------------------------------------------

const FAB_STAGES = [
  { bool: 'material_checked', date: 'material_check_date', label: 'Material Check' },
  { bool: 'fab_started',      date: 'fab_start_date',      label: 'Fab Started' },
  { bool: 'fabricated',       date: 'fabricated_date',      label: 'Fabricated' },
  { bool: 'qc_released',     date: 'qc_release_date',     label: 'QC Released' },
  { bool: 'sent_to_paint',   date: 'sent_to_paint_date',  label: 'Sent to Paint' },
  { bool: 'painted',          date: 'painted_date',         label: 'Painted' },
  { bool: 'at_laydown',      date: 'laydown_date',         label: 'At Laydown' },
  { bool: 'erected',          date: 'erected_date',         label: 'Erected' },
];

// -- Weld status helpers ------------------------------------------------------

const WELD_STATUS_MAP = {
  not_started: { bg: '#e5e7eb', fg: '#6b7280', t: 'Not Started', dot: '#9ca3af' },
  fit_up:      { bg: '#dbeafe', fg: '#1e40af', t: 'Fit-Up',      dot: '#f59e0b' },
  welded:      { bg: '#fef3c7', fg: '#92400e', t: 'Welded',      dot: '#22c55e' },
  ndt_pending: { bg: '#fde68a', fg: '#78350f', t: 'NDT Pending', dot: '#22c55e' },
  accepted:    { bg: '#d1fae5', fg: '#065f46', t: 'Accepted',    dot: '#22c55e' },
  rejected:    { bg: '#fee2e2', fg: '#991b1b', t: 'Rejected',    dot: '#ef4444' },
  repaired:    { bg: '#ede9fe', fg: '#5b21b6', t: 'Repaired',    dot: '#8b5cf6' },
};

// -- Inject spinner keyframes ------------------------------------------------

if (typeof document !== 'undefined' && !document.getElementById('_spinkf')) {
  const s = document.createElement('style');
  s.id = '_spinkf';
  s.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

// =============================================================================
// MAIN
// =============================================================================

export default function ISODetail() {
  const project = useProject();
  const { projectSlug, fastNo } = useParams();
  const navigate = useNavigate();

  // data
  const [iso, setIso]           = useState(null);
  const [spools, setSpools]     = useState([]);
  const [welds, setWelds]       = useState([]);
  const [welders, setWelders]   = useState([]);
  const [wpsList, setWpsList]   = useState([]);
  const [loading, setLoading]   = useState(true);

  // spool selector
  const [selectedSpoolId, setSelectedSpoolId] = useState(null);

  // drawing upload
  const [uploadingType, setUploadingType] = useState(null);

  // weld expand
  const [expandedWeldId, setExpandedWeldId] = useState(null);

  // autosave feedback
  const [savingId, setSavingId] = useState(null);
  const [flashId, setFlashId]   = useState(null);
  const [errorId, setErrorId]   = useState(null);

  // multi-select
  const [multiMode, setMultiMode]       = useState(false);
  const [selected, setSelected]         = useState(new Set());
  const [bulkWelder, setBulkWelder]     = useState('');
  const [bulkWps, setBulkWps]           = useState('');

  // lookup maps
  const welderMap = useMemo(() => Object.fromEntries(welders.map(w => [w.id, w.stamp || w.name])), [welders]);
  const wpsMap    = useMemo(() => Object.fromEntries(wpsList.map(w => [w.id, w.wps_no])), [wpsList]);
  const spoolMap  = useMemo(() => Object.fromEntries(spools.map(s => [s.id, s.spool_no])), [spools]);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const pid = project.id;

      // fetch ISO
      const { data: isoArr } = await sb.from('iso_register')
        .select('*').eq('project_id', pid).eq('fast_no', fastNo).limit(1);
      const isoRow = isoArr?.[0];
      if (!isoRow || c) { setLoading(false); return; }

      // fetch rest in parallel
      const [spoolData, weldData, welderData, wpsData] = await Promise.all([
        fetchAll(sb.from('spools').select('*').eq('iso_id', isoRow.id)),
        fetchAll(sb.from('weld_log').select('*').eq('iso_id', isoRow.id).order('weld_id')),
        fetchAll(sb.from('welders').select('id, stamp, name').eq('project_id', pid)),
        fetchAll(sb.from('wps_list').select('id, wps_no').eq('project_id', pid)),
      ]);

      if (!c) {
        setIso(isoRow);
        setSpools(spoolData);
        if (spoolData.length > 0) setSelectedSpoolId(spoolData[0].id);
        setWelds(weldData);
        setWelders(welderData);
        setWpsList(wpsData);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id, fastNo]);

  // -- autosave ---------------------------------------------------------------

  async function autoSave(table, rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase().from(table).update(updates).eq('id', rowId);
    if (!error) {
      // update local state
      if (table === 'spools') {
        setSpools(prev => prev.map(r => r.id === rowId ? { ...r, ...updates } : r));
      } else if (table === 'weld_log') {
        setWelds(prev => prev.map(r => r.id === rowId ? { ...r, ...updates } : r));
      }
      setFlashId(rowId);
      setTimeout(() => setFlashId(null), 600);
    } else {
      setErrorId(rowId);
      setTimeout(() => setErrorId(null), 3000);
    }
    setSavingId(null);
  }

  // -- upload drawing ---------------------------------------------------------

  async function uploadDrawing(type, file) {
    if (!file || !iso) return;
    setUploadingType(type);
    const cfg = DRAWING_TYPES[type];
    const sb = getSupabase();
    const path = cfg.path(project.id, iso.drawing_no);
    const { error: upErr } = await sb.storage.from('project-docs').upload(path, file, { upsert: true });
    if (!upErr) {
      const fileUrl = `project-docs:${path}`;
      await sb.from('iso_register').update({ [cfg.col]: fileUrl }).eq('id', iso.id);
      setIso(prev => ({ ...prev, [cfg.col]: fileUrl }));
    }
    setUploadingType(null);
  }

  // -- multi-select apply -----------------------------------------------------

  async function applyBulk() {
    if (selected.size === 0) return;
    const updates = {};
    if (bulkWelder) updates.welder_id = bulkWelder;
    if (bulkWps) updates.wps_id = bulkWps;
    if (Object.keys(updates).length === 0) return;

    const sb = getSupabase();
    const ids = [...selected];
    for (const id of ids) {
      await sb.from('weld_log').update(updates).eq('id', id);
    }
    setWelds(prev => prev.map(r => selected.has(r.id) ? { ...r, ...updates } : r));
    setSelected(new Set());
    setBulkWelder('');
    setBulkWps('');
  }

  // -- selected spool ---------------------------------------------------------

  const currentSpool = spools.find(s => s.id === selectedSpoolId);

  // -- render -----------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-lg) var(--space-xl)' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
      </div>
    );
  }

  if (!iso) {
    return (
      <div style={{ padding: 'var(--space-lg) var(--space-xl)' }}>
        <button onClick={() => navigate(-1)} style={bSec}>&larr; Back</button>
        <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-md)' }}>ISO not found.</p>
      </div>
    );
  }

  const fabComplete = currentSpool ? FAB_STAGES.filter(s => currentSpool[s.bool]).length : 0;
  const fabPct = Math.round((fabComplete / 8) * 100);

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-lg) var(--space-xl)', height: '100%', overflow: 'auto' }}>

        {/* ============= SECTION 1 - HEADER ============= */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
          <button onClick={() => navigate(-1)} style={{ ...bSec, padding: '6px 12px', fontSize: 16 }}>&larr;</button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>{iso.drawing_no}</h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>FAST No: {iso.fast_no || '\u2014'}</p>
          </div>
        </div>

        {/* Metadata row */}
        <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', marginBottom: 'var(--space-lg)' }}>
          {[
            ['Material', iso.material],
            ['Size NPS', iso.size_nps],
            ['Piping Class', iso.piping_class],
            ['System', iso.system],
            ['PED Category', iso.ped_category],
            ['Fluid Code', iso.fluid_code],
          ].map(([label, val]) => (
            <div key={label}>
              <span style={metaLbl}>{label}</span>
              <span style={metaVal}>{val || '\u2014'}</span>
            </div>
          ))}
        </div>

        {/* ============= SECTION 2 - DRAWING UPLOAD ZONES ============= */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 'var(--space-lg)' }}>
          {Object.entries(DRAWING_TYPES).map(([type, cfg]) => (
            <DrawingZone
              key={type}
              title={cfg.label}
              fileUrl={iso[cfg.col]}
              uploading={uploadingType === type}
              onUpload={(file) => uploadDrawing(type, file)}
            />
          ))}
        </div>

        {/* ============= SECTION 3 - SPOOL SELECTOR + FAB STATUS ============= */}
        <div style={card}>
          <h2 style={cardTitle}>Fabrication Status</h2>

          {spools.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No spools found for this ISO.</p>
          ) : (
            <>
              {/* Spool dropdown */}
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <span style={lbl}>Spool</span>
                <select
                  value={selectedSpoolId || ''}
                  onChange={(e) => setSelectedSpoolId(e.target.value)}
                  style={{ ...fi, width: 240 }}
                >
                  {spools.map(s => (
                    <option key={s.id} value={s.id}>{s.spool_no}</option>
                  ))}
                </select>
              </div>

              {/* Fab stage checkboxes */}
              {currentSpool && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                    {FAB_STAGES.map(stage => {
                      const checked = !!currentSpool[stage.bool];
                      const dateVal = currentSpool[stage.date];
                      return (
                        <label key={stage.bool} style={{
                          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
                          padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                          background: flashId === currentSpool.id ? '#dcfce7' : 'transparent',
                          transition: 'background 0.3s ease',
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const newVal = !checked;
                              const updates = { [stage.bool]: newVal };
                              if (newVal) updates[stage.date] = todayStr();
                              else updates[stage.date] = null;
                              autoSave('spools', currentSpool.id, updates);
                            }}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <span>{stage.label}</span>
                          {checked && dateVal && (
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>
                              {fmtDD(dateVal)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop: 'var(--space-md)' }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                      {fabComplete} / 8 complete &mdash; {fabPct}%
                    </div>
                    <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${fabPct}%`, height: '100%', background: '#22c55e', borderRadius: 4, transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ============= SECTION 4 - NDT STATUS ============= */}
        {currentSpool && (
          <div style={card}>
            <h2 style={cardTitle}>NDT Status</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              {[
                { key: 'ndt_vt', label: 'VT', options: ['', 'Requested', 'Pass', 'Fail'] },
                { key: 'ndt_mtpt', label: 'MT/PT', options: ['', 'Requested', 'Pass', 'Fail'] },
                { key: 'ndt_rtut', label: 'RT/UT', options: ['', 'Requested', 'Pass', 'Fail'] },
                { key: 'ndt_pwht', label: 'PWHT', options: ['', 'Requested', 'Pass', 'Fail', 'N/A'] },
              ].map(ndt => (
                <div key={ndt.key}>
                  <span style={lbl}>{ndt.label}</span>
                  <select
                    value={currentSpool[ndt.key] || ''}
                    onChange={(e) => autoSave('spools', currentSpool.id, { [ndt.key]: e.target.value || null })}
                    style={{ ...fi, width: '100%' }}
                  >
                    {ndt.options.map(o => (
                      <option key={o} value={o}>{o || '-- Select --'}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============= SECTION 5 - WELD LIST ============= */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h2 style={{ ...cardTitle, marginBottom: 0 }}>WELDS &middot; {welds.length} JOINTS</h2>
            <button
              onClick={() => { setMultiMode(m => !m); setSelected(new Set()); }}
              style={multiMode ? bPri : bSec}
            >
              {multiMode ? 'Cancel' : 'Multi-select'}
            </button>
          </div>

          {welds.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No welds found for this ISO.</p>
          ) : (
            welds.map(weld => {
              const ws = WELD_STATUS_MAP[weld.status] || WELD_STATUS_MAP.not_started;
              const isExpanded = expandedWeldId === weld.id;
              const isFlash = flashId === weld.id;
              const isError = errorId === weld.id;

              return (
                <div key={weld.id} style={{ marginBottom: 'var(--space-sm)' }}>
                  {/* Weld row */}
                  <div
                    onClick={() => { if (!multiMode) setExpandedWeldId(isExpanded ? null : weld.id); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                      padding: '10px var(--space-md)',
                      background: isFlash ? '#dcfce7' : isExpanded ? '#f0f4ff' : 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderLeft: isError ? '3px solid #dc2626' : '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'background 0.3s ease',
                    }}
                  >
                    {/* Multi-select checkbox */}
                    {multiMode && (
                      <input
                        type="checkbox"
                        checked={selected.has(weld.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => {
                          setSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(weld.id)) next.delete(weld.id);
                            else next.add(weld.id);
                            return next;
                          });
                        }}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    )}

                    {/* Status dot */}
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: ws.dot, flexShrink: 0 }} />

                    {/* Weld info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{weld.weld_id || '\u2014'}</span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {weld.size_nps ? `${weld.size_nps} NPS` : ''}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {weld.shop_field || ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {ws.t}
                        {weld.weld_date && ` \u00b7 ${fmtDD(weld.weld_date)}`}
                        {weld.fit_up_date && !weld.weld_date && ` \u00b7 Fit-up ${fmtDD(weld.fit_up_date)}`}
                      </div>
                    </div>

                    {/* Expand arrow */}
                    {!multiMode && (
                      <span style={{ fontSize: 14, color: 'var(--color-text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                        &#9654;
                      </span>
                    )}
                  </div>

                  {/* Expanded inline edit */}
                  {isExpanded && !multiMode && (
                    <div style={{
                      border: '1px solid var(--color-border)', borderTop: 'none',
                      borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                      background: '#f8fafc', padding: 'var(--space-md)',
                    }}>
                      {/* Read-only info */}
                      <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
                        {[
                          ['Drawing No', iso.drawing_no],
                          ['Spool', spoolMap[weld.spool_id]],
                          ['Size', weld.size_nps],
                          ['Shop/Field', weld.shop_field],
                          ['System', iso.system],
                          ['PED', weld.ped_category || iso.ped_category],
                        ].map(([l, v]) => (
                          <div key={l}>
                            <span style={metaLbl}>{l}</span>
                            <span style={{ fontSize: 13, color: '#6b7280' }}>{v || '\u2014'}</span>
                          </div>
                        ))}
                      </div>

                      {/* Feedback bar */}
                      <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                        {savingId === weld.id && <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>saving...</span>}
                        {isError && <span style={{ fontSize: 12, color: '#dc2626' }}>Save failed</span>}
                      </div>

                      {/* Editable fields */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
                        {/* Welder */}
                        <div>
                          <span style={lbl}>Welder</span>
                          <select
                            value={weld.welder_id || ''}
                            onChange={(e) => autoSave('weld_log', weld.id, { welder_id: e.target.value || null })}
                            style={fi}
                          >
                            <option value="">-- Select --</option>
                            {welders.map(w => (
                              <option key={w.id} value={w.id}>{w.stamp || w.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* WPS */}
                        <div>
                          <span style={lbl}>WPS</span>
                          <select
                            value={weld.wps_id || ''}
                            onChange={(e) => autoSave('weld_log', weld.id, { wps_id: e.target.value || null })}
                            style={fi}
                          >
                            <option value="">-- Select --</option>
                            {wpsList.map(w => (
                              <option key={w.id} value={w.id}>{w.wps_no}</option>
                            ))}
                          </select>
                        </div>

                        {/* Fit-Up Date */}
                        <div>
                          <span style={lbl}>Fit-Up Date</span>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="date"
                              value={weld.fit_up_date ? String(weld.fit_up_date).split('T')[0] : ''}
                              onChange={(e) => autoSave('weld_log', weld.id, { fit_up_date: e.target.value || null })}
                              style={{ ...fi, flex: 1 }}
                            />
                            <button
                              onClick={() => autoSave('weld_log', weld.id, { fit_up_date: todayStr() })}
                              style={bSmall}
                            >
                              Today
                            </button>
                          </div>
                        </div>

                        {/* Weld Date */}
                        <div>
                          <span style={lbl}>Weld Date</span>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="date"
                              value={weld.weld_date ? String(weld.weld_date).split('T')[0] : ''}
                              onChange={(e) => autoSave('weld_log', weld.id, { weld_date: e.target.value || null })}
                              style={{ ...fi, flex: 1 }}
                            />
                            <button
                              onClick={() => autoSave('weld_log', weld.id, { weld_date: todayStr() })}
                              style={bSmall}
                            >
                              Today
                            </button>
                          </div>
                        </div>

                        {/* Welded toggle */}
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <button
                            onClick={() => {
                              const newWelded = !weld.welded;
                              const updates = { welded: newWelded };
                              if (newWelded && !weld.weld_date) updates.weld_date = todayStr();
                              autoSave('weld_log', weld.id, updates);
                            }}
                            style={{
                              ...bPri,
                              background: weld.welded ? '#059669' : 'var(--color-primary)',
                              padding: '8px 20px', fontSize: 13, fontWeight: 600,
                            }}
                          >
                            {weld.welded ? '\u2713 Welded' : 'Mark Welded'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Multi-select floating bar */}
        {multiMode && selected.size > 0 && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: '#1e293b', color: '#fff', borderRadius: 'var(--radius-lg)',
            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)', zIndex: 100, fontSize: 13,
          }}>
            <span style={{ fontWeight: 600 }}>{selected.size} selected</span>
            <select value={bulkWelder} onChange={(e) => setBulkWelder(e.target.value)} style={{ ...fi, width: 140, color: '#000' }}>
              <option value="">Welder...</option>
              {welders.map(w => <option key={w.id} value={w.id}>{w.stamp || w.name}</option>)}
            </select>
            <select value={bulkWps} onChange={(e) => setBulkWps(e.target.value)} style={{ ...fi, width: 140, color: '#000' }}>
              <option value="">WPS...</option>
              {wpsList.map(w => <option key={w.id} value={w.id}>{w.wps_no}</option>)}
            </select>
            <button onClick={applyBulk} style={{ ...bPri, background: '#22c55e' }}>Apply</button>
          </div>
        )}

        {/* bottom spacer for floating bar */}
        {multiMode && <div style={{ height: 80 }} />}
      </div>
    </div>
  );
}

