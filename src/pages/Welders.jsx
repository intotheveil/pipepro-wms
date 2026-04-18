import { Fragment, useState, useEffect, useMemo } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// -- Helpers ------------------------------------------------------------------

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

function has(val, term) {
  return (val || '').toLowerCase().includes(term);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

function statusBadge(qualificationExp) {
  const days = daysUntil(qualificationExp);
  if (days === null) return { label: 'No Expiry', bg: '#f3f4f6', color: '#6b7280' };
  if (days < 0) return { label: 'Expired', bg: '#fee2e2', color: '#991b1b' };
  if (days < 10) return { label: 'Expiring', bg: '#fee2e2', color: '#991b1b' };
  if (days <= 30) return { label: 'Expiring Soon', bg: '#fef3c7', color: '#92400e' };
  return { label: 'Active', bg: '#dcfce7', color: '#065f46' };
}

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

export default function Welders() {
  const project = useProject();

  // data
  const [rows, setRows]       = useState([]);
  const [wpsList, setWpsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState('');

  // inline editing
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId]     = useState(null);
  const [flashId, setFlashId]       = useState(null);
  const [errorId, setErrorId]       = useState(null);

  // add panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newWelder, setNewWelder] = useState({
    stamp: '', name: '', nationality: '', qualified_wps: [],
    qualification_no: '', qualification_date: '', qualification_exp: '',
    active: true, notes: '',
  });
  const [addSaving, setAddSaving] = useState(false);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const supabase = getSupabase();
      const pid = project.id;

      const [welderData, wpsData] = await Promise.all([
        fetchAll(supabase.from('welders').select('*').eq('project_id', pid).order('stamp')),
        fetchAll(supabase.from('wps_list').select('id, wps_no').eq('project_id', pid).order('wps_no')),
      ]);

      if (!c) {
        setRows(welderData);
        setWpsList(wpsData);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // -- autosave ---------------------------------------------------------------

  async function autoSave(rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase().from('welders').update(updates).eq('id', rowId);
    if (!error) {
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...updates } : r));
      setFlashId(rowId); setTimeout(() => setFlashId(null), 600);
    } else {
      setErrorId(rowId); setTimeout(() => setErrorId(null), 3000);
    }
    setSavingId(null);
  }

  // -- add welder -------------------------------------------------------------

  async function handleAddWelder() {
    setAddSaving(true);
    const payload = {
      project_id: project.id,
      stamp: newWelder.stamp || null,
      name: newWelder.name || null,
      nationality: newWelder.nationality || null,
      qualified_wps: newWelder.qualified_wps,
      qualification_no: newWelder.qualification_no || null,
      qualification_date: newWelder.qualification_date || null,
      qualification_exp: newWelder.qualification_exp || null,
      active: newWelder.active,
      notes: newWelder.notes || null,
    };
    const { data, error } = await getSupabase().from('welders').insert(payload).select().single();
    if (!error && data) {
      setRows(prev => [...prev, data]);
      setShowAddPanel(false);
      setNewWelder({
        stamp: '', name: '', nationality: '', qualified_wps: [],
        qualification_no: '', qualification_date: '', qualification_exp: '',
        active: true, notes: '',
      });
    }
    setAddSaving(false);
  }

  // -- filter -----------------------------------------------------------------

  const term = search.toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return rows;
    return rows.filter(r => has(r.stamp, term) || has(r.name, term));
  }, [rows, term]);

  // -- stats ------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter(r => r.active).length;
    const t = todayStr();
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().split('T')[0];
    const expiringSoon = rows.filter(r => {
      if (!r.qualification_exp) return false;
      const exp = r.qualification_exp.split('T')[0];
      return exp >= t && exp <= in30Str;
    }).length;
    const expired = rows.filter(r => {
      if (!r.qualification_exp) return false;
      return r.qualification_exp.split('T')[0] < t;
    }).length;
    return { total, active, expiringSoon, expired };
  }, [rows]);

  // -- helpers ----------------------------------------------------------------

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  function wpsNoList(qualifiedWps) {
    if (!qualifiedWps || qualifiedWps.length === 0) return '\u2014';
    return qualifiedWps.join(', ');
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
            <h1 style={{ fontSize:22, fontWeight:600, marginBottom:2 }}>Welders</h1>
            <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>{project.name}</p>
          </div>
          <div style={{ display:'flex', gap:'var(--space-sm)', alignItems:'center' }}>
            <button onClick={() => setShowAddPanel(true)} style={bPri}>Add Welder</button>
          </div>
        </div>

        {/* stats row */}
        {!loading && rows.length > 0 && (
          <div style={{ display:'flex', gap:'var(--space-lg)', marginBottom:'var(--space-lg)', flexWrap:'wrap' }}>
            <StatCard label="Total Welders" value={stats.total} />
            <StatCard label="Active" value={stats.active} color="#059669" />
            <StatCard label="Expiring Soon" value={stats.expiringSoon} color="#f59e0b" />
            <StatCard label="Expired" value={stats.expired} color="#ef4444" />
          </div>
        )}

        {/* search */}
        <div style={{ display:'flex', gap:'var(--space-sm)', marginBottom:'var(--space-md)', flexWrap:'wrap' }}>
          <input type="text" placeholder="Search by stamp or name\u2026"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...iSt, width:300 }} />
        </div>

        {/* body */}
        {loading ? (
          <p style={{ color:'var(--color-text-muted)' }}>Loading&hellip;</p>
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            <p style={{ fontSize:12, color:'var(--color-text-muted)', marginBottom:'var(--space-sm)' }}>
              {filtered.length} of {rows.length} welders
            </p>

            <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)',
                           borderRadius:'var(--radius-lg)', overflowX:'auto', width:'100%', maxHeight:'calc(100vh - 300px)' }}>
              <table style={{ minWidth:900, width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--color-border)', background:'var(--color-bg)' }}>
                    <th style={{ ...th, minWidth:80, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>Stamp</th>
                    <th style={{ ...th, minWidth:160, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>Full Name</th>
                    <th style={{ ...th, minWidth:60, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>Active</th>
                    <th style={{ ...th, minWidth:200, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>Qualified WPS</th>
                    <th style={{ ...th, minWidth:120, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>Qualification Exp</th>
                    <th style={{ ...th, minWidth:110, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>Status</th>
                    <th style={{ ...th, minWidth:50, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding:'var(--space-lg)', textAlign:'center', color:'var(--color-text-muted)' }}>
                      No results match your search
                    </td></tr>
                  ) : filtered.map((row) => {
                    const isExpanded = expandedId === row.id;
                    const isFlash = flashId === row.id;
                    const isError = errorId === row.id;
                    const isSaving = savingId === row.id;
                    const badge = statusBadge(row.qualification_exp);

                    const rowBg = isFlash ? '#dcfce7' : isError ? '#fef2f2' : 'transparent';
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
                          onClick={() => toggleExpand(row.id)}
                          onMouseEnter={(e) => { if (!isFlash && !isError) e.currentTarget.style.background = 'var(--color-bg)'; }}
                          onMouseLeave={(e) => { if (!isFlash && !isError) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ ...td, fontWeight:600 }}>{row.stamp || '\u2014'}</td>
                          <td style={td}>{row.name || '\u2014'}</td>
                          <td style={td}>
                            <span style={{
                              display:'inline-block', width:8, height:8, borderRadius:'50%',
                              background: row.active ? '#22c55e' : '#d1d5db',
                            }} />
                          </td>
                          <td style={{ ...td, whiteSpace:'normal', maxWidth:250 }}>{wpsNoList(row.qualified_wps)}</td>
                          <td style={td}>{fmtDate(row.qualification_exp)}</td>
                          <td style={td}>
                            <span style={{
                              display:'inline-block', padding:'2px 10px', borderRadius:999,
                              fontSize:11, fontWeight:600, background:badge.bg, color:badge.color,
                            }}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={td}>
                            <span style={{ fontSize:14, color:'var(--color-text-muted)', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', display:'inline-block', transition:'transform 0.15s' }}>
                              {'\u25B6'}
                            </span>
                          </td>
                        </tr>

                        {/* Inline edit panel */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} style={{
                              background: '#f8fafc',
                              borderTop: '2px solid var(--color-border)',
                              borderBottom: '1px solid var(--color-border)',
                              padding: 'var(--space-md) var(--space-lg)',
                            }}>
                              <div style={{ maxWidth: 600 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                    Edit Welder &mdash; {row.stamp || 'No Stamp'}
                                  </span>
                                  {isSaving && (
                                    <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>saving...</span>
                                  )}
                                  {isError && (
                                    <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>Save failed</span>
                                  )}
                                </div>

                                {/* Stamp (read-only) */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={lbl}>Stamp</label>
                                  <div style={{ fontSize: 13, fontWeight: 600, padding: '6px 0' }}>{row.stamp || '\u2014'}</div>
                                </div>

                                {/* Full Name */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={lbl}>Full Name</label>
                                  <input
                                    type="text"
                                    defaultValue={row.name || ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => {
                                      const val = e.target.value;
                                      if (val !== (row.name || '')) {
                                        autoSave(row.id, { name: val || null });
                                      }
                                    }}
                                    style={fi}
                                  />
                                </div>

                                {/* Nationality */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={lbl}>Nationality</label>
                                  <input
                                    type="text"
                                    defaultValue={row.nationality || ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => {
                                      const val = e.target.value;
                                      if (val !== (row.nationality || '')) {
                                        autoSave(row.id, { nationality: val || null });
                                      }
                                    }}
                                    style={fi}
                                  />
                                </div>

                                {/* Qualified WPS checkboxes */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={lbl}>Qualified WPS</label>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
                                    {wpsList.map(wps => {
                                      const checked = (row.qualified_wps || []).includes(wps.wps_no);
                                      return (
                                        <label key={wps.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={() => {
                                              const current = row.qualified_wps || [];
                                              const next = checked
                                                ? current.filter(w => w !== wps.wps_no)
                                                : [...current, wps.wps_no];
                                              autoSave(row.id, { qualified_wps: next });
                                            }}
                                            style={{ cursor: 'pointer' }}
                                          />
                                          {wps.wps_no}
                                        </label>
                                      );
                                    })}
                                    {wpsList.length === 0 && (
                                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No WPS records found</span>
                                    )}
                                  </div>
                                </div>

                                {/* Qualification Number */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={lbl}>Qualification Number</label>
                                  <input
                                    type="text"
                                    defaultValue={row.qualification_no || ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={(e) => {
                                      const val = e.target.value;
                                      if (val !== (row.qualification_no || '')) {
                                        autoSave(row.id, { qualification_no: val || null });
                                      }
                                    }}
                                    style={fi}
                                  />
                                </div>

                                {/* Cert Date */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={lbl}>Cert Date</label>
                                  <input
                                    type="date"
                                    value={row.qualification_date ? String(row.qualification_date).split('T')[0] : ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      autoSave(row.id, { qualification_date: e.target.value || null });
                                    }}
                                    style={{ ...fi, width: 180 }}
                                  />
                                </div>

                                {/* Expiry Date */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={lbl}>Expiry Date</label>
                                  <input
                                    type="date"
                                    value={row.qualification_exp ? String(row.qualification_exp).split('T')[0] : ''}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      autoSave(row.id, { qualification_exp: e.target.value || null });
                                    }}
                                    style={{ ...fi, width: 180 }}
                                  />
                                </div>

                                {/* Active toggle */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span>Active</span>
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={!!row.active}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        autoSave(row.id, { active: e.target.checked });
                                      }}
                                      style={{ cursor: 'pointer' }}
                                    />
                                    {row.active ? 'Active' : 'Inactive'}
                                  </label>
                                </div>

                                {/* Notes */}
                                <div style={{ marginBottom: 'var(--space-sm)' }}>
                                  <label style={lbl}>Notes</label>
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
                                      ...fi,
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
      </div>

      {/* Add Welder slide-in panel */}
      {showAddPanel && (
        <>
          <div
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', zIndex:49 }}
            onClick={() => setShowAddPanel(false)}
          />
          <div style={{
            position:'fixed', top:0, right:0, bottom:0, width:400,
            background:'#fff', boxShadow:'-4px 0 24px rgba(0,0,0,0.15)',
            zIndex:50, overflow:'auto', padding:'var(--space-lg)',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--space-lg)' }}>
              <h2 style={{ fontSize:18, fontWeight:600 }}>Add Welder</h2>
              <button onClick={() => setShowAddPanel(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--color-text-muted)' }}>{'\u00D7'}</button>
            </div>

            {/* Stamp */}
            <div style={{ marginBottom:'var(--space-sm)' }}>
              <label style={lbl}>Stamp</label>
              <input type="text" value={newWelder.stamp} onChange={(e) => setNewWelder(p => ({ ...p, stamp: e.target.value }))} style={fi} />
            </div>

            {/* Full Name */}
            <div style={{ marginBottom:'var(--space-sm)' }}>
              <label style={lbl}>Full Name</label>
              <input type="text" value={newWelder.name} onChange={(e) => setNewWelder(p => ({ ...p, name: e.target.value }))} style={fi} />
            </div>

            {/* Nationality */}
            <div style={{ marginBottom:'var(--space-sm)' }}>
              <label style={lbl}>Nationality</label>
              <input type="text" value={newWelder.nationality} onChange={(e) => setNewWelder(p => ({ ...p, nationality: e.target.value }))} style={fi} />
            </div>

            {/* Qualified WPS checkboxes */}
            <div style={{ marginBottom:'var(--space-sm)' }}>
              <label style={lbl}>Qualified WPS</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 16px' }}>
                {wpsList.map(wps => {
                  const checked = newWelder.qualified_wps.includes(wps.wps_no);
                  return (
                    <label key={wps.id} style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, cursor:'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setNewWelder(p => ({
                            ...p,
                            qualified_wps: checked
                              ? p.qualified_wps.filter(w => w !== wps.wps_no)
                              : [...p.qualified_wps, wps.wps_no],
                          }));
                        }}
                        style={{ cursor:'pointer' }}
                      />
                      {wps.wps_no}
                    </label>
                  );
                })}
                {wpsList.length === 0 && (
                  <span style={{ fontSize:12, color:'var(--color-text-muted)' }}>No WPS records found</span>
                )}
              </div>
            </div>

            {/* Qualification Number */}
            <div style={{ marginBottom:'var(--space-sm)' }}>
              <label style={lbl}>Qualification Number</label>
              <input type="text" value={newWelder.qualification_no} onChange={(e) => setNewWelder(p => ({ ...p, qualification_no: e.target.value }))} style={fi} />
            </div>

            {/* Cert Date */}
            <div style={{ marginBottom:'var(--space-sm)' }}>
              <label style={lbl}>Cert Date</label>
              <input type="date" value={newWelder.qualification_date} onChange={(e) => setNewWelder(p => ({ ...p, qualification_date: e.target.value }))} style={{ ...fi, width:180 }} />
            </div>

            {/* Expiry Date */}
            <div style={{ marginBottom:'var(--space-sm)' }}>
              <label style={lbl}>Expiry Date</label>
              <input type="date" value={newWelder.qualification_exp} onChange={(e) => setNewWelder(p => ({ ...p, qualification_exp: e.target.value }))} style={{ ...fi, width:180 }} />
            </div>

            {/* Active */}
            <div style={{ marginBottom:'var(--space-sm)' }}>
              <label style={{ ...lbl, marginBottom:8 }}>Active</label>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={newWelder.active} onChange={(e) => setNewWelder(p => ({ ...p, active: e.target.checked }))} style={{ cursor:'pointer' }} />
                {newWelder.active ? 'Active' : 'Inactive'}
              </label>
            </div>

            {/* Notes */}
            <div style={{ marginBottom:'var(--space-lg)' }}>
              <label style={lbl}>Notes</label>
              <textarea
                value={newWelder.notes}
                rows={3}
                onChange={(e) => setNewWelder(p => ({ ...p, notes: e.target.value }))}
                style={{ ...fi, resize:'vertical', fontFamily:'inherit' }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display:'flex', gap:'var(--space-sm)', justifyContent:'flex-end' }}>
              <button onClick={() => setShowAddPanel(false)} style={bSec}>Cancel</button>
              <button onClick={handleAddWelder} disabled={addSaving} style={bPri}>
                {addSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
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
        No welders found.
      </p>
      <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>
        Add a welder to get started.
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
const iSt = {
  padding:'var(--space-sm) var(--space-md)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
  fontSize:13, outline:'none', background:'var(--color-surface)',
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
