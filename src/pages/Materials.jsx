import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { utils, writeFile } from 'xlsx';

// -- Status badges ------------------------------------------------------------

const PL_STATUS_MAP = {
  pending:   { bg: '#e5e7eb', fg: '#6b7280', t: 'Pending' },
  received:  { bg: '#dbeafe', fg: '#1e40af', t: 'Received' },
  inspected: { bg: '#d1fae5', fg: '#065f46', t: 'Inspected' },
};

const RCV_STATUS_MAP = {
  pending:   { bg: '#e5e7eb', fg: '#6b7280', t: 'Pending' },
  inspected: { bg: '#d1fae5', fg: '#065f46', t: 'Inspected' },
  rejected:  { bg: '#fee2e2', fg: '#991b1b', t: 'Rejected' },
};

function StatusBadge({ value, map }) {
  const s = map[value] || map.pending;
  return (
    <span style={{ ...badge, background: s.bg, color: s.fg }}>{s.t}</span>
  );
}

const badge = {
  display: 'inline-block', padding: '2px 10px', borderRadius: 12,
  fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
};

// -- Helpers ------------------------------------------------------------------

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

function has(val, term) {
  return (val || '').toLowerCase().includes(term);
}

function unique(arr, key) {
  return [...new Set(arr.map((r) => r[key]).filter(Boolean))].sort();
}

// -- inject spinner keyframes once --------------------------------------------
if (typeof document !== 'undefined' && !document.getElementById('_spinkf')) {
  const s = document.createElement('style');
  s.id = '_spinkf';
  s.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

function Spin() {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 16,
      border: '2px solid var(--color-border)',
      borderTopColor: 'var(--color-primary)',
      borderRadius: '50%', animation: '_spin .6s linear infinite',
    }} />
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function Materials() {
  const project = useProject();
  const [activeTab, setActiveTab] = useState('bom');

  const tabs = [
    { id: 'bom', label: 'Material List (BOM)' },
    { id: 'packing', label: 'Packing Lists' },
    { id: 'receivings', label: 'Receivings / QC' },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: 'var(--space-lg) var(--space-xl)',
        height: '100%', overflow: 'auto',
      }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                       marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Material Management</h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{project.name}</p>
          </div>
        </div>

        {/* tab bar */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '2px solid var(--color-border)',
          marginBottom: 'var(--space-lg)',
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px var(--space-lg)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                marginBottom: -2,
                fontSize: 14,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? '#3b82f6' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'color var(--transition-fast), border-color var(--transition-fast)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* tab content */}
        {activeTab === 'bom' && <BOMTab project={project} />}
        {activeTab === 'packing' && <PackingTab project={project} />}
        {activeTab === 'receivings' && <ReceivingsTab project={project} />}
      </div>
    </div>
  );
}

// =============================================================================
// TAB 1 — Material List (BOM)
// =============================================================================

