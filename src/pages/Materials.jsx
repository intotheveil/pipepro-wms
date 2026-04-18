import { Fragment, useEffect, useState, useMemo, useCallback } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// =============================================================================
// HELPERS
// =============================================================================

function has(val, term) {
  return (val || '').toLowerCase().includes(term);
}

function pct(count, total) {
  if (!total) return null;
  return Math.round((count / total) * 100);
}

function pctColor(p) {
  if (p === null || p === undefined) return '#9ca3af';
  if (p <= 33) return '#ef4444';
  if (p <= 66) return '#f59e0b';
  if (p <= 99) return '#eab308';
  return '#22c55e';
}

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

function AvailBar({ label, count, total }) {
  const p = pct(count, total);
  if (total === 0) return <span style={{ fontSize: 11, color: '#9ca3af' }}>{'\u2014'}</span>;
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${p}%`, height: '100%', background: pctColor(p), borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: pctColor(p), whiteSpace: 'nowrap' }}>
          {count}/{total}
        </span>
      </div>
    </div>
  );
}

function ScopeBadge({ scope }) {
  const isFab = scope === 'fab';
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600,
      background: isFab ? '#dbeafe' : '#fef3c7',
      color: isFab ? '#1e40af' : '#92400e',
    }}>
      {isFab ? 'FAB' : 'ERE'}
    </span>
  );
}

function MatchBadge({ catalogueId, partNo, confidence }) {
  if (!catalogueId) {
    return <span style={{ ...badge, background: '#fee2e2', color: '#991b1b' }}>Unmatched</span>;
  }
  return (
    <span style={{ fontSize: 12, color: '#065f46' }}>
      {partNo || 'Linked'}
      {confidence != null && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>({Math.round(confidence * 100)}%)</span>}
    </span>
  );
}

function ErrorBanner({ error, onRetry }) {
  return (
    <div style={{ padding: 'var(--space-md)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
      <span style={{ fontSize: 13, color: '#991b1b', flex: 1 }}>Failed to load: {error}</span>
      <button onClick={onRetry} style={{ ...bSec, fontSize: 12, padding: '4px 12px' }}>Retry</button>
    </div>
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function Materials() {
  const project = useProject();
  const [activeTab, setActiveTab] = useState('bom');

  const tabs = [
    { id: 'bom', label: 'BOM by ISO' },
    { id: 'catalogue', label: 'Catalogue' },
    { id: 'deliveries', label: 'Deliveries' },
    { id: 'allocation', label: 'Allocation' },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-lg) var(--space-xl)', height: '100%', overflow: 'auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Material Management</h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{project.name}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--color-border)', marginBottom: 'var(--space-lg)' }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '10px var(--space-lg)', background: 'none', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              marginBottom: -2, fontSize: 14,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? '#3b82f6' : 'var(--color-text-secondary)',
              cursor: 'pointer', transition: 'color var(--transition-fast), border-color var(--transition-fast)',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'bom' && <BomByIsoTab project={project} />}
        {activeTab === 'catalogue' && <CatalogueTab project={project} />}
        {activeTab === 'deliveries' && <DeliveriesTab project={project} />}
        {activeTab === 'allocation' && <AllocationTab />}
      </div>
    </div>
  );
}

// =============================================================================
// TAB 1 — BOM BY ISO
// =============================================================================

function BomByIsoTab({ project }) {
  const [isoRows, setIsoRows] = useState([]);
  const [bomRows, setBomRows] = useState([]);
  const [catMap, setCatMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // filters
  const [search, setSearch] = useState('');
  const [fScope, setFScope] = useState('');
  const [fSystem, setFSystem] = useState('');
  const [fMatch, setFMatch] = useState('');

  // delivery totals by catalogue_id (for position-level delivered display)
  const [deliveryByCat, setDeliveryByCat] = useState({});

  function doFetch() {
    let c = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const sb = getSupabase();
        const pid = project.id;
        const [avail, bom, cat, delItems] = await Promise.all([
          fetchAll(sb.from('materials_iso_availability').select('*').eq('project_id', pid)),
          fetchAll(sb.from('materials_bom').select('id, iso_id, pos, scope, description, nd, qty_raw, qty_num, qty_unit, catalogue_id, match_confidence').eq('project_id', pid).eq('is_current', true)),
          fetchAll(sb.from('materials_catalogue').select('id, part_no, description').eq('project_id', pid)),
          fetchAll(sb.from('materials_delivery_items').select('catalogue_id, qty')),
        ]);
        if (!c) {
          setIsoRows(avail);
          setBomRows(bom);
          setCatMap(Object.fromEntries(cat.map(r => [r.id, r])));
          // Sum delivered qty by catalogue_id
          const dMap = {};
          for (const di of delItems) {
            if (di.catalogue_id) dMap[di.catalogue_id] = (dMap[di.catalogue_id] || 0) + (Number(di.qty) || 0);
          }
          setDeliveryByCat(dMap);
        }
      } catch (err) {
        console.error('[Materials/BomByIsoTab]', err);
        if (!c) setError(err.message || String(err));
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => { c = true; };
  }

  useEffect(doFetch, [project.id]);

  // Systems for filter dropdown
  const systemOptions = useMemo(() => {
    const s = new Set();
    for (const r of isoRows) if (r.system) s.add(r.system);
    return [...s].sort();
  }, [isoRows]);

  // Filter + search
  const term = search.toLowerCase();
  const filtered = useMemo(() => isoRows.filter(r => {
    if (term && !(has(r.fast_no, term) || has(r.drawing_no, term) || has(r.system, term))) return false;
    if (fScope === 'fab' && r.fab_total === 0) return false;
    if (fScope === 'erection' && r.erect_total === 0) return false;
    if (fSystem && r.system !== fSystem) return false;
    return true;
  }), [isoRows, term, fScope, fSystem]);

  // Sort by fast_no ASC (numeric)
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    return (parseInt(a.fast_no) || 0) - (parseInt(b.fast_no) || 0);
  }), [filtered]);

  // BOM rows for expanded ISO
  const expandedBom = useMemo(() => {
    if (!expandedId) return [];
    let rows = bomRows.filter(r => r.iso_id === expandedId);
    if (fScope) rows = rows.filter(r => r.scope === fScope);
    if (fMatch === 'matched') rows = rows.filter(r => r.catalogue_id);
    if (fMatch === 'unmatched') rows = rows.filter(r => !r.catalogue_id);
    return rows.sort((a, b) => a.pos - b.pos);
  }, [expandedId, bomRows, fScope, fMatch]);

  if (error) return <ErrorBanner error={error} onRetry={doFetch} />;
  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>;

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search FN, drawing, system\u2026" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ ...iSt, width: 260 }} />
        <select value={fScope} onChange={(e) => setFScope(e.target.value)} style={sSt}>
          <option value="">All Scopes</option>
          <option value="fab">Fab only</option>
          <option value="erection">Erection only</option>
        </select>
        <select value={fSystem} onChange={(e) => setFSystem(e.target.value)} style={sSt}>
          <option value="">All Systems</option>
          {systemOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fMatch} onChange={(e) => setFMatch(e.target.value)} style={sSt}>
          <option value="">All Match</option>
          <option value="matched">Matched</option>
          <option value="unmatched">Unmatched</option>
        </select>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
        {sorted.length} of {isoRows.length} ISOs with BOM
      </p>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflowX: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
        <table style={{ minWidth: 1200, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              {['FN', 'Drawing', 'System', 'Pos', 'Fab: Proc', 'Fab: Del', 'Fab: Alloc', 'Ere: Proc', 'Ere: Del', 'Ere: Alloc', ''].map(h => (
                <th key={h} style={{ ...th, position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>No ISOs match filters</td></tr>
            ) : sorted.map(row => {
              const isExpanded = expandedId === row.iso_id;
              const totalPos = row.fab_total + row.erect_total;
              return (
                <Fragment key={row.iso_id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : row.iso_id)}
                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background 0.15s', background: isExpanded ? 'var(--color-bg)' : 'transparent' }}
                    onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'var(--color-bg)'; }}
                    onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ ...td, fontWeight: 600 }}>{row.fast_no}</td>
                    <td style={td}>{row.drawing_no || '\u2014'}</td>
                    <td style={td}>{row.system || '\u2014'}</td>
                    <td style={td}>{totalPos}</td>
                    {/* Fab */}
                    <td style={td}><AvailBar label="" count={row.fab_procured} total={row.fab_total} /></td>
                    <td style={td}><AvailBar label="" count={row.fab_delivered} total={row.fab_total} /></td>
                    <td style={td}><AvailBar label="" count={row.fab_allocated} total={row.fab_total} /></td>
                    {/* Erection */}
                    <td style={td}><AvailBar label="" count={row.erect_procured} total={row.erect_total} /></td>
                    <td style={td}><AvailBar label="" count={row.erect_delivered} total={row.erect_total} /></td>
                    <td style={td}><AvailBar label="" count={row.erect_allocated} total={row.erect_total} /></td>
                    <td style={td}>
                      <span style={{ fontSize: 14, color: 'var(--color-text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>&#9654;</span>
                    </td>
                  </tr>

                  {/* Expanded BOM positions */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={11} style={{ background: '#f8fafc', borderBottom: '2px solid var(--color-border)', padding: 'var(--space-md) var(--space-lg)' }}>
                        {expandedBom.length === 0 ? (
                          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No positions match current filters.</p>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                {['Pos', 'Scope', 'Description', 'ND', 'Qty', 'Match', 'Procured', 'Delivered', 'Allocated'].map(h => (
                                  <th key={h} style={{ ...th, fontSize: 10 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {expandedBom.map(b => {
                                const cat = catMap[b.catalogue_id];
                                const delivered = b.catalogue_id ? (deliveryByCat[b.catalogue_id] || 0) : 0;
                                const qtyNeeded = b.qty_num || 0;
                                const procured = cat ? (cat.qty_ordered || 0) : 0;
                                return (
                                  <tr key={b.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={td}>{b.pos}</td>
                                    <td style={td}><ScopeBadge scope={b.scope} /></td>
                                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 300, wordBreak: 'break-word' }}>{b.description || '\u2014'}</td>
                                    <td style={td}>{b.nd || '\u2014'}</td>
                                    <td style={td}>{b.qty_raw || '\u2014'}</td>
                                    <td style={td}><MatchBadge catalogueId={b.catalogue_id} partNo={cat?.part_no} confidence={b.match_confidence} /></td>
                                    <td style={td}>{qtyNeeded ? `${procured} / ${qtyNeeded}` : '\u2014'}</td>
                                    <td style={td}>{qtyNeeded ? `${delivered} / ${qtyNeeded}` : '\u2014'}</td>
                                    <td style={td}>{qtyNeeded ? `0 / ${qtyNeeded}` : '\u2014'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
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
  );
}

// =============================================================================
// TAB 2 — CATALOGUE
// =============================================================================

function CatalogueTab({ project }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // filters
  const [search, setSearch] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fToken, setFToken] = useState('');
  const [fShortStock, setFShortStock] = useState(false);

  function doFetch() {
    let c = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const sb = getSupabase();
        const data = await fetchAll(
          sb.from('materials_catalogue_availability').select('*').eq('project_id', project.id).order('part_no')
        );
        if (!c) setRows(data);
      } catch (err) {
        console.error('[Materials/CatalogueTab]', err);
        if (!c) setError(err.message || String(err));
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => { c = true; };
  }

  useEffect(doFetch, [project.id]);

  const categoryOptions = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows]);
  const tokenOptions = useMemo(() => [...new Set(rows.map(r => r.long_code_system_token).filter(Boolean))].sort(), [rows]);

  const term = search.toLowerCase();
  const filtered = useMemo(() => rows.filter(r => {
    if (term && !(has(r.part_no, term) || has(r.description, term))) return false;
    if (fCategory && r.category !== fCategory) return false;
    if (fToken && r.long_code_system_token !== fToken) return false;
    if (fShortStock && !((r.qty_delivered || 0) < (r.qty_ordered || 0))) return false;
    return true;
  }), [rows, term, fCategory, fToken, fShortStock]);

  function exportCsv() {
    const header = ['part_no', 'description', 'nd', 'category', 'system_token', 'qty_ordered', 'qty_delivered', 'qty_allocated', 'qty_available'];
    const lines = [header.join(',')];
    for (const r of filtered) {
      lines.push([
        `"${r.part_no || ''}"`, `"${(r.description || '').replace(/"/g, '""')}"`,
        `"${r.nd || ''}"`, `"${r.category || ''}"`, `"${r.long_code_system_token || ''}"`,
        r.qty_ordered || 0, r.qty_delivered || 0, r.qty_allocated || 0, r.qty_available || 0,
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${project.code}_catalogue.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <ErrorBanner error={error} onRetry={doFetch} />;
  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>;

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search part_no, description\u2026" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ ...iSt, width: 260 }} />
        <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} style={sSt}>
          <option value="">All Categories</option>
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fToken} onChange={(e) => setFToken(e.target.value)} style={sSt}>
          <option value="">All Systems</option>
          {tokenOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={fShortStock} onChange={(e) => setFShortStock(e.target.checked)} />
          Short stock only
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={exportCsv} style={bSec}>Export CSV</button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
        {filtered.length} of {rows.length} items
      </p>

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflowX: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
        <table style={{ minWidth: 1100, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              {['Part No', 'Description', 'ND', 'Category', 'System', 'Ordered', 'Delivered', 'Allocated', 'Available'].map(h => (
                <th key={h} style={{ ...th, position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>No results</td></tr>
            ) : filtered.map(r => {
              const isShort = (r.qty_delivered || 0) < (r.qty_ordered || 0);
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...td, fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{r.part_no}</td>
                  <td style={{ ...td, whiteSpace: 'normal', maxWidth: 280, wordBreak: 'break-word' }}>{r.description || '\u2014'}</td>
                  <td style={td}>{r.nd || '\u2014'}</td>
                  <td style={td}>{r.category || '\u2014'}</td>
                  <td style={td}>{r.long_code_system_token || '\u2014'}</td>
                  <td style={td}>{r.qty_ordered ?? '\u2014'}</td>
                  <td style={{ ...td, color: isShort ? '#ef4444' : 'inherit', fontWeight: isShort ? 600 : 'normal' }}>{r.qty_delivered}</td>
                  <td style={td}>{r.qty_allocated}</td>
                  <td style={td}>{r.qty_available || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// =============================================================================
// TAB 3 — DELIVERIES
// =============================================================================

function DeliveriesTab({ project }) {
  const [deliveries, setDeliveries] = useState([]);
  const [items, setItems] = useState([]);
  const [catMap, setCatMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  function doFetch() {
    let c = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const sb = getSupabase();
        const pid = project.id;
        const [delData, itemData, catData] = await Promise.all([
          fetchAll(sb.from('materials_deliveries').select('*').eq('project_id', pid).order('delivery_date', { ascending: false })),
          fetchAll(sb.from('materials_delivery_items').select('*')),
          fetchAll(sb.from('materials_catalogue').select('id, part_no').eq('project_id', pid)),
        ]);
        if (!c) {
          setDeliveries(delData);
          setItems(itemData);
          setCatMap(Object.fromEntries(catData.map(r => [r.id, r.part_no])));
        }
      } catch (err) {
        console.error('[Materials/DeliveriesTab]', err);
        if (!c) setError(err.message || String(err));
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => { c = true; };
  }

  useEffect(doFetch, [project.id]);

  // Group items by delivery_id
  const itemsByDelivery = useMemo(() => {
    const m = {};
    for (const it of items) {
      if (!m[it.delivery_id]) m[it.delivery_id] = [];
      m[it.delivery_id].push(it);
    }
    return m;
  }, [items]);

  if (error) return <ErrorBanner error={error} onRetry={doFetch} />;
  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>;

  if (deliveries.length === 0) {
    return (
      <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>No deliveries found.</p>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Import a delivery/NOI from the Import page.</p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflowX: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
      <table style={{ minWidth: 900, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            {['PO', 'NOI #', 'Date', 'Supplier', 'Status', 'Items', 'Matched', 'Unmatched', ''].map(h => (
              <th key={h} style={{ ...th, position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deliveries.map(del => {
            const isExpanded = expandedId === del.id;
            const delItems = itemsByDelivery[del.id] || [];
            const matched = delItems.filter(i => i.catalogue_id).length;
            const unmatched = delItems.length - matched;

            return (
              <Fragment key={del.id}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : del.id)}
                  style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background 0.15s', background: isExpanded ? 'var(--color-bg)' : 'transparent' }}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'var(--color-bg)'; }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ ...td, fontWeight: 600 }}>{del.po_no}</td>
                  <td style={td}>{del.noi_no || '\u2014'}</td>
                  <td style={td}>{del.delivery_date || '\u2014'}</td>
                  <td style={td}>{del.supplier || '\u2014'}</td>
                  <td style={td}>
                    <span style={{ ...badge, background: del.status === 'accepted' ? '#dcfce7' : del.status === 'rejected' ? '#fee2e2' : '#dbeafe', color: del.status === 'accepted' ? '#065f46' : del.status === 'rejected' ? '#991b1b' : '#1e40af' }}>
                      {del.status || 'received'}
                    </span>
                  </td>
                  <td style={td}>{delItems.length}</td>
                  <td style={td}>{matched}</td>
                  <td style={td}>
                    {unmatched > 0 ? (
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>{unmatched}</span>
                    ) : (
                      <span style={{ color: '#22c55e' }}>0</span>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 14, color: 'var(--color-text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>&#9654;</span>
                  </td>
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={9} style={{ background: '#f8fafc', borderBottom: '2px solid var(--color-border)', padding: 'var(--space-md) var(--space-lg)' }}>
                      {delItems.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No line items.</p>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                              {['Item Code', 'Description', 'Qty', 'Match', 'Heat No', 'Origin'].map(h => (
                                <th key={h} style={{ ...th, fontSize: 10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {delItems.map(it => (
                              <tr key={it.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{it.item_code || '\u2014'}</td>
                                <td style={{ ...td, whiteSpace: 'normal', maxWidth: 300, wordBreak: 'break-word' }}>{it.description || '\u2014'}</td>
                                <td style={td}>{it.qty ?? '\u2014'}</td>
                                <td style={td}>
                                  {it.catalogue_id ? (
                                    <span style={{ fontSize: 12, color: '#065f46' }}>{catMap[it.catalogue_id] || 'Linked'}</span>
                                  ) : (
                                    <span style={{ ...badge, background: '#fee2e2', color: '#991b1b' }}>Unmatched</span>
                                  )}
                                </td>
                                <td style={td}>{it.heat_number || '\u2014'}</td>
                                <td style={td}>{it.manufacturer_origin || '\u2014'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// TAB 4 — ALLOCATION (placeholder)
// =============================================================================

function AllocationTab() {
  return (
    <div style={{
      padding: 'var(--space-xl)', background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', textAlign: 'center',
    }}>
      <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
        Material Allocation Engine
      </p>
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', maxWidth: 480, margin: '0 auto' }}>
        Coming in Phase 5. This will automatically assign delivered materials to ISOs based on priority, workfront readiness, and stock availability.
      </p>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const th = {
  textAlign: 'left', padding: '10px var(--space-md)', fontWeight: 600,
  fontSize: 11, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap',
};
const td = {
  padding: '10px var(--space-md)', whiteSpace: 'nowrap',
};
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
const badge = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 12,
  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
};
