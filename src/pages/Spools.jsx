import { Fragment, useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { utils, writeFile } from 'xlsx';
import { generateDimCheck, generatePaintRelease, generateSiteRelease } from '../lib/qcForms';

// -- Pipeline bar -------------------------------------------------------------

const STAGES = [
  { bool: 'material_checked', date: 'material_check_date' },
  { bool: 'fab_started',      date: 'fab_start_date' },
  { bool: 'fabricated',       date: 'fabricated_date' },
  { bool: 'qc_released',     date: 'qc_release_date' },
  { bool: 'sent_to_paint',   date: 'sent_to_paint_date' },
  { bool: 'painted',         date: 'painted_date' },
  { bool: 'at_laydown',      date: 'laydown_date' },
  { bool: 'erected',         date: 'erected_date' },
];

const EDIT_STAGES = [
  { label: 'Material Checked', bool: 'material_checked', date: 'material_check_date', report: 'mat_check_report' },
  { label: 'Fab Started',      bool: 'fab_started',      date: 'fab_start_date',      report: 'fab_started_report' },
  { label: 'Fabricated',       bool: 'fabricated',        date: 'fabricated_date',      report: 'fabricated_report' },
  { label: 'QC Released',      bool: 'qc_released',      date: 'qc_release_date',     report: 'qc_released_report' },
  { label: 'Sent to Paint',    bool: 'sent_to_paint',    date: 'sent_to_paint_date',  report: 'paint_report' },
  { label: 'Painted',          bool: 'painted',           date: 'painted_date',         report: 'painted_report' },
  { label: 'At Laydown',       bool: 'at_laydown',        date: 'laydown_date',         report: 'laydown_report' },
  { label: 'Erected',          bool: 'erected',           date: 'erected_date',         report: 'erected_report' },
];

const PIPELINE_LETTERS = [
  { bool: 'material_checked', report: 'mat_check_report',    letter: 'M' },
  { bool: 'fab_started',      report: 'fab_started_report',  letter: 'F' },
  { bool: 'fabricated',       report: 'fabricated_report',   letter: 'W' },
  { bool: 'qc_released',     report: 'qc_released_report',  letter: 'Q' },
  { bool: 'painted',          report: 'painted_report',      letter: 'P' },
  { bool: 'at_laydown',      report: 'laydown_report',       letter: 'L' },
  { bool: 'erected',          report: 'erected_report',      letter: 'E' },
];

function PipelineBadges({ row }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {PIPELINE_LETTERS.map((s) => {
        const done = !!row[s.bool];
        const hasReport = !!row[s.report];
        return (
          <span key={s.letter} style={{
            display: 'inline-block', width: 20, height: 20, lineHeight: '20px',
            textAlign: 'center', borderRadius: 3, fontSize: 10, fontWeight: 600,
            background: done ? (hasReport ? '#15803d' : '#22c55e') : '#e5e7eb',
            color: done ? '#fff' : '#9ca3af',
            position: 'relative',
          }}>
            {s.letter}
            {done && hasReport && (
              <span style={{
                position: 'absolute', top: 1, right: 1,
                width: 5, height: 5, borderRadius: '50%',
                background: '#fff',
              }} />
            )}
          </span>
        );
      })}
    </div>
  );
}

// -- Helpers ------------------------------------------------------------------

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

function stageDate(row, boolKey, dateKey) {
  return row[boolKey] ? fmtDate(row[dateKey]) : '\u2014';
}

