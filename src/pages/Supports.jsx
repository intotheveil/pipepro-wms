import React, { useEffect, useState, useMemo } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { utils, writeFile } from 'xlsx';

// -- Helpers ------------------------------------------------------------------

const FITUP_PLUS = ['fitup', 'welded', 'inspected', 'painted', 'complete'];
const WELDED_PLUS = ['welded', 'inspected', 'painted', 'complete'];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDD(v) {
  if (!v) return '';
  const d = String(v).split('T')[0];
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}`;
}

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

function has(val, term) {
  return (val || '').toLowerCase().includes(term);
}

// =============================================================================
// MAIN
// =============================================================================

export default function Supports() {
  const project = useProject();

  // data
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // lookup maps
  const [isoMap, setIsoMap]       = useState({});
  const [welderMap, setWelderMap] = useState({});
  const [welders, setWelders]     = useState([]);
  const [isoList, setIsoList]     = useState([]);

  // filters
  const [search, setSearch]         = useState('');
  const [fEidos, setFEidos]         = useState('');
  const [fIso, setFIso]             = useState('');
  const [fStatusRange, setFStatusRange] = useState('');   // 'welded' | 'fitup' | 'not_started'
  const [fShopField, setFShopField] = useState('');       // 'shop' | 'field' | ''

  // expand / save states
  const [expandedMark, setExpandedMark] = useState(null);
  const [savingId, setSavingId]         = useState(null);
  const [flashId, setFlashId]           = useState(null);
  const [errorId, setErrorId]           = useState(null);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const pid = project.id;

      const [supData, isoData, welderData] = await Promise.all([
        fetchAll(sb.from('supports_list').select('*').eq('project_id', pid).order('support_mark')),
        fetchAll(sb.from('iso_register').select('id, drawing_no').eq('project_id', pid)),
        fetchAll(sb.from('welders').select('id, stamp, name').eq('project_id', pid)),
      ]);

      if (!c) {
        setRows(supData);
        setIsoMap(Object.fromEntries(isoData.map((r) => [r.id, r.drawing_no])));
        setIsoList(isoData);
        setWelderMap(Object.fromEntries(welderData.map((r) => [r.id, r.stamp || r.name])));
        setWelders(welderData);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // -- derived values ---------------------------------------------------------

  const eidosOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.eidos).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const isoOptions = useMemo(() => {
    const ids = new Set(rows.map((r) => r.iso_id).filter(Boolean));
    return isoList.filter((iso) => ids.has(iso.id)).sort((a, b) => a.drawing_no.localeCompare(b.drawing_no));
  }, [rows, isoList]);

  // -- filter -----------------------------------------------------------------

  const term = search.toLowerCase();
  const filtered = rows.filter((r) => {
    if (term && !(
      has(r.support_mark, term) || has(r.eidos, term) || has(r.notes, term) ||
      has(isoMap[r.iso_id], term)
    )) return false;
    if (fEidos && r.eidos !== fEidos) return false;
    if (fIso && r.iso_id !== fIso) return false;
    if (fStatusRange === 'welded' && !WELDED_PLUS.includes(r.status)) return false;
    if (fStatusRange === 'fitup' && !(FITUP_PLUS.includes(r.status) && !WELDED_PLUS.includes(r.status))) return false;
    if (fStatusRange === 'not_started' && r.status !== 'not_started') return false;
    if (fShopField === 'shop' && (r.shop_field === 'field' || r.is_field === true)) return false;
    if (fShopField === 'field' && r.shop_field !== 'field' && r.is_field !== true) return false;
    return true;
  });

  // -- summary cards ----------------------------------------------------------

  const summary = useMemo(() => {
    const shop = rows.filter((r) => r.shop_field !== 'field' && r.is_field !== true);
    const field = rows.filter((r) => r.shop_field === 'field' || r.is_field === true);

    function calc(arr) {
      const totalKg = arr.reduce((s, r) => s + (Number(r.weight_kg) || 0), 0);
      const fitupItems = arr.filter((r) => FITUP_PLUS.includes(r.status));
      const weldedItems = arr.filter((r) => WELDED_PLUS.includes(r.status));
      const fitupKg = fitupItems.reduce((s, r) => s + (Number(r.weight_kg) || 0), 0);
      const weldedKg = weldedItems.reduce((s, r) => s + (Number(r.weight_kg) || 0), 0);
      return {
        totalKg,
        fitupCount: fitupItems.length,
        fitupKg,
        fitupPct: totalKg > 0 ? (fitupKg / totalKg) * 100 : 0,
        weldedCount: weldedItems.length,
        weldedKg,
        weldedPct: totalKg > 0 ? (weldedKg / totalKg) * 100 : 0,
      };
    }

    return { shop: calc(shop), field: calc(field) };
  }, [rows]);

  // -- grouping ---------------------------------------------------------------

  const groups = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const key = r.support_mark || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.entries()].map(([mark, items]) => ({ mark, items }));
  }, [filtered]);

  // -- autosave ---------------------------------------------------------------

  async function autoSave(rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase()
      .from('supports_list').update(updates).eq('id', rowId);
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

  // -- export -----------------------------------------------------------------

  function exportXlsx() {
    const out = filtered.map((r) => ({
      'Support Mark': r.support_mark,
      'Eidos': r.eidos,
      'ISO': isoMap[r.iso_id] || '',
      'Shop/Field': r.shop_field,
      'Qty': r.qty,
      'Weight (kg)': r.weight_kg,
      'Welder': welderMap[r.welder_id] || '',
      'Fit-up Date': fmtDate(r.fitup_date),
      'Weld Date': fmtDate(r.weld_date),
      'Paint Date': fmtDate(r.paint_date),
      'Installed Date': fmtDate(r.installed_date),
      'Status': r.status,
      'Is Field': r.is_field ? 'Y' : 'N',
      'Notes': r.notes,
    }));
    const ws = utils.json_to_sheet(out);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Supports List');
    writeFile(wb, `${project.code}_Supports_List.xlsx`);
  }

  // -- render -----------------------------------------------------------------

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-lg) var(--space-xl)', height: '100%', overflow: 'auto' }}>

        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                       marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Supports List</h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{project.name}</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button onClick={exportXlsx} style={bSec}>Export</button>
          </div>
        </div>

        {/* summary cards */}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
            <SummaryCard title="SHOP" data={summary.shop} />
            <SummaryCard title="FIELD" data={summary.field} />
          </div>
        )}

        {/* filters */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search mark, eidos, notes\u2026"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...iSt, width: 220 }} />
          <select value={fEidos} onChange={(e) => setFEidos(e.target.value)} style={sSt}>
            <option value="">All Eidos</option>
            {eidosOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={fIso} onChange={(e) => setFIso(e.target.value)} style={sSt}>
            <option value="">All ISOs</option>
            {isoOptions.map((iso) => <option key={iso.id} value={iso.id}>{iso.drawing_no}</option>)}
          </select>

          {/* status toggle buttons */}
          <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            {[
              { key: 'welded', label: 'Welded' },
              { key: 'fitup', label: 'Fit-up only' },
              { key: 'not_started', label: 'Not started' },
            ].map((btn) => (
              <button key={btn.key}
                onClick={() => setFStatusRange(prev => prev === btn.key ? '' : btn.key)}
                style={{
                  padding: '6px 14px', fontSize: 12, cursor: 'pointer', border: 'none',
                  borderRight: '1px solid var(--color-border)',
                  background: fStatusRange === btn.key ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: fStatusRange === btn.key ? '#fff' : 'var(--color-text)',
                  fontWeight: fStatusRange === btn.key ? 600 : 400,
                }}
              >{btn.label}</button>
            ))}
          </div>

          {/* shop/field toggle */}
          <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            {[
              { key: '', label: 'All' },
              { key: 'shop', label: 'Shop' },
              { key: 'field', label: 'Field' },
            ].map((btn) => (
              <button key={btn.key}
                onClick={() => setFShopField(btn.key)}
                style={{
                  padding: '6px 14px', fontSize: 12, cursor: 'pointer', border: 'none',
                  borderRight: '1px solid var(--color-border)',
                  background: fShopField === btn.key ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: fShopField === btn.key ? '#fff' : 'var(--color-text)',
                  fontWeight: fShopField === btn.key ? 600 : 400,
                }}
              >{btn.label}</button>
            ))}
          </div>
        </div>

        {/* body */}
        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
              {groups.length} groups &middot; {filtered.length} of {rows.length} supports
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0,
                           background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                           borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {groups.length === 0 ? (
                <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No results match your filters
                </div>
              ) : groups.map((g) => (
                <GroupRow
                  key={g.mark}
                  group={g}
                  isoMap={isoMap}
                  welders={welders}
                  welderMap={welderMap}
                  expanded={expandedMark === g.mark}
                  onToggle={() => setExpandedMark(prev => prev === g.mark ? null : g.mark)}
                  autoSave={autoSave}
                  savingId={savingId}
                  flashId={flashId}
                  errorId={errorId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SUMMARY CARD
// =============================================================================

function SummaryCard({ title, data }) {
  return (
    <div style={{
      flex: 1, background: '#fff', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>{data.totalKg.toLocaleString()} kg</div>

      {/* fit-up row */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span>Fit-up: {data.fitupCount} items &middot; {data.fitupKg.toLocaleString()} kg</span>
          <span style={{ fontWeight: 600 }}>{data.fitupPct.toFixed(1)}%</span>
        </div>
        <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(data.fitupPct, 100)}%`, background: '#f59e0b', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* welded row */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span>Welded: {data.weldedCount} items &middot; {data.weldedKg.toLocaleString()} kg</span>
          <span style={{ fontWeight: 600 }}>{data.weldedPct.toFixed(1)}%</span>
        </div>
        <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(data.weldedPct, 100)}%`, background: '#22c55e', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// GROUP ROW
// =============================================================================

function GroupRow({ group, isoMap, welders, welderMap, expanded, onToggle, autoSave, savingId, flashId, errorId }) {
  const { mark, items } = group;

  // group stats
  const isoId = items[0]?.iso_id;
  const isoDraw = isoMap[isoId] || null;
  const eidos = items[0]?.eidos || null;
  const fieldCount = items.filter((r) => r.is_field).length;
  const weldedCount = items.filter((r) => WELDED_PLUS.includes(r.status)).length;
  const totalCount = items.length;
  const fitupCount = items.filter((r) => FITUP_PLUS.includes(r.status)).length;
  const notes = items.find((r) => r.notes)?.notes || null;

  const pctWelded = totalCount > 0 ? (weldedCount / totalCount) * 100 : 0;
  const pctFitup = totalCount > 0 ? (fitupCount / totalCount) * 100 : 0;

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* collapsed header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px var(--space-md)',
          cursor: 'pointer', transition: 'background 0.15s',
          background: expanded ? '#f0f4ff' : 'transparent',
        }}
        onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = 'var(--color-bg)'; }}
        onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
      >
        {/* support mark */}
        <span style={{ fontWeight: 600, fontSize: 14, minWidth: 80 }}>{mark}</span>

        {/* ISO badge */}
        {isoDraw && (
          <span style={{ ...tagStyle, background: '#f3f4f6', color: '#374151' }}>{isoDraw}</span>
        )}

        {/* Eidos tag */}
        {eidos && (
          <span style={{ ...tagStyle, background: '#ede9fe', color: '#5b21b6' }}>{eidos}</span>
        )}

        {/* Field badge */}
        {fieldCount > 0 && (
          <span style={{ ...tagStyle, background: '#dbeafe', color: '#1e40af' }}>F {fieldCount}</span>
        )}

        {/* spacer */}
        <div style={{ flex: 1 }} />

        {/* progress */}
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', marginRight: 8 }}>
          {weldedCount}/{totalCount} welded
        </span>
        <div style={{ width: 80, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
          {/* amber fitup layer (behind green) */}
          <div style={{ position: 'relative', height: '100%' }}>
            <div style={{ position: 'absolute', height: '100%', width: `${Math.min(pctFitup, 100)}%`, background: '#f59e0b', borderRadius: 3 }} />
            <div style={{ position: 'absolute', height: '100%', width: `${Math.min(pctWelded, 100)}%`, background: '#22c55e', borderRadius: 3 }} />
          </div>
        </div>

        {/* arrow */}
        <span style={{ fontSize: 14, color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', marginLeft: 4 }}>&#9654;</span>
      </div>

      {/* expanded area */}
      {expanded && (
        <div style={{ background: '#f8fafc', borderTop: '1px solid var(--color-border)', padding: 'var(--space-md)' }}>
          {/* notes */}
          {notes && (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)', fontStyle: 'italic' }}>
              {notes}
            </div>
          )}

          {/* component cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((row) => (
              <ComponentCard
                key={row.id}
                row={row}
                isoMap={isoMap}
                welders={welders}
                welderMap={welderMap}
                autoSave={autoSave}
                isSaving={savingId === row.id}
                isFlash={flashId === row.id}
                isError={errorId === row.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// COMPONENT CARD
// =============================================================================

function ComponentCard({ row, isoMap, welders, welderMap, autoSave, isSaving, isFlash, isError }) {
  const cardBg = isFlash ? '#dcfce7' : isError ? '#fef2f2' : '#fff';
  const cardBorder = isError ? '1px solid #ef4444' : '1px solid var(--color-border)';

  function handleFitup() {
    if (row.fitup_date) {
      // clear fitup
      autoSave(row.id, { fitup_date: null, status: 'not_started' });
    } else {
      autoSave(row.id, { fitup_date: todayStr(), status: 'fitup' });
    }
  }

  function handleWeld() {
    if (row.weld_date) {
      // clear weld
      const newStatus = row.fitup_date ? 'fitup' : 'not_started';
      autoSave(row.id, { weld_date: null, status: newStatus });
    } else {
      autoSave(row.id, { weld_date: todayStr(), status: 'welded' });
    }
  }

  function handleField() {
    autoSave(row.id, { is_field: !row.is_field });
  }

  // button styles
  const fitupActive = !!row.fitup_date;
  const weldActive = !!row.weld_date;
  const fieldActive = !!row.is_field;

  const fitupBtnStyle = fitupActive
    ? { ...actionBtn, background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }
    : { ...actionBtn };

  const weldBtnStyle = weldActive
    ? { ...actionBtn, background: '#d1fae5', borderColor: '#22c55e', color: '#065f46' }
    : { ...actionBtn };

  const fieldBtnStyle = fieldActive
    ? { ...actionBtn, background: '#dbeafe', borderColor: '#1e40af', color: '#1e40af' }
    : { ...actionBtn };

  return (
    <div style={{
      background: cardBg, border: cardBorder, borderRadius: 'var(--radius-md)',
      padding: '10px 14px', transition: 'background 0.3s',
    }}>
      {/* top line: info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{row.support_mark}</span>
        {row.eidos && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.eidos}</span>}
        {row.qty != null && row.weight_kg != null && (
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {row.qty} &times; {Number(row.weight_kg).toLocaleString()} kg
          </span>
        )}
        {row.shop_field && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{row.shop_field}</span>
        )}
        {isSaving && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>saving...</span>}
        {isError && <span style={{ fontSize: 11, color: '#ef4444' }}>Save failed</span>}
      </div>

      {/* action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handleFitup} style={fitupBtnStyle}>
          {fitupActive ? `\u2713 Fit-up ${fmtDD(row.fitup_date)}` : 'Fit-up'}
        </button>
        <button onClick={handleWeld} style={weldBtnStyle}>
          {weldActive ? `\u2713 Weld ${fmtDD(row.weld_date)}` : 'Weld'}
        </button>
        <button onClick={handleField} style={fieldBtnStyle}>
          F
        </button>

        {/* welder dropdown */}
        <select
          value={row.welder_id || ''}
          onChange={(e) => autoSave(row.id, { welder_id: e.target.value || null })}
          style={{ ...welderSelect }}
        >
          <option value="">Welder</option>
          {welders.map((w) => (
            <option key={w.id} value={w.id}>{w.stamp || w.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// =============================================================================
// TINY COMPONENTS
// =============================================================================

function Empty() {
  return (
    <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                  textAlign: 'center' }}>
      <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
        No supports found.
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        Import data or add supports manually.
      </p>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const iSt = {
  padding: 'var(--space-sm) var(--space-md)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  fontSize: 13, outline: 'none', background: 'var(--color-surface)',
};

const sSt = {
  padding: 'var(--space-sm) var(--space-md)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  fontSize: 13, outline: 'none', background: 'var(--color-surface)', cursor: 'pointer',
};

const bSec = {
  padding: '8px var(--space-lg)', background: 'var(--color-surface)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  fontSize: 13, cursor: 'pointer',
};

const tagStyle = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 10,
  fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
};

const actionBtn = {
  padding: '4px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-secondary)', transition: 'all 0.15s',
};

const welderSelect = {
  padding: '4px 8px', fontSize: 12, borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  outline: 'none', cursor: 'pointer', marginLeft: 'auto',
};
