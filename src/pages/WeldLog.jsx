import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { utils, writeFile } from 'xlsx';

// -- Helpers ------------------------------------------------------------------

function todayStr() { return new Date().toISOString().split('T')[0]; }

function fmtDDMM(v) {
  if (!v) return '';
  const d = String(v).split('T')[0];
  const parts = d.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}/${parts[1]}`;
}

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

function has(val, term) {
  return (val || '').toLowerCase().includes(term);
}

// -- Status dot colors --------------------------------------------------------

const DOT_COLORS = {
  not_started:  '#9ca3af',
  fit_up:       '#f59e0b',
  welded:       '#22c55e',
  ndt_pending:  '#15803d',
  accepted:     '#15803d',
  rejected:     '#ef4444',
  repaired:     '#ef4444',
};

// -- Sorting ------------------------------------------------------------------

function sortWelds(a, b) {
  const idA = a.weld_id || '';
  const idB = b.weld_id || '';
  const fnA = parseInt(idA.match(/FN(\d+)/)?.[1] || idA.match(/(\d+)/)?.[1] || '0');
  const fnB = parseInt(idB.match(/FN(\d+)/)?.[1] || idB.match(/(\d+)/)?.[1] || '0');
  if (fnA !== fnB) return fnA - fnB;
  const sfA = idA.includes('_S') ? 0 : 1;
  const sfB = idB.includes('_S') ? 0 : 1;
  if (sfA !== sfB) return sfA - sfB;
  const numA = parseInt(idA.match(/_[SF](\d+)/)?.[1] || '0');
  const numB = parseInt(idB.match(/_[SF](\d+)/)?.[1] || '0');
  return numA - numB;
}

// =============================================================================
// MAIN
// =============================================================================

export default function WeldLog() {
  const project = useProject();
  const { projectSlug } = useParams();
  const navigate = useNavigate();

  // data
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [isoMap, setIsoMap]       = useState({});   // id → drawing_no
  const [isoByDrawing, setIsoByDrawing] = useState({}); // drawing_no → { id, drawing_file_url }
  const [spoolMap, setSpoolMap]   = useState({});
  const [wpsMap, setWpsMap]       = useState({});
  const [welderMap, setWelderMap] = useState({});
  const [welders, setWelders]     = useState([]);
  const [wpsList, setWpsList]     = useState([]);

  // filters
  const [search, setSearch]         = useState('');
  const [fStatus, setFStatus]       = useState('');
  const [fShopField, setFShopField] = useState('');
  const [fWelder, setFWelder]       = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // inline editing
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId]     = useState(null);
  const [flashId, setFlashId]       = useState(null);
  const [errorId, setErrorId]       = useState(null);

  // select mode
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkWelder, setBulkWelder]   = useState('');
  const [bulkWps, setBulkWps]         = useState('');

  // NDT modals
  const [ndtReqModal, setNdtReqModal] = useState(false);
  const [ndtRepModal, setNdtRepModal] = useState(false);
  const [toast, setToast]             = useState(null);

  // Repair modal
  const [repairTarget, setRepairTarget] = useState(null); // weld row to repair
  const [repairId, setRepairId]         = useState('');
  const [repairReason, setRepairReason] = useState('');

  // Penalty modal
  const [penaltyTarget, setPenaltyTarget]     = useState(null);
  const [penaltySelected, setPenaltySelected] = useState(new Set());
  const [penaltyReason, setPenaltyReason]     = useState('');
  const [penaltySearch, setPenaltySearch]     = useState('');

  // Penalty data
  const [penalties, setPenalties] = useState([]);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const pid = project.id;

      const [weldData, isoData, spoolData, wpsData, welderData, penaltyData] = await Promise.all([
        fetchAll(sb.from('weld_log').select('*').eq('project_id', pid).order('weld_id')),
        fetchAll(sb.from('iso_register').select('id, drawing_no, drawing_file_url').eq('project_id', pid)),
        fetchAll(sb.from('spools').select('id, spool_no').eq('project_id', pid)),
        fetchAll(sb.from('wps_list').select('id, wps_no').eq('project_id', pid)),
        fetchAll(sb.from('welders').select('id, stamp, name').eq('project_id', pid)),
        fetchAll(sb.from('weld_penalties').select('*').eq('project_id', pid)).catch(() => []),
      ]);

      if (!c) {
        setRows(weldData);
        setIsoMap(Object.fromEntries(isoData.map((r) => [r.id, r.drawing_no])));
        setIsoByDrawing(Object.fromEntries(isoData.map((r) => [r.drawing_no, r])));
        setSpoolMap(Object.fromEntries(spoolData.map((r) => [r.id, r.spool_no])));
        setWpsMap(Object.fromEntries(wpsData.map((r) => [r.id, r.wps_no])));
        setWelderMap(Object.fromEntries(welderData.map((r) => [r.id, r.stamp || r.name])));
        setWelders(welderData);
        setWpsList(wpsData);
        setPenalties(penaltyData);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // -- filter + sort ----------------------------------------------------------

  const term = search.toLowerCase();
  const filtered = rows.filter((r) => {
    if (term && !(
      has(r.weld_id, term) || has(r.material_1, term) || has(r.notes, term) ||
      has(r.size_nps, term) || has(isoMap[r.iso_id], term) ||
      has(spoolMap[r.spool_id], term) || has(welderMap[r.welder_id], term)
    )) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (fShopField && (r.shop_field || '').toLowerCase() !== fShopField) return false;
    if (fWelder && r.welder_id !== fWelder) return false;
    return true;
  });

  const sorted = useMemo(() => [...filtered].sort(sortWelds), [filtered]);

  // -- stats ------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = rows.length;
    const welded = rows.filter((r) => r.welded).length;
    const fitUp = rows.filter((r) => r.status === 'fit_up').length;
    const accepted = rows.filter((r) => r.status === 'accepted').length;
    const rejected = rows.filter((r) => r.status === 'rejected').length;
    return { total, welded, fitUp, accepted, rejected };
  }, [rows]);

  // -- autosave ---------------------------------------------------------------

  async function autoSave(rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase()
      .from('weld_log').update(updates).eq('id', rowId);
    if (!error) {
      setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, ...updates } : r));
      setFlashId(rowId);
      setTimeout(() => setFlashId(null), 600);
    } else {
      setErrorId(rowId);
      setTimeout(() => setErrorId(null), 3000);
    }
    setSavingId(null);
  }

  // -- batch save (select mode) -----------------------------------------------

  async function batchSave(updates) {
    if (selectedIds.size === 0) return;
    setSavingId('batch');
    const sb = getSupabase();
    for (const id of selectedIds) {
      await sb.from('weld_log').update(updates).eq('id', id);
    }
    setRows((prev) => prev.map((r) => selectedIds.has(r.id) ? { ...r, ...updates } : r));
    setSavingId(null);
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkWelder('');
    setBulkWps('');
  }

  async function createNdtRequests(form) {
    setSavingId('batch');
    const sb = getSupabase();
    const inserts = [...selectedIds].map((id) => ({
      project_id: project.id,
      weld_id: id,
      method: form.method,
      requested_date: form.requested_date || todayStr(),
      technician: form.subcontractor || null,
      result: 'PENDING',
      notes: form.notes || null,
    }));
    const { error } = await sb.from('ndt_register').insert(inserts);
    setSavingId(null);
    setNdtReqModal(false);
    if (!error) {
      setToast(`${inserts.length} NDT requests created`);
      setTimeout(() => setToast(null), 3000);
      setSelectedIds(new Set());
      setSelectMode(false);
    }
  }

  async function createNdtReports(form) {
    setSavingId('batch');
    const sb = getSupabase();
    const inserts = [...selectedIds].map((id) => ({
      project_id: project.id,
      weld_id: id,
      method: form.method,
      report_no: form.report_no || null,
      technician: form.technician || null,
      examined_date: form.examined_date || todayStr(),
      result: form.result || 'PENDING',
      defect_code: form.defect_code || null,
    }));
    const { error } = await sb.from('ndt_register').insert(inserts);
    setSavingId(null);
    setNdtRepModal(false);
    if (!error) {
      setToast(`${inserts.length} NDT reports created`);
      setTimeout(() => setToast(null), 3000);
      setSelectedIds(new Set());
      setSelectMode(false);
    }
  }

  // -- repair weld -------------------------------------------------------------

  function openRepairModal(row) {
    const suffix = (row.reject_count || 0) + 1;
    setRepairTarget(row);
    setRepairId(`${row.weld_id}_R${suffix}`);
    setRepairReason('');
  }

  async function createRepair() {
    if (!repairTarget || !repairId) return;
    setSavingId('repair');
    const sb = getSupabase();
    const r = repairTarget;

    // Create new repair weld
    const { data: inserted, error: insErr } = await sb.from('weld_log').insert({
      project_id: project.id,
      weld_id: repairId,
      iso_id: r.iso_id,
      spool_id: r.spool_id,
      shop_field: r.shop_field,
      joint_type: r.joint_type,
      dia_inch: r.dia_inch,
      thickness: r.thickness,
      status: 'not_started',
      welded: false,
      notes: `Repair of ${r.weld_id}. Reason: ${repairReason || 'N/A'}`,
    }).select();

    if (!insErr) {
      // Update original weld to rejected
      await sb.from('weld_log').update({
        status: 'rejected',
        reject_count: (r.reject_count || 0) + 1,
      }).eq('id', r.id);

      // Refresh local state
      setRows((prev) => {
        const updated = prev.map((w) => w.id === r.id
          ? { ...w, status: 'rejected', reject_count: (w.reject_count || 0) + 1 }
          : w);
        if (inserted?.[0]) updated.push(inserted[0]);
        return updated;
      });

      setToast(`Repair weld ${repairId} created`);
      setTimeout(() => setToast(null), 3000);
    }

    setRepairTarget(null);
    setSavingId(null);
  }

  // -- penalty welds ----------------------------------------------------------

  function openPenaltyModal(row) {
    setPenaltyTarget(row);
    setPenaltySelected(new Set());
    setPenaltyReason('');
    setPenaltySearch('');
  }

  async function createPenalty() {
    if (!penaltyTarget || penaltySelected.size === 0) return;
    setSavingId('penalty');
    const sb = getSupabase();

    // Find original weld (the one that was rejected)
    const originalId = rows.find((w) => w.weld_id === penaltyTarget.weld_id)?.id;

    // Create penalty record
    await sb.from('weld_penalties').insert({
      project_id: project.id,
      repair_weld_id: penaltyTarget.id,
      original_weld_id: originalId || penaltyTarget.id,
      penalty_weld_ids: [...penaltySelected],
      penalty_count: penaltySelected.size,
      reason: penaltyReason || null,
    });

    // Create NDT requests for each penalty weld
    const ndtInserts = [...penaltySelected].map((weldId) => ({
      project_id: project.id,
      weld_id: weldId,
      method: 'RT',
      requested_date: todayStr(),
      result: 'PENDING',
      notes: `Penalty NDT from repair ${penaltyTarget.weld_id}`,
    }));
    await sb.from('ndt_register').insert(ndtInserts);

    // Refresh penalties
    const penaltyData = await fetchAll(sb.from('weld_penalties').select('*').eq('project_id', project.id)).catch(() => []);
    setPenalties(penaltyData);

    setToast(`${penaltySelected.size} penalty welds added`);
    setTimeout(() => setToast(null), 3000);
    setPenaltyTarget(null);
    setSavingId(null);
  }

  // -- penalty lookup ---------------------------------------------------------

  const penaltyCountMap = useMemo(() => {
    const map = {};
    for (const p of penalties) {
      if (p.penalty_weld_ids) {
        for (const wid of p.penalty_weld_ids) {
          map[wid] = (map[wid] || 0) + 1;
        }
      }
    }
    return map;
  }, [penalties]);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // -- export -----------------------------------------------------------------

  function exportXlsx(all) {
    const data = all ? rows : sorted;
    const out = data.map((r) => ({
      'Weld ID': r.weld_id,
      'ISO Drawing': isoMap[r.iso_id] || '',
      'Spool': spoolMap[r.spool_id] || '',
      'Joint Type': r.joint_type,
      'Shop/Field': r.shop_field,
      'Size (NPS)': r.size_nps,
      'Dia (in)': r.dia_inch,
      'Thickness': r.thickness,
      'Material 1': r.material_1,
      'Welder': welderMap[r.welder_id] || '',
      'WPS': wpsMap[r.wps_id] || '',
      'Fit-Up Date': fmtDate(r.fit_up_date),
      'Weld Date': fmtDate(r.weld_date),
      'Welded': r.welded ? 'Y' : 'N',
      'Status': r.status,
      'Notes': r.notes,
    }));
    const ws = utils.json_to_sheet(out);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Weld Log');
    writeFile(wb, `${project.code}_Weld_Log.xlsx`);
  }

  // -- status text for row ----------------------------------------------------

  function statusText(r) {
    if (r.status === 'accepted') return 'Accepted';
    if (r.status === 'rejected') return 'Rejected';
    if (r.status === 'repaired') return 'Repaired';
    if (r.status === 'ndt_pending') return 'NDT Pending';
    if (r.welded || r.status === 'welded') {
      const stamp = welderMap[r.welder_id] || '';
      return `${stamp}${stamp ? ' \u00b7 ' : ''}welded ${fmtDDMM(r.weld_date)}`;
    }
    if (r.status === 'fit_up' || r.fit_up_date) {
      return `Fit-up \u00b7 ${fmtDDMM(r.fit_up_date)}`;
    }
    return 'Not started';
  }

  function statusTextColor(r) {
    if (r.status === 'rejected' || r.status === 'repaired') return '#ef4444';
    if (r.status === 'accepted' || r.status === 'ndt_pending') return '#15803d';
    if (r.welded || r.status === 'welded') return '#22c55e';
    if (r.status === 'fit_up') return '#f59e0b';
    return '#9ca3af';
  }

  // -- extract FN badge -------------------------------------------------------

  function fnNumber(weldId) {
    if (!weldId) return null;
    const m = weldId.match(/FN(\d+)/i);
    if (m) return `FN${m[1]}`;
    // Fallback: extract leading number group (e.g. "101_S1" → "101")
    const n = weldId.match(/^(\d+)/);
    return n ? `FN${n[1]}` : null;
  }

  // -- render -----------------------------------------------------------------

  return (
    <div style={{ padding: 'var(--space-lg) var(--space-xl)', height: '100%', overflow: 'auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Weld Log</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {stats.total} joints &middot; {stats.welded} welded &middot; {stats.fitUp} fit-up
        </p>
      </div>

      {/* Stats cards */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
          <StatCard label="Total Joints" value={stats.total} />
          <StatCard label="Welded" value={stats.welded} color="var(--color-primary)" />
          <StatCard label="Accepted" value={stats.accepted} color="#059669" />
          <StatCard label="Rejected" value={stats.rejected}
            color={stats.rejected > 0 ? '#dc2626' : 'var(--color-text-muted)'} />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
        {!selectMode ? (
          <>
            <button onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }}
              style={btnOutline}>Select</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => exportXlsx(false)} style={btnOutline}>Export view</button>
            <button onClick={() => exportXlsx(true)} style={btnOutline}>Export all</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{'\u2713'} {selectedIds.size} selected</span>
            <button onClick={() => setSelectedIds(new Set(sorted.map((r) => r.id)))} style={btnOutline}>All</button>
            <div style={{ borderLeft: '1px solid var(--color-border)', height: 20 }} />
            <select value={bulkWelder} onChange={(e) => { setBulkWelder(e.target.value); if (e.target.value) batchSave({ welder_id: e.target.value }); }}
              style={selSm}>
              <option value="">Set Welder</option>
              {welders.map((w) => <option key={w.id} value={w.id}>{w.stamp || w.name}</option>)}
            </select>
            <select value={bulkWps} onChange={(e) => { setBulkWps(e.target.value); if (e.target.value) batchSave({ wps_id: e.target.value }); }}
              style={selSm}>
              <option value="">Set WPS</option>
              {wpsList.map((w) => <option key={w.id} value={w.id}>{w.wps_no}</option>)}
            </select>
            <button onClick={() => batchSave({ welded: true, weld_date: todayStr() })} style={btnPri}>
              Mark Welded
            </button>
            <div style={{ borderLeft: '1px solid var(--color-border)', height: 20 }} />
            <button onClick={() => setNdtReqModal(true)} style={btnOutline} disabled={selectedIds.size === 0}>
              NDT Request
            </button>
            <button onClick={() => setNdtRepModal(true)} style={btnOutline} disabled={selectedIds.size === 0}>
              NDT Report
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => exportXlsx(false)} style={btnOutline}>Export view</button>
            <button onClick={() => exportXlsx(true)} style={btnOutline}>Export all</button>
            <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} style={btnOutline}>
              Clear
            </button>
          </>
        )}
      </div>

      {/* Search */}
      <input type="text" placeholder="Search weld, drawing, welder, spool..."
        value={search} onChange={(e) => setSearch(e.target.value)}
        style={{ ...inputSt, width: '100%', marginBottom: 'var(--space-sm)' }} />

      {/* Filter toggle */}
      <button onClick={() => setShowFilters((v) => !v)}
        style={{ ...btnOutline, marginBottom: 'var(--space-sm)', fontSize: 12 }}>
        Filters {showFilters ? '\u25B4' : '\u25BE'}
      </button>

      {/* Filter panel */}
      {showFilters && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 'var(--space-md)',
          display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div>
            <span style={filterLabel}>PRODUCTION</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={selSm}>
                <option value="">All statuses</option>
                <option value="not_started">Not started</option>
                <option value="fit_up">Fit-up</option>
                <option value="welded">Welded</option>
                <option value="ndt_pending">NDT Pending</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="repaired">Repaired</option>
              </select>
              <select value={fShopField} onChange={(e) => setFShopField(e.target.value)} style={selSm}>
                <option value="">Shop + Field</option>
                <option value="shop">Shop</option>
                <option value="field">Field</option>
              </select>
              <select value={fWelder} onChange={(e) => setFWelder(e.target.value)} style={selSm}>
                <option value="">All welders</option>
                {welders.map((w) => <option key={w.id} value={w.id}>{w.stamp || w.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <span style={filterLabel}>NDT REQUEST</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select style={selSm} disabled><option>All</option><option>Requested</option><option>Not requested</option></select>
              <select style={selSm} disabled><option>All methods</option><option>RT</option><option>UT</option><option>PT</option><option>MT</option><option>VT</option></select>
            </div>
          </div>

          <div>
            <span style={filterLabel}>NDT REPORT</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select style={selSm} disabled><option>All</option><option>Accepted</option><option>Rejected</option><option>Pending</option></select>
              <select style={selSm} disabled><option>Any method</option><option>RT</option><option>UT</option><option>PT</option><option>MT</option><option>VT</option></select>
            </div>
          </div>
        </div>
      )}

      {/* Count row */}
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
        Showing {sorted.length} of {rows.length} welds
      </p>

      {/* Body */}
      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
          {sorted.map((row) => (
            <React.Fragment key={row.id}>
              {/* Collapsed row */}
              <div
                onClick={() => selectMode ? toggleSelect(row.id) : setExpandedId((p) => p === row.id ? null : row.id)}
                style={{
                  ...cardRow,
                  background: flashId === row.id ? '#dcfce7'
                    : selectedIds.has(row.id) ? '#eff6ff'
                    : 'transparent',
                  borderLeft: errorId === row.id ? '3px solid #ef4444' : '3px solid transparent',
                }}
                onMouseEnter={(e) => { if (!flashId) e.currentTarget.style.background = selectedIds.has(row.id) ? '#eff6ff' : 'var(--color-bg)'; }}
                onMouseLeave={(e) => { if (!flashId) e.currentTarget.style.background = selectedIds.has(row.id) ? '#eff6ff' : 'transparent'; }}
              >
                {/* Checkbox in select mode */}
                {selectMode && (
                  <input type="checkbox" checked={selectedIds.has(row.id)} readOnly
                    style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
                )}

                {/* Status dot */}
                <span style={dot(DOT_COLORS[row.status] || '#9ca3af')} />

                {/* Weld info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{row.weld_id || '\u2014'}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{row.dia_inch ? `${row.dia_inch}"` : row.size_nps ? `${row.size_nps}"` : ''}</span>
                    {savingId === row.id && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>saving...</span>}
                  </div>
                  <div style={{ fontSize: 12, color: statusTextColor(row), marginTop: 1 }}>
                    {statusText(row)}
                  </div>
                </div>

                {/* Repair badge (this IS a repair weld) */}
                {row.weld_id && /_R\d+$/i.test(row.weld_id) && (
                  <span style={{ ...fnBadgeSt, background: '#fef3c7', color: '#92400e' }}>R</span>
                )}

                {/* Repair count (this weld has been repaired) */}
                {row.reject_count > 0 && (
                  <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500 }}>{row.reject_count} repair{row.reject_count > 1 ? 's' : ''}</span>
                )}

                {/* Penalty badge */}
                {penaltyCountMap[row.id] > 0 && (
                  <span style={{ ...fnBadgeSt, background: '#fff7ed', color: '#c2410c', borderColor: '#fb923c' }}>
                    P:{penaltyCountMap[row.id]}
                  </span>
                )}

                {/* FN badge */}
                {fnNumber(row.weld_id) && (
                  <span style={fnBadgeSt}
                    onClick={(e) => { e.stopPropagation(); const fn = (row.weld_id || '').match(/FN?(\d+)/i); if (fn) navigate(`/p/${projectSlug}/iso/${fn[1]}`); }}>
                    {fnNumber(row.weld_id)}
                  </span>
                )}

                {/* Expand arrow */}
                <span style={{
                  fontSize: 14, color: 'var(--color-text-muted)', transition: 'transform 150ms',
                  transform: expandedId === row.id ? 'rotate(90deg)' : 'rotate(0deg)',
                  flexShrink: 0,
                }}>{'\u203A'}</span>
              </div>

              {/* Expanded panel */}
              {expandedId === row.id && (
                <InlinePanel row={row}
                  isoMap={isoMap} isoByDrawing={isoByDrawing} spoolMap={spoolMap}
                  welders={welders} wpsList={wpsList}
                  welderMap={welderMap} wpsMap={wpsMap}
                  autoSave={autoSave} savingId={savingId}
                  projectSlug={projectSlug}
                  onRepair={() => openRepairModal(row)}
                  onPenalty={() => openPenaltyModal(row)}
                  isRepairWeld={/_R\d+$/i.test(row.weld_id || '')} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* NDT Request Modal */}
      {ndtReqModal && (
        <NdtModal title="NDT Request" onClose={() => setNdtReqModal(false)}
          onSubmit={createNdtRequests} saving={savingId === 'batch'}
          fields={[
            { k: 'method', l: 'Method', t: 'select', opts: ['RT', 'UT', 'PT', 'MT', 'VT'], required: true },
            { k: 'requested_date', l: 'Requested Date', t: 'date', def: todayStr() },
            { k: 'subcontractor', l: 'Subcontractor', t: 'text' },
            { k: 'notes', l: 'Notes', t: 'text' },
          ]}
          count={selectedIds.size} />
      )}

      {/* NDT Report Modal */}
      {ndtRepModal && (
        <NdtModal title="NDT Report" onClose={() => setNdtRepModal(false)}
          onSubmit={createNdtReports} saving={savingId === 'batch'}
          fields={[
            { k: 'method', l: 'Method', t: 'select', opts: ['RT', 'UT', 'PT', 'MT', 'VT'], required: true },
            { k: 'report_no', l: 'Report No', t: 'text' },
            { k: 'technician', l: 'Technician', t: 'text' },
            { k: 'examined_date', l: 'Examined Date', t: 'date', def: todayStr() },
            { k: 'result', l: 'Result', t: 'select', opts: ['ACCEPTED', 'REJECTED', 'REPAIRED'], required: true },
            { k: 'defect_code', l: 'Defect Code', t: 'text', showIf: (f) => f.result === 'REJECTED' || f.result === 'REPAIRED' },
          ]}
          count={selectedIds.size} />
      )}

      {/* Repair Modal */}
      {repairTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setRepairTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)',
            padding: 24, minWidth: 380, maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              Create Repair Weld for {repairTarget.weld_id}
            </h3>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={lbl}>NEW WELD ID</span>
              <input type="text" value={repairId} onChange={(e) => setRepairId(e.target.value)} style={fi} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={lbl}>REPAIR REASON</span>
              <input type="text" value={repairReason} onChange={(e) => setRepairReason(e.target.value)}
                style={fi} placeholder="e.g. RT reject, crack, porosity..." />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRepairTarget(null)} style={btnOutline}>Cancel</button>
              <button onClick={createRepair} disabled={!repairId || savingId === 'repair'}
                style={{ ...btnPri, background: '#ef4444' }}>
                {savingId === 'repair' ? 'Creating...' : 'Create Repair'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Penalty Modal */}
      {penaltyTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setPenaltyTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)',
            padding: 24, minWidth: 480, maxWidth: 560, maxHeight: '80vh', display: 'flex',
            flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Add Penalty Welds for {penaltyTarget.weld_id}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Select welds that require additional NDT due to this repair.
            </p>

            <input type="text" placeholder="Search welds..." value={penaltySearch}
              onChange={(e) => setPenaltySearch(e.target.value)}
              style={{ ...fi, marginBottom: 8 }} />

            <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', maxHeight: 300, marginBottom: 12 }}>
              {rows
                .filter((w) => w.id !== penaltyTarget.id && (!penaltySearch || has(w.weld_id, penaltySearch.toLowerCase())))
                .slice(0, 100)
                .map((w) => (
                  <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderBottom: '1px solid var(--color-border)',
                    cursor: 'pointer', fontSize: 12,
                    background: penaltySelected.has(w.id) ? '#eff6ff' : 'transparent' }}>
                    <input type="checkbox" checked={penaltySelected.has(w.id)}
                      onChange={() => setPenaltySelected((prev) => {
                        const next = new Set(prev);
                        next.has(w.id) ? next.delete(w.id) : next.add(w.id);
                        return next;
                      })} />
                    <span style={{ fontWeight: 500 }}>{w.weld_id}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{isoMap[w.iso_id] || ''}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{w.dia_inch ? `${w.dia_inch}"` : ''}</span>
                    <span style={{ color: DOT_COLORS[w.status] || '#9ca3af' }}>{w.status}</span>
                  </label>
                ))}
            </div>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={lbl}>REASON / NOTES</span>
              <input type="text" value={penaltyReason} onChange={(e) => setPenaltyReason(e.target.value)}
                style={fi} />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {penaltySelected.size} weld{penaltySelected.size !== 1 ? 's' : ''} selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPenaltyTarget(null)} style={btnOutline}>Cancel</button>
                <button onClick={createPenalty} disabled={penaltySelected.size === 0 || savingId === 'penalty'}
                  style={{ ...btnPri, background: '#f97316' }}>
                  {savingId === 'penalty' ? 'Adding...' : `Add ${penaltySelected.size} Penalty`}
                </button>
              </div>
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
  );
}