function BOMTab({ project }) {
  const [items, setItems] = useState([]);
  const [receivings, setReceivings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fIso, setFIso] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const pid = project.id;
      const [itemsData, rcvData] = await Promise.all([
        fetchAll(sb.from('material_items').select('*').eq('project_id', pid).order('pos')),
        fetchAll(sb.from('material_receivings').select('material_item_id, qty_received').eq('project_id', pid)),
      ]);
      if (!c) {
        setItems(itemsData);
        setReceivings(rcvData);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // compute received sums
  const receivedMap = useMemo(() => {
    const m = {};
    for (const r of receivings) {
      if (r.material_item_id) {
        m[r.material_item_id] = (m[r.material_item_id] || 0) + (Number(r.qty_received) || 0);
      }
    }
    return m;
  }, [receivings]);

  const isoOptions = useMemo(() => unique(items, 'iso_drawing'), [items]);

  const term = search.toLowerCase();
  const filtered = items.filter((r) => {
    if (term && !(has(r.description, term) || has(r.iso_drawing, term) || has(r.pos, term))) return false;
    if (fIso && r.iso_drawing !== fIso) return false;
    return true;
  });

  function exportXlsx() {
    const out = filtered.map((r) => {
      const received = receivedMap[r.id] || 0;
      const remaining = (Number(r.qty_required) || 0) - received;
      return {
        'Pos': r.pos,
        'ISO Drawing': r.iso_drawing,
        'Description': r.description,
        'Size': r.size_nd,
        'Qty Required': r.qty_required,
        'Unit': r.unit,
        'Material Spec': r.material_spec,
        'Received': received,
        'Remaining': remaining,
      };
    });
    const ws = utils.json_to_sheet(out);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Material List');
    writeFile(wb, `${project.code}_Material_List.xlsx`);
  }

  const COLS = [
    { k: 'pos', l: 'Pos', w: 80 },
    { k: 'iso_drawing', l: 'ISO Drawing', w: 140 },
    { k: 'description', l: 'Description', w: 260, wrap: true },
    { k: 'size_nd', l: 'Size', w: 90 },
    { k: 'qty_required', l: 'Qty Required', w: 110 },
    { k: 'unit', l: 'Unit', w: 70 },
    { k: 'material_spec', l: 'Material Spec', w: 160 },
    { k: '_received', l: 'Received', w: 100 },
    { k: '_remaining', l: 'Remaining', w: 100 },
  ];

  return (
    <>
      {/* filters */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search description, ISO, pos..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ ...iSt, width: 260 }} />
        <select value={fIso} onChange={(e) => setFIso(e.target.value)} style={sSt}>
          <option value="">All ISO Drawings</option>
          {isoOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={exportXlsx} style={bSec}>Export</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
      ) : items.length === 0 ? (
        <Empty msg="No material items found." />
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
            {filtered.length} of {items.length} items
          </p>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                         borderRadius: 'var(--radius-lg)', overflowX: 'auto', width: '100%', maxHeight: 'calc(100vh - 340px)' }}>
            <table style={{ minWidth: 1100, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  {COLS.map((c) => (
                    <th key={c.k} style={{ ...th, minWidth: c.w, position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>{c.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={COLS.length} style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No results match your filters
                  </td></tr>
                ) : filtered.map((row) => {
                  const received = receivedMap[row.id] || 0;
                  const remaining = (Number(row.qty_required) || 0) - received;
                  return (
                    <tr key={row.id}
                      style={{ borderBottom: '1px solid var(--color-border)',
                               transition: 'background var(--transition-fast)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {COLS.map((c) => {
                        if (c.k === '_received') return <td key={c.k} style={td}>{received}</td>;
                        if (c.k === '_remaining') return (
                          <td key={c.k} style={{ ...td, color: remaining < 0 ? '#dc2626' : 'inherit', fontWeight: remaining < 0 ? 600 : 'normal' }}>
                            {remaining}
                          </td>
                        );
                        const cellSt = c.wrap ? tdWrap : td;
                        return (
                          <td key={c.k} style={cellSt}>
                            {row[c.k] != null && row[c.k] !== '' ? row[c.k] : '\u2014'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// TAB 2 — Packing Lists
// =============================================================================

function PackingTab({ project }) {
  const [lists, setLists] = useState([]);
  const [plItems, setPlItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [panel, setPanel] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const pid = project.id;
      const [plData, pliData] = await Promise.all([
        fetchAll(sb.from('packing_lists').select('*').eq('project_id', pid).order('received_date', { ascending: false })),
        fetchAll(sb.from('packing_list_items').select('*').eq('project_id', pid)),
      ]);
      if (!c) {
        setLists(plData);
        setPlItems(pliData);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // group items by packing_list_id
  const itemsByPl = useMemo(() => {
    const m = {};
    for (const item of plItems) {
      if (item.packing_list_id) {
        if (!m[item.packing_list_id]) m[item.packing_list_id] = [];
        m[item.packing_list_id].push(item);
      }
    }
    return m;
  }, [plItems]);

  function openAdd() {
    setPanel({
      mode: 'add',
      data: {
        project_id: project.id,
        packing_list_no: '',
        received_date: '',
        supplier: '',
        delivery_note: '',
        notes: '',
        status: 'pending',
      },
    });
  }

  function closePanel() { setPanel(null); }

  async function savePanel() {
    if (!panel) return;
    setSaving(true);
    const supabase = getSupabase();

    if (panel.mode === 'add') {
      const { data, error } = await supabase
        .from('packing_lists').insert(panel.data).select();
      if (!error && data?.length) {
        setLists((p) => [data[0], ...p]);
        closePanel();
      }
    } else {
      const { id, created_at, ...upd } = panel.data;
      const { error } = await supabase
        .from('packing_lists').update(upd).eq('id', id);
      if (!error) {
        setLists((p) => p.map((r) => r.id === id ? { ...r, ...upd } : r));
        closePanel();
      }
    }
    setSaving(false);
  }

  const PL_FIELDS = [
    { k: 'packing_list_no', l: 'Packing List No', t: 'text' },
    { k: 'received_date', l: 'Received Date', t: 'date' },
    { k: 'supplier', l: 'Supplier', t: 'text' },
    { k: 'delivery_note', l: 'Delivery Note', t: 'text' },
    { k: 'notes', l: 'Notes', t: 'text' },
    { k: 'status', l: 'Status', t: 'select', opts: ['pending', 'received', 'inspected'] },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        transition: 'margin-right var(--transition-normal)',
        marginRight: panel ? 400 : 0,
      }}>
        {/* toolbar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-md)' }}>
          <button onClick={openAdd} style={bPri}>New Packing List</button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
        ) : lists.length === 0 ? (
          <Empty msg="No packing lists found." />
        ) : (
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                         borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  <th style={{ ...th, minWidth: 140 }}>PL No</th>
                  <th style={{ ...th, minWidth: 110 }}>Date</th>
                  <th style={{ ...th, minWidth: 140 }}>Supplier</th>
                  <th style={{ ...th, minWidth: 140 }}>Delivery Note</th>
                  <th style={{ ...th, minWidth: 80 }}>Items</th>
                  <th style={{ ...th, minWidth: 110 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {lists.map((pl) => {
                  const isExpanded = expandedId === pl.id;
                  const subItems = itemsByPl[pl.id] || [];
                  return (
                    <React.Fragment key={pl.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : pl.id)}
                        style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer',
                                 transition: 'background var(--transition-fast)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={td}>{pl.packing_list_no || '\u2014'}</td>
                        <td style={td}>{fmtDate(pl.received_date)}</td>
                        <td style={td}>{pl.supplier || '\u2014'}</td>
                        <td style={td}>{pl.delivery_note || '\u2014'}</td>
                        <td style={td}>{subItems.length}</td>
                        <td style={td}><StatusBadge value={pl.status} map={PL_STATUS_MAP} /></td>
                      </tr>
                      {isExpanded && subItems.length > 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div style={{ background: 'var(--color-bg)', padding: 'var(--space-md) var(--space-lg)' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <th style={{ ...th, fontSize: 10 }}>Description</th>
                                    <th style={{ ...th, fontSize: 10 }}>Size</th>
                                    <th style={{ ...th, fontSize: 10 }}>Qty</th>
                                    <th style={{ ...th, fontSize: 10 }}>Heat No</th>
                                    <th style={{ ...th, fontSize: 10 }}>Cert No</th>
                                    <th style={{ ...th, fontSize: 10 }}>Unit</th>
                                    <th style={{ ...th, fontSize: 10 }}>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subItems.map((si) => (
                                    <tr key={si.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                      <td style={td}>{si.description || '\u2014'}</td>
                                      <td style={td}>{si.size_nd || '\u2014'}</td>
                                      <td style={td}>{si.qty_received != null ? si.qty_received : '\u2014'}</td>
                                      <td style={td}>{si.heat_no || '\u2014'}</td>
                                      <td style={td}>{si.cert_no || '\u2014'}</td>
                                      <td style={td}>{si.unit || '\u2014'}</td>
                                      <td style={td}>{si.notes || '\u2014'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                      {isExpanded && subItems.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: 'var(--space-md)', textAlign: 'center',
                                                    color: 'var(--color-text-muted)', fontSize: 12, background: 'var(--color-bg)' }}>
                            No items in this packing list
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* slide-in panel */}
      {panel && (
        <SlidePanel
          title={panel.mode === 'add' ? 'New Packing List' : 'Edit Packing List'}
          fields={PL_FIELDS}
          data={panel.data}
          setData={(fn) => setPanel((p) => ({ ...p, data: typeof fn === 'function' ? fn(p.data) : fn }))}
          onSave={savePanel}
          onClose={closePanel}
          saving={saving}
          statusMap={PL_STATUS_MAP}
        />
      )}
    </div>
  );
}

// =============================================================================
// TAB 3 — Receivings / QC
// =============================================================================

function ReceivingsTab({ project }) {
  const [rows, setRows] = useState([]);
  const [matItems, setMatItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const pid = project.id;
      const [rcvData, matData] = await Promise.all([
        fetchAll(sb.from('material_receivings').select('*').eq('project_id', pid).order('received_date', { ascending: false })),
        fetchAll(sb.from('material_items').select('id, description').eq('project_id', pid)),
      ]);
      if (!c) {
        setRows(rcvData);
        setMatItems(matData);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  const matMap = useMemo(() => Object.fromEntries((matItems).map((r) => [r.id, r.description])), [matItems]);

  const term = search.toLowerCase();
  const filtered = rows.filter((r) => {
    if (term && !(
      has(matMap[r.material_item_id], term) || has(r.heat_no, term) ||
      has(r.cert_no, term) || has(r.inspector, term) || has(r.notes, term)
    )) return false;
    if (fStatus && r.status !== fStatus) return false;
    return true;
  });

  function autoSave(id, field, value) {
    // Update local state immediately
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));

    // Debounced save to DB
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const supabase = getSupabase();
      await supabase.from('material_receivings').update({ [field]: value }).eq('id', id);
    }, 600);
  }

  async function handleCertUpload(row, file) {
    setUploadingId(row.id);
    const supabase = getSupabase();
    const path = `${project.id}/material-certs/${file.name}`;

    const { error: upErr } = await supabase.storage
      .from('quality-docs').upload(path, file, { upsert: true });

    if (!upErr) {
      const certUrl = `quality-docs:${path}`;
      const { error: dbErr } = await supabase
        .from('material_receivings').update({ cert_url: certUrl }).eq('id', row.id);
      if (!dbErr) {
        setRows((p) => p.map((r) => r.id === row.id ? { ...r, cert_url: certUrl } : r));
      }
    }
    setUploadingId(null);
  }

  const COLS = [
    { k: '_material', l: 'Material Item', w: 220 },
    { k: 'received_date', l: 'Received Date', w: 120 },
    { k: 'qty_received', l: 'Qty', w: 80 },
    { k: 'heat_no', l: 'Heat No', w: 120 },
    { k: 'cert_no', l: 'Cert No', w: 120 },
    { k: 'inspector', l: 'Inspector', w: 120 },
    { k: 'status', l: 'Status', w: 120 },
    { k: 'notes', l: 'Notes', w: 200 },
  ];

  return (
    <>
      {/* filters */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search material, heat no, inspector..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ ...iSt, width: 260 }} />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={sSt}>
          <option value="">All Statuses</option>
          {Object.entries(RCV_STATUS_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
      ) : rows.length === 0 ? (
        <Empty msg="No receivings found." />
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
            {filtered.length} of {rows.length} receivings
          </p>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                         borderRadius: 'var(--radius-lg)', overflowX: 'auto', width: '100%', maxHeight: 'calc(100vh - 340px)' }}>
            <table style={{ minWidth: 1100, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  {COLS.map((c) => (
                    <th key={c.k} style={{ ...th, minWidth: c.w, position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>{c.l}</th>
                  ))}
                  <th style={{ ...th, minWidth: 100, position: 'sticky', top: 0, background: '#ffffff', zIndex: 10 }}>Cert</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={COLS.length + 1} style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No results match your filters
                  </td></tr>
                ) : filtered.map((row) => {
                  const isExpanded = expandedId === row.id;
                  return (
                    <tr key={row.id}
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer',
                               transition: 'background var(--transition-fast)',
                               background: isExpanded ? 'var(--color-bg)' : 'transparent' }}
                      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'var(--color-bg)'; }}
                      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {COLS.map((c) => {
                        if (c.k === '_material') {
                          return <td key={c.k} style={td}>{matMap[row.material_item_id] || '\u2014'}</td>;
                        }
                        if (c.k === 'status') {
                          if (isExpanded) {
                            return (
                              <td key={c.k} style={td} onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={row.status || 'pending'}
                                  onChange={(e) => autoSave(row.id, 'status', e.target.value)}
                                  style={{ ...sSt, fontSize: 12, padding: '2px 6px' }}
                                >
                                  {Object.entries(RCV_STATUS_MAP).map(([k, v]) => (
                                    <option key={k} value={k}>{v.t}</option>
                                  ))}
                                </select>
                              </td>
                            );
                          }
                          return <td key={c.k} style={td}><StatusBadge value={row.status} map={RCV_STATUS_MAP} /></td>;
                        }
                        if (c.k === 'received_date') {
                          if (isExpanded) {
                            return (
                              <td key={c.k} style={td} onClick={(e) => e.stopPropagation()}>
                                <input type="date" value={row.received_date || ''}
                                  onChange={(e) => autoSave(row.id, 'received_date', e.target.value || null)}
                                  style={{ ...fi, width: 130, fontSize: 12, padding: '2px 4px' }} />
                              </td>
                            );
                          }
                          return <td key={c.k} style={td}>{fmtDate(row.received_date)}</td>;
                        }
                        if (isExpanded && ['qty_received', 'heat_no', 'cert_no', 'inspector', 'notes'].includes(c.k)) {
                          return (
                            <td key={c.k} style={td} onClick={(e) => e.stopPropagation()}>
                              <input
                                type={c.k === 'qty_received' ? 'number' : 'text'}
                                value={row[c.k] ?? ''}
                                onChange={(e) => {
                                  const val = c.k === 'qty_received'
                                    ? (e.target.value ? Number(e.target.value) : null)
                                    : e.target.value;
                                  autoSave(row.id, c.k, val);
                                }}
                                style={{ ...fi, width: '100%', fontSize: 12, padding: '2px 4px' }}
                              />
                            </td>
                          );
                        }
                        return (
                          <td key={c.k} style={td}>
                            {row[c.k] != null && row[c.k] !== '' ? row[c.k] : '\u2014'}
                          </td>
                        );
                      })}
                      {/* cert upload cell */}
                      <td style={td} onClick={(e) => e.stopPropagation()}>
                        <CertCell row={row} busy={uploadingId === row.id} onUpload={handleCertUpload} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// CERT CELL
// =============================================================================

function CertCell({ row, busy, onUpload }) {
  const ref = useRef(null);

  if (busy) return <Spin />;

  if (row.cert_url) {
    return (
      <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}
        title={row.cert_url}>
        Uploaded
      </span>
    );
  }

  return (
    <>
      <input ref={ref} type="file" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(row, f); }} />
      <button onClick={() => ref.current?.click()} style={uploadBtn}>Upload</button>
    </>
  );
}

// =============================================================================
// SLIDE PANEL (generic for Packing Lists)
// =============================================================================

function SlidePanel({ title, fields, data, setData, onSave, onClose, saving, statusMap }) {
  function chg(key, val) {
    setData((prev) => ({ ...prev, [key]: val === '' ? null : val }));
  }

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, width: 400, height: '100%',
      background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', zIndex: 10,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-md) var(--space-lg)',
        borderBottom: '1px solid var(--color-border)', flexShrink: 0,
      }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>{title}</p>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
          color: 'var(--color-text-muted)', lineHeight: 1,
        }}>{'\u00d7'}</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {fields.map((f) => (
            <label key={f.k} style={{ display: 'block' }}>
              <span style={lbl}>{f.l}</span>
              {f.t === 'select' ? (
                <select value={data[f.k] || ''} onChange={(e) => chg(f.k, e.target.value)} style={fi}>
                  {f.opts.map((o) => (
                    <option key={o} value={o}>
                      {statusMap && statusMap[o] ? statusMap[o].t : o}
                    </option>
                  ))}
                </select>
              ) : (
                <input type={f.t} value={data[f.k] ?? ''}
                  onChange={(e) => chg(f.k,
                    f.t === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value
                  )}
                  style={fi} />
              )}
            </label>
          ))}
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 'var(--space-sm)',
        padding: 'var(--space-md) var(--space-lg)',
        borderTop: '1px solid var(--color-border)', flexShrink: 0,
      }}>
        <button onClick={onClose} disabled={saving} style={{ ...bSec, flex: 1 }}>Cancel</button>
        <button onClick={onSave} disabled={saving} style={{ ...bPri, flex: 1 }}>
          {saving ? 'Saving\u2026' : 'Create'}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// TINY COMPONENTS
// =============================================================================

function Empty({ msg }) {
  return (
    <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                  textAlign: 'center' }}>
      <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
        {msg}
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        Import data or add items manually.
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
const tdWrap = {
  padding: '10px var(--space-md)', whiteSpace: 'normal',
  wordBreak: 'break-word',
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
const lbl = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em',
};
const fi = {
  width: '100%', padding: '8px var(--space-sm)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  fontSize: 13, outline: 'none',
};
const bPri = {
  padding: '8px var(--space-lg)', background: 'var(--color-primary)', color: '#fff',
  border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const bSec = {
  padding: '8px var(--space-lg)', background: 'var(--color-surface)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  fontSize: 13, cursor: 'pointer',
};
const uploadBtn = {
  padding: '2px 8px', fontSize: 11,
  background: 'var(--color-primary-light)', color: 'var(--color-primary)',
  border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', fontWeight: 500,
};