function has(val, term) {
  return (val || '').toLowerCase().includes(term);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// -- Stage filter logic -------------------------------------------------------

const STAGE_FILTERS = [
  { k: '',               l: 'All Stages' },
  { k: 'not_started',    l: 'Not Started' },
  { k: 'material_check', l: 'Material Check' },
  { k: 'fab_started',    l: 'Fab Started' },
  { k: 'fabricated',     l: 'Fabricated' },
  { k: 'qc_released',   l: 'QC Released' },
  { k: 'sent_to_paint',  l: 'Sent to Paint' },
  { k: 'painted',        l: 'Painted' },
  { k: 'at_laydown',     l: 'At Laydown' },
  { k: 'erected',        l: 'Erected' },
];

function currentStage(r) {
  if (r.erected)          return 'erected';
  if (r.at_laydown)       return 'at_laydown';
  if (r.painted)          return 'painted';
  if (r.sent_to_paint)    return 'sent_to_paint';
  if (r.qc_released)     return 'qc_released';
  if (r.fabricated)       return 'fabricated';
  if (r.fab_started)      return 'fab_started';
  if (r.material_checked) return 'material_check';
  return 'not_started';
}

// -- Table columns ------------------------------------------------------------

const COLS = [
  { k: '_fn',                l: 'FN',                w: 60 },
  { k: 'spool_no',          l: 'Spool ID',          w: 100 },
  { k: '_iso',               l: 'ISO Drawing',       w: 180 },
  { k: 'shop_field',        l: 'Shop/Field',        w: 80 },
  { k: '_pipeline',          l: 'Pipeline',          w: 170 },
  { k: '_material_checked',  l: 'Mat Check',         w: 100 },
  { k: '_fab_started',       l: 'Fab Start',         w: 100 },
  { k: '_fabricated',        l: 'Fabricated',         w: 100 },
  { k: '_qc_released',       l: 'QC Rel',            w: 100 },
  { k: '_sent_to_paint',     l: 'To Paint',          w: 100 },
  { k: '_painted',           l: 'Painted',            w: 90 },
  { k: '_at_laydown',        l: 'Laydown',            w: 90 },
  { k: '_erected',           l: 'Erected',            w: 90 },
  { k: 'barcode',           l: 'Barcode',            w: 120 },
  { k: 'notes',             l: 'Notes',              w: 180, wrap: true },
];

// -- inject spinner keyframes once --------------------------------------------
if (typeof document !== 'undefined' && !document.getElementById('_spinkf')) {
  const s = document.createElement('style');
  s.id = '_spinkf';
  s.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

// =============================================================================
// MAIN
// =============================================================================

export default function Spools() {
  const project = useProject();
  const { projectSlug } = useParams();
  const navigate = useNavigate();

  // data
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // lookup maps for FK display
  const [isoMap, setIsoMap] = useState({});       // id → { drawing_no, fast_no }
  const [isoFullMap, setIsoFullMap] = useState({}); // id → full iso object

  // select mode
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [toast, setToast]             = useState(null);
  const [generating, setGenerating]   = useState(false);

  // report ID modal
  const [reportModal, setReportModal] = useState(null); // { stage, report }
  const [reportValue, setReportValue] = useState('');

  // filters
  const [search, setSearch]         = useState('');
  const [fShopField, setFShopField] = useState('');
  const [fStage, setFStage]         = useState('');

  // inline editing
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId]     = useState(null);
  const [flashId, setFlashId]       = useState(null);
  const [errorId, setErrorId]       = useState(null);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const supabase = getSupabase();

      const pid = project.id;
      const [spoolData, isoData] = await Promise.all([
        fetchAll(supabase.from('spools').select('*').eq('project_id', pid).order('spool_no')),
        fetchAll(supabase.from('iso_register').select('id, drawing_no, fast_no, sheet, revision, material').eq('project_id', pid)),
      ]);

      if (!c) {
        setRows(spoolData);
        setIsoMap(Object.fromEntries(isoData.map((r) => [r.id, { drawing_no: r.drawing_no, fast_no: r.fast_no }])));
        setIsoFullMap(Object.fromEntries(isoData.map((r) => [r.id, r])));
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // -- autosave ---------------------------------------------------------------

  async function autoSave(rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase()
      .from('spools').update(updates).eq('id', rowId);
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

  async function batchSetReport() {
    if (!reportModal || !reportValue || selectedIds.size === 0) return;
    setSavingId('batch');
    const sb = getSupabase();
    const updates = { [reportModal.report]: reportValue };
    for (const id of selectedIds) {
      await sb.from('spools').update(updates).eq('id', id);
    }
    setRows(prev => prev.map(r => selectedIds.has(r.id) ? { ...r, ...updates } : r));
    setSavingId(null);
    setReportModal(null);
    setReportValue('');
    setToast(`Report ID set on ${selectedIds.size} spools`);
    setTimeout(() => setToast(null), 3000);
  }

  // -- filter -----------------------------------------------------------------

  const term = search.toLowerCase();
  const filtered = rows.filter((r) => {
    if (term) {
      const iso = isoMap[r.iso_id] || {};
      if (!(
        has(r.spool_no, term) || has(r.barcode, term) || has(r.notes, term) ||
        has(iso.drawing_no, term) || has(iso.fast_no, term)
      )) return false;
    }
    if (fShopField && (r.shop_field || '').toLowerCase() !== fShopField) return false;
    if (fStage && currentStage(r) !== fStage) return false;
    return true;
  });

  // Sort by FN number then spool_no
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const fnA = parseInt(isoMap[a.iso_id]?.fast_no || '0');
    const fnB = parseInt(isoMap[b.iso_id]?.fast_no || '0');
    if (fnA !== fnB) return fnA - fnB;
    return (a.spool_no || '').localeCompare(b.spool_no || '');
  }), [filtered, isoMap]);

  // -- stats ------------------------------------------------------------------

  const stats = useMemo(() => {
    const total     = rows.length;
    const fabricated = rows.filter((r) => r.fabricated).length;
    const qcReleased = rows.filter((r) => r.qc_released).length;
    const painted    = rows.filter((r) => r.painted).length;
    const atLaydown  = rows.filter((r) => r.at_laydown).length;
    const erected    = rows.filter((r) => r.erected).length;
    return { total, fabricated, qcReleased, painted, atLaydown, erected };
  }, [rows]);

  // -- select mode -------------------------------------------------------------

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function getSelectedSpools() {
    return filtered.filter((r) => selectedIds.has(r.id));
  }

  async function handleGenerateQCF(generatorFn) {
    const selected = getSelectedSpools();
    if (selected.length === 0) return;
    setGenerating(true);
    try {
      const { doc, qcfId, blob } = generatorFn(project, selected, isoFullMap, {});
      // Download PDF
      doc.save(`${qcfId}.pdf`);
      // Upload to quality-docs bucket
      const sb = getSupabase();
      const path = `${project.id}/qc-forms/prepared/${qcfId}.pdf`;
      await sb.storage.from('quality-docs').upload(path, blob, { upsert: true });
      setToast('QCF generated and uploaded');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast('Error: ' + (err.message || 'generation failed'));
      setTimeout(() => setToast(null), 4000);
    }
    setGenerating(false);
  }

  // -- export -----------------------------------------------------------------

  function exportXlsx() {
    const out = filtered.map((r) => ({
      'Spool No': r.spool_no,
      'ISO': isoMap[r.iso_id] || '',
      'Shop/Field': r.shop_field,
      'Material Checked': r.material_checked ? 'Y' : 'N',
      'Material Check Date': fmtDate(r.material_check_date),
      'Fab Started': r.fab_started ? 'Y' : 'N',
      'Fab Start Date': fmtDate(r.fab_start_date),
      'Fabricated': r.fabricated ? 'Y' : 'N',
      'Fabricated Date': fmtDate(r.fabricated_date),
      'QC Released': r.qc_released ? 'Y' : 'N',
      'QC Release Date': fmtDate(r.qc_release_date),
      'Sent to Paint': r.sent_to_paint ? 'Y' : 'N',
      'Sent to Paint Date': fmtDate(r.sent_to_paint_date),
      'Painted': r.painted ? 'Y' : 'N',
      'Painted Date': fmtDate(r.painted_date),
      'At Laydown': r.at_laydown ? 'Y' : 'N',
      'Laydown Date': fmtDate(r.laydown_date),
      'Erected': r.erected ? 'Y' : 'N',
      'Erected Date': fmtDate(r.erected_date),
      'Barcode': r.barcode,
      'Notes': r.notes,
    }));
    const ws = utils.json_to_sheet(out);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Spools');
    writeFile(wb, `${project.code}_Spools.xlsx`);
  }

  // -- row click handler ------------------------------------------------------

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
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
            <h1 style={{ fontSize:22, fontWeight:600, marginBottom:2 }}>Spool Tracker</h1>
            <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>{project.name}</p>
          </div>
          <div style={{ display:'flex', gap:'var(--space-sm)', alignItems:'center', flexWrap:'wrap' }}>
            {!selectMode ? (
              <>
                <button onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }} style={bSec}>Select</button>
                <button onClick={exportXlsx} style={bSec}>Export</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{'\u2713'} {selectedIds.size} selected</span>
                <button onClick={() => setSelectedIds(new Set(sorted.map((r) => r.id)))} style={bSec}>All</button>
                <div style={{ borderLeft: '1px solid var(--color-border)', height: 20 }} />
                <button onClick={() => handleGenerateQCF(generateDimCheck)} style={bPri}
                  disabled={selectedIds.size === 0 || generating}>
                  {generating ? 'Generating...' : 'Dim Check'}
                </button>
                <button onClick={() => handleGenerateQCF(generatePaintRelease)} style={bPri}
                  disabled={selectedIds.size === 0 || generating}>
                  Release for Paint
                </button>
                <button onClick={() => handleGenerateQCF(generateSiteRelease)} style={bPri}
                  disabled={selectedIds.size === 0 || generating}>
                  Release for Site
                </button>
                <div style={{ borderLeft: '1px solid var(--color-border)', height: 20 }} />
                <select
                  value=""
                  onChange={(e) => {
                    const stage = EDIT_STAGES.find(s => s.report === e.target.value);
                    if (stage) { setReportModal(stage); setReportValue(''); }
                  }}
                  style={sSt}
                  disabled={selectedIds.size === 0}
                >
                  <option value="">Set Report ID</option>
                  {EDIT_STAGES.map(s => (
                    <option key={s.report} value={s.report}>{s.label}</option>
                  ))}
                </select>
                <div style={{ borderLeft: '1px solid var(--color-border)', height: 20 }} />
                <button onClick={exportXlsx} style={bSec}>Export</button>
                <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} style={bSec}>Clear</button>
              </>
            )}
          </div>
        </div>

        {/* stats row */}
        {!loading && rows.length > 0 && (
          <div style={{ display:'flex', gap:'var(--space-lg)', marginBottom:'var(--space-lg)', flexWrap:'wrap' }}>
            <StatCard label="Total Spools" value={stats.total} />
            <StatCard label="Fabricated" value={stats.fabricated} color="var(--color-primary)" />
            <StatCard label="QC Released" value={stats.qcReleased} color="#3b82f6" />
            <StatCard label="Painted" value={stats.painted} color="#8b5cf6" />
            <StatCard label="At Laydown" value={stats.atLaydown} color="#f59e0b" />
            <StatCard label="Erected" value={stats.erected} color="#059669" />
          </div>
        )}

        {/* filters */}
        <div style={{ display:'flex', gap:'var(--space-sm)', marginBottom:'var(--space-md)', flexWrap:'wrap' }}>
          <input type="text" placeholder="Search spool, barcode, notes\u2026"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...iSt, width:260 }} />
          <select value={fShopField} onChange={(e) => setFShopField(e.target.value)} style={sSt}>
            <option value="">Shop + Field</option>
            <option value="shop">Shop</option>
            <option value="field">Field</option>
          </select>
          <select value={fStage} onChange={(e) => setFStage(e.target.value)} style={sSt}>
            {STAGE_FILTERS.map((sf) => (
              <option key={sf.k} value={sf.k}>{sf.l}</option>
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
              {sorted.length} of {rows.length} spools
            </p>

            <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)',
                           borderRadius:'var(--radius-lg)', overflowX:'auto', width:'100%', maxHeight:'calc(100vh - 300px)' }}>
              <table style={{ minWidth:1800, width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--color-border)', background:'var(--color-bg)' }}>
                    {selectMode && (
                      <th style={{ ...th, minWidth: 40, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}></th>
                    )}
                    {COLS.map((c) => (
                      <th key={c.k} style={{ ...th, minWidth:c.w, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>{c.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr><td colSpan={COLS.length + (selectMode ? 1 : 0)} style={{ padding:'var(--space-lg)', textAlign:'center', color:'var(--color-text-muted)' }}>
                      No results match your filters
                    </td></tr>
                  ) : sorted.map((row) => {
                    const isExpanded = expandedId === row.id;
                    const isFlash = flashId === row.id;
                    const isError = errorId === row.id;
                    const isSaving = savingId === row.id;

                    const isSelected = selectedIds.has(row.id);
                    const rowBg = isFlash
                      ? '#dcfce7'
                      : isError
                        ? '#fef2f2'
                        : isSelected
                          ? '#eff6ff'
                          : 'transparent';
                    const rowBorder = isError ? '2px solid #ef4444' : '1px solid var(--color-border)';

                    return (
                      <Fragment key={row.id}>
                        <tr
                          style={{
                            borderBottom: rowBorder,
                            background: rowBg,
                            transition: 'background 0.3s ease',
                            cursor: 'pointer',
                          }}
                          onClick={() => selectMode ? toggleSelect(row.id) : toggleExpand(row.id)}
                          onMouseEnter={(e) => { if (!isFlash && !isError) e.currentTarget.style.background = isSelected ? '#eff6ff' : 'var(--color-bg)'; }}
                          onMouseLeave={(e) => { if (!isFlash && !isError) e.currentTarget.style.background = isSelected ? '#eff6ff' : 'transparent'; }}
                        >
                          {selectMode && (
                            <td style={td} onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={isSelected} readOnly
                                onClick={() => toggleSelect(row.id)}
                                style={{ width: 16, height: 16, cursor: 'pointer' }} />
                            </td>
                          )}
                          {COLS.map((c) => {
                            // FN column — bold blue link to ISO detail
                            if (c.k === '_fn') {
                              const fn = isoMap[row.iso_id]?.fast_no;
                              return (
                                <td key={c.k} style={td}>
                                  {fn ? (
                                    <span style={{ fontWeight: 600, color: '#1e40af', cursor: 'pointer' }}
                                      onClick={(e) => { e.stopPropagation(); navigate(`/p/${projectSlug}/iso/${fn}`); }}>
                                      {fn}
                                    </span>
                                  ) : '\u2014'}
                                </td>
                              );
                            }

                            // ISO Drawing column
                            if (c.k === '_iso') return <td key={c.k} style={td}>{isoMap[row.iso_id]?.drawing_no || '\u2014'}</td>;

                            // Pipeline badges
                            if (c.k === '_pipeline') return <td key={c.k} style={td}><PipelineBadges row={row} /></td>;

                            // Stage date columns
                            if (c.k === '_material_checked') return <td key={c.k} style={td}>{stageDate(row, 'material_checked', 'material_check_date')}</td>;
                            if (c.k === '_fab_started')      return <td key={c.k} style={td}>{stageDate(row, 'fab_started', 'fab_start_date')}</td>;
                            if (c.k === '_fabricated')        return <td key={c.k} style={td}>{stageDate(row, 'fabricated', 'fabricated_date')}</td>;
                            if (c.k === '_qc_released')       return <td key={c.k} style={td}>{stageDate(row, 'qc_released', 'qc_release_date')}</td>;
                            if (c.k === '_sent_to_paint')     return <td key={c.k} style={td}>{stageDate(row, 'sent_to_paint', 'sent_to_paint_date')}</td>;
                            if (c.k === '_painted')           return <td key={c.k} style={td}>{stageDate(row, 'painted', 'painted_date')}</td>;
                            if (c.k === '_at_laydown')        return <td key={c.k} style={td}>{stageDate(row, 'at_laydown', 'laydown_date')}</td>;
                            if (c.k === '_erected')           return <td key={c.k} style={td}>{stageDate(row, 'erected', 'erected_date')}</td>;

                            const cellSt = c.wrap ? tdWrap : td;
                            return (
                              <td key={c.k} style={cellSt}>
                                {c.k === 'notes' && row.notes
                                  ? <>{'\uD83D\uDCDD'} {row.notes}</>
                                  : row[c.k] != null && row[c.k] !== '' ? row[c.k] : '\u2014'}
                              </td>
                            );
                          })}
                        </tr>

                        {/* Inline edit panel */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={COLS.length + (selectMode ? 1 : 0)} style={{
                              background: '#f8fafc',
                              borderTop: '2px solid var(--color-border)',
                              borderBottom: '1px solid var(--color-border)',
                              padding: 'var(--space-md) var(--space-lg)',
                            }}>
                              <div style={{ maxWidth: 600 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                    Edit Stages &mdash; {row.spool_no}
                                  </span>
                                  {isSaving && (
                                    <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>saving...</span>
                                  )}
                                  {isError && (
                                    <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>Save failed</span>
                                  )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '8px 12px', alignItems: 'center' }}>
                                  {EDIT_STAGES.map((stage) => {
                                    const checked = !!row[stage.bool];
                                    const dateVal = row[stage.date] ? String(row[stage.date]).split('T')[0] : '';
                                    const reportVal = row[stage.report] || '';

                                    return (
                                      <Fragment key={stage.bool}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              if (checked) {
                                                autoSave(row.id, { [stage.bool]: false, [stage.date]: null, [stage.report]: null });
                                              } else {
                                                autoSave(row.id, { [stage.bool]: true, [stage.date]: dateVal || today() });
                                              }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ cursor: 'pointer' }}
                                          />
                                        </label>
                                        <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{stage.label}</span>
                                        <input
                                          type="date"
                                          value={dateVal}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            autoSave(row.id, { [stage.date]: e.target.value || null });
                                          }}
                                          style={{
                                            padding: '4px 8px',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: 12, outline: 'none',
                                            background: '#fff', width: 140,
                                          }}
                                        />
                                        {checked ? (
                                          <input
                                            type="text"
                                            defaultValue={reportVal}
                                            placeholder="Report / Cert ID"
                                            onClick={(e) => e.stopPropagation()}
                                            onBlur={(e) => {
                                              const val = e.target.value;
                                              if (val !== reportVal) {
                                                autoSave(row.id, { [stage.report]: val || null });
                                              }
                                            }}
                                            style={{
                                              padding: '4px 8px',
                                              border: '1px solid var(--color-border)',
                                              borderRadius: 'var(--radius-sm)',
                                              fontSize: 12, outline: 'none',
                                              background: '#fff', width: 160,
                                            }}
                                          />
                                        ) : (
                                          <span />
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </div>

                                {/* Barcode field */}
                                <div style={{ marginTop: 'var(--space-md)', maxWidth: 300 }}>
                                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    Barcode
                                  </label>
                                  <input
                                    type="text"
                                    defaultValue={row.barcode || ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => {
                                      const val = e.target.value;
                                      if (val !== (row.barcode || '')) {
                                        autoSave(row.id, { barcode: val || null });
                                      }
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: 13,
                                      outline: 'none',
                                      background: '#fff',
                                    }}
                                  />
                                </div>

                                {/* Remarks */}
                                <div style={{ marginTop: 'var(--space-md)' }}>
                                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    Remarks
                                  </label>
                                  <textarea
                                    defaultValue={row.notes || ''}
                                    rows={3}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => {
                                      const val = e.target.value;
                                      if (val !== (row.notes || '')) {
                                        autoSave(row.id, { notes: val || null });
                                      }
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: 13,
                                      outline: 'none',
                                      background: '#fff',
                                      resize: 'vertical',
                                      fontFamily: 'inherit',
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {/* Report ID Modal */}
        {reportModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
            onClick={() => setReportModal(null)}>
            <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)',
              padding: 24, minWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
              onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                Set Report ID
              </h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
                Stage: <b>{reportModal.label}</b> &mdash; {selectedIds.size} spool{selectedIds.size !== 1 ? 's' : ''}
              </p>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
                  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Report / Cert ID
                </span>
                <input type="text" value={reportValue} onChange={(e) => setReportValue(e.target.value)}
                  placeholder="e.g. QCF-DIM-001"
                  style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none' }} />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setReportModal(null)} style={bSec}>Cancel</button>
                <button onClick={batchSetReport} disabled={!reportValue || savingId === 'batch'} style={bPri}>
                  {savingId === 'batch' ? 'Applying...' : `Apply to ${selectedIds.size}`}
                </button>
              </div>
            </div>
          </div>
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
        No spools found.
      </p>
      <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>
        Import data to get started.
      </p>
    </div>
  );
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