// =============================================================================
// NDT MODAL
// =============================================================================

function NdtModal({ title, fields, onClose, onSubmit, saving, count }) {
  const [form, setForm] = useState(() => {
    const init = {};
    for (const f of fields) init[f.k] = f.def || '';
    return init;
  });

  function chg(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 'var(--radius-lg)',
        padding: 24, minWidth: 380, maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {title} &mdash; {count} weld{count !== 1 ? 's' : ''}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map((f) => {
            if (f.showIf && !f.showIf(form)) return null;
            return (
              <label key={f.k} style={{ display: 'block' }}>
                <span style={lbl}>{f.l}{f.required ? ' *' : ''}</span>
                {f.t === 'select' ? (
                  <select value={form[f.k]} onChange={(e) => chg(f.k, e.target.value)} style={fi}>
                    <option value="">-- select --</option>
                    {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.t} value={form[f.k]}
                    onChange={(e) => chg(f.k, e.target.value)} style={fi} />
                )}
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnOutline} disabled={saving}>Cancel</button>
          <button onClick={() => onSubmit(form)} style={btnPri}
            disabled={saving || fields.some((f) => f.required && !form[f.k])}>
            {saving ? 'Creating...' : `Create ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// INLINE PANEL
// =============================================================================

function InlinePanel({ row, isoMap, isoByDrawing, spoolMap, welders, wpsList, welderMap, wpsMap, autoSave, savingId, projectSlug, onRepair, onPenalty, isRepairWeld }) {
  const isSaving = savingId === row.id;
  const [pdfHeight, setPdfHeight] = useState(400);

  // Look up ISO drawing data by drawing_no (from isoMap id→drawing_no, then isoByDrawing)
  const drawingNo = isoMap[row.iso_id] || '';
  const iso = drawingNo ? isoByDrawing[drawingNo] : null;
  const fnNum = (row.weld_id || '').match(/FN?(\d+)/i)?.[1];

  // Build signed URL state for PDF viewer
  const [pdfUrl, setPdfUrl] = useState(null);
  useEffect(() => {
    if (!iso?.drawing_file_url) { setPdfUrl(null); return; }
    let cancelled = false;
    (async () => {
      const parts = iso.drawing_file_url.split(':');
      const bucket = parts[0];
      const path = parts.slice(1).join(':');
      const { data } = await getSupabase().storage.from(bucket).createSignedUrl(path, 3600);
      if (!cancelled && data?.signedUrl) setPdfUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [iso?.drawing_file_url]);

  function handleWelded() {
    if (row.welded) {
      autoSave(row.id, { welded: false });
    } else {
      autoSave(row.id, { welded: true, weld_date: row.weld_date || todayStr() });
    }
  }

  return (
    <div style={{ background: '#f8fafc', borderTop: '1px solid var(--color-border)',
      borderBottom: '1px solid var(--color-border)', padding: 16 }}>

      {/* Drawing preview */}
      {iso?.drawing_file_url ? (
        <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden',
          border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 10px', background: '#f1f5f9',
            borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{drawingNo}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setPdfHeight((h) => h === 400 ? 600 : h === 600 ? 300 : 400)}
                style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--color-text-muted)',
                  cursor: 'pointer' }}>
                {pdfHeight >= 600 ? '\u25B2 Collapse' : '\u25BC Expand'}
              </button>
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--color-primary)', textDecoration: 'none' }}>
                  {'\u2197'} Open full screen
                </a>
              )}
            </div>
          </div>
          {pdfUrl ? (
            <iframe src={pdfUrl} style={{ width: '100%', height: pdfHeight, border: 'none', display: 'block' }}
              title={drawingNo} />
          ) : (
            <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-muted)', fontSize: 12 }}>Loading drawing...</div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 12, padding: 20, textAlign: 'center',
          background: '#f1f5f9', borderRadius: 8, border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)', fontSize: 12 }}>
          No drawing attached{drawingNo ? ` for ${drawingNo}` : ''}
          {fnNum && (
            <>
              {' \u00b7 '}
              <a href={`/p/${projectSlug}/iso/${fnNum}`}
                style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                Upload on ISO page {'\u2192'}
              </a>
            </>
          )}
        </div>
      )}

      {/* Read-only info */}
      <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--color-text-muted)',
        marginBottom: 12, flexWrap: 'wrap', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        <span>DRAWING: <b style={{ color: 'var(--color-text)' }}>{drawingNo || '\u2014'}</b></span>
        <span>SPOOL: <b style={{ color: 'var(--color-text)' }}>{spoolMap[row.spool_id] || '\u2014'}</b></span>
        <span>SIZE: <b style={{ color: 'var(--color-text)' }}>{row.dia_inch ? `${row.dia_inch}"` : row.size_nps || '\u2014'}</b></span>
        <span>S/F: <b style={{ color: 'var(--color-text)' }}>{row.shop_field || '\u2014'}</b></span>
      </div>

      {/* Editable fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <label style={{ display: 'block' }}>
          <span style={lbl}>WELDER</span>
          <select value={row.welder_id || ''} onChange={(e) => autoSave(row.id, { welder_id: e.target.value || null })}
            style={fi} disabled={isSaving}>
            <option value="">-- select --</option>
            {welders.map((w) => <option key={w.id} value={w.id}>{w.stamp || w.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'block' }}>
          <span style={lbl}>WPS</span>
          <select value={row.wps_id || ''} onChange={(e) => autoSave(row.id, { wps_id: e.target.value || null })}
            style={fi} disabled={isSaving}>
            <option value="">-- select --</option>
            {wpsList.map((w) => <option key={w.id} value={w.id}>{w.wps_no}</option>)}
          </select>
        </label>
        <label style={{ display: 'block' }}>
          <span style={lbl}>FIT-UP DATE</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="date" value={row.fit_up_date || ''}
              onChange={(e) => autoSave(row.id, { fit_up_date: e.target.value || null })}
              style={{ ...fi, flex: 1 }} disabled={isSaving} />
            <button onClick={() => autoSave(row.id, { fit_up_date: todayStr() })}
              style={btnSmall} disabled={isSaving}>Today</button>
          </div>
        </label>
        <label style={{ display: 'block' }}>
          <span style={lbl}>WELD DATE</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="date" value={row.weld_date || ''}
              onChange={(e) => autoSave(row.id, { weld_date: e.target.value || null })}
              style={{ ...fi, flex: 1 }} disabled={isSaving} />
            <button onClick={() => autoSave(row.id, { weld_date: todayStr() })}
              style={btnSmall} disabled={isSaving}>Today</button>
          </div>
        </label>
      </div>

      {/* Welded toggle */}
      <button onClick={handleWelded} disabled={isSaving}
        style={{
          width: '100%', padding: '10px 16px', borderRadius: 'var(--radius-md)',
          border: row.welded ? '2px solid #22c55e' : '2px solid var(--color-border)',
          background: row.welded ? '#dcfce7' : 'var(--color-surface)',
          color: row.welded ? '#15803d' : 'var(--color-text-secondary)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          transition: 'all 150ms',
        }}>
        {row.welded ? '\u2713 Welded' : 'Mark Welded'}
      </button>

      {/* Repair + Penalty buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onRepair} disabled={isSaving}
          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            border: '1px solid #ef4444', borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: '#ef4444' }}>
          Repair
        </button>
        {isRepairWeld && (
          <button onClick={onPenalty} disabled={isSaving}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px solid #f97316', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: '#f97316' }}>
            Penalty
          </button>
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
    <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
      textAlign: 'center' }}>
      <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
        No welds found.
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        Import data or add welds manually.
      </p>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const cardRow = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
  cursor: 'pointer', transition: 'background 150ms',
};

const dot = (color) => ({
  width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0,
});

const fnBadgeSt = {
  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  background: '#dbeafe', color: '#1e40af', cursor: 'pointer', flexShrink: 0,
};

const inputSt = {
  padding: 'var(--space-sm) var(--space-md)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  fontSize: 13, outline: 'none', background: 'var(--color-surface)',
};

const selSm = {
  padding: '4px 8px', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none',
  background: 'var(--color-surface)', cursor: 'pointer',
};

const btnOutline = {
  padding: '6px 14px', background: 'var(--color-surface)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  fontSize: 12, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
};

const btnPri = {
  padding: '6px 14px', background: 'var(--color-primary)', color: '#fff',
  border: 'none', borderRadius: 'var(--radius-md)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
};

const btnSmall = {
  padding: '4px 10px', fontSize: 11, fontWeight: 500,
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', whiteSpace: 'nowrap',
};

const filterLabel = {
  display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
};

const lbl = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em',
};

const fi = {
  width: '100%', padding: '8px var(--space-sm)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  fontSize: 13, outline: 'none',
};
