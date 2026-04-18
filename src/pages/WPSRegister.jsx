import React, { Fragment, useState, useEffect, useMemo } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// ---------------------------------------------------------------------------
// WPS Register – Welding Procedure Specifications
// ---------------------------------------------------------------------------

export default function WPSRegister() {
  const project = useProject();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [errorId, setErrorId] = useState(null);

  // -- New record form state --------------------------------------------------
  const blankForm = { wps_no: '', process: '', p_numbers: '', thickness_range: '', position: '' };
  const [form, setForm] = useState(blankForm);
  const [formBusy, setFormBusy] = useState(false);

  // -- Load data --------------------------------------------------------------
  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAll(
          getSupabase()
            .from('wps_list')
            .select('*')
            .eq('project_id', project.id)
            .order('wps_no', { ascending: true })
        );
        if (!cancelled) setRows(data);
      } catch (e) {
        console.error('WPSRegister load error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [project?.id]);

  // -- Filtered rows ----------------------------------------------------------
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.wps_no || '').toLowerCase().includes(q) ||
      (r.process || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  // -- Autosave ---------------------------------------------------------------
  async function autoSave(rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase().from('wps_list').update(updates).eq('id', rowId);
    if (!error) {
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...updates } : r));
      setFlashId(rowId); setTimeout(() => setFlashId(null), 600);
    } else {
      setErrorId(rowId); setTimeout(() => setErrorId(null), 3000);
    }
    setSavingId(null);
  }

  // -- Add WPS ----------------------------------------------------------------
  async function handleAdd() {
    if (!form.wps_no.trim()) return;
    setFormBusy(true);
    const payload = {
      project_id: project.id,
      wps_no: form.wps_no.trim(),
      process: form.process || null,
      p_numbers: form.p_numbers || null,
      thickness_range: form.thickness_range || null,
      position: form.position || null,
    };
    const { data, error } = await getSupabase().from('wps_list').insert(payload).select().single();
    if (!error && data) {
      setRows(prev => [...prev, data]);
      setForm(blankForm);
      setShowAdd(false);
    } else {
      console.error('WPS insert error', error);
    }
    setFormBusy(false);
  }

  // -- Toggle expand ----------------------------------------------------------
  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  // -- Render -----------------------------------------------------------------
  return (
    <Fragment>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--color-text)' }}>WPS Register</h2>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search WPS No / Process…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              width: 220,
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              outline: 'none',
            }}
          />
          <button style={bPri} onClick={() => { setForm(blankForm); setShowAdd(true); }}>+ Add WPS</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
            {rows.length === 0 ? 'No WPS records yet. Click "+ Add WPS" to create one.' : 'No results match your search.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--color-text)' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={th}>WPS No</th>
                <th style={th}>Process</th>
                <th style={th}>Base Material</th>
                <th style={th}>Filler</th>
                <th style={th}>Thickness Range</th>
                <th style={th}>Position</th>
                <th style={th}>PWHT Required</th>
                <th style={th}>Approval Body</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => toggleExpand(row.id)}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      background: flashId === row.id ? 'rgba(34,197,94,0.08)' : errorId === row.id ? 'rgba(239,68,68,0.08)' : expandedId === row.id ? 'var(--color-bg)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (expandedId !== row.id && flashId !== row.id && errorId !== row.id) e.currentTarget.style.background = 'var(--color-bg)'; }}
                    onMouseLeave={e => { if (expandedId !== row.id && flashId !== row.id && errorId !== row.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={td}>{row.wps_no || '\u2014'}</td>
                    <td style={td}>{row.process || '\u2014'}</td>
                    <td style={td}>{row.p_numbers || '\u2014'}</td>
                    <td style={td}>{'\u2014'}</td>
                    <td style={td}>{row.thickness_range || '\u2014'}</td>
                    <td style={td}>{row.position || '\u2014'}</td>
                    <td style={td}>{'\u2014'}</td>
                    <td style={td}>{'\u2014'}</td>
                    <td style={td}>{'\u2014'}</td>
                  </tr>

                  {/* Expanded inline edit panel */}
                  {expandedId === row.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--color-border)' }}>
                        <ExpandPanel row={row} autoSave={autoSave} savingId={savingId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-in Add WPS panel */}
      {showAdd && (
        <Fragment>
          {/* Backdrop */}
          <div
            onClick={() => setShowAdd(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 49 }}
          />
          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
            background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            zIndex: 50, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>Add WPS</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <FormField label="WPS No" value={form.wps_no} onChange={v => setForm(p => ({ ...p, wps_no: v }))} />
              <div>
                <label style={labelSt}>Process</label>
                <select
                  value={form.process}
                  onChange={e => setForm(p => ({ ...p, process: e.target.value }))}
                  style={inputSt}
                >
                  <option value="">— Select —</option>
                  <option value="GTAW">GTAW</option>
                  <option value="SMAW">SMAW</option>
                  <option value="FCAW">FCAW</option>
                  <option value="SAW">SAW</option>
                  <option value="GTAW/SMAW">GTAW/SMAW</option>
                </select>
              </div>
              <FormField label="Base Material (P-Numbers)" value={form.p_numbers} onChange={v => setForm(p => ({ ...p, p_numbers: v }))} />
              <FormField label="Thickness Range" value={form.thickness_range} onChange={v => setForm(p => ({ ...p, thickness_range: v }))} />
              <FormField label="Position" value={form.position} onChange={v => setForm(p => ({ ...p, position: v }))} />
            </div>

            <div style={{ padding: 'var(--space-lg)', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button style={bSec} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={bPri} disabled={formBusy || !form.wps_no.trim()} onClick={handleAdd}>
                {formBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Fragment>
      )}
    </Fragment>
  );
}

// ---------------------------------------------------------------------------
// Expand Panel (inline editing for existing DB fields)
// ---------------------------------------------------------------------------

function ExpandPanel({ row, autoSave, savingId }) {
  const [local, setLocal] = useState({
    wps_no: row.wps_no || '',
    process: row.process || '',
    p_numbers: row.p_numbers || '',
    thickness_range: row.thickness_range || '',
    position: row.position || '',
  });

  function handleChange(field, value) {
    setLocal(prev => ({ ...prev, [field]: value }));
  }

  function handleBlur(field) {
    if (local[field] !== (row[field] || '')) {
      autoSave(row.id, { [field]: local[field] || null });
    }
  }

  function handleSelectChange(field, value) {
    setLocal(prev => ({ ...prev, [field]: value }));
    if (value !== (row[field] || '')) {
      autoSave(row.id, { [field]: value || null });
    }
  }

  const isSaving = savingId === row.id;

  return (
    <div style={{ background: 'var(--color-bg)', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
         onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Edit WPS</span>
        {isSaving && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Saving…</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
        {/* Editable fields */}
        <div>
          <label style={labelSt}>WPS No</label>
          <input
            style={inputSt}
            value={local.wps_no}
            onChange={e => handleChange('wps_no', e.target.value)}
            onBlur={() => handleBlur('wps_no')}
          />
        </div>
        <div>
          <label style={labelSt}>Process</label>
          <select
            style={inputSt}
            value={local.process}
            onChange={e => handleSelectChange('process', e.target.value)}
          >
            <option value="">— Select —</option>
            <option value="GTAW">GTAW</option>
            <option value="SMAW">SMAW</option>
            <option value="FCAW">FCAW</option>
            <option value="SAW">SAW</option>
            <option value="GTAW/SMAW">GTAW/SMAW</option>
          </select>
        </div>
        <div>
          <label style={labelSt}>Base Material (P-Numbers)</label>
          <input
            style={inputSt}
            value={local.p_numbers}
            onChange={e => handleChange('p_numbers', e.target.value)}
            onBlur={() => handleBlur('p_numbers')}
          />
        </div>
        <div>
          <label style={labelSt}>Thickness Range</label>
          <input
            style={inputSt}
            value={local.thickness_range}
            onChange={e => handleChange('thickness_range', e.target.value)}
            onBlur={() => handleBlur('thickness_range')}
          />
        </div>
        <div>
          <label style={labelSt}>Position</label>
          <input
            style={inputSt}
            value={local.position}
            onChange={e => handleChange('position', e.target.value)}
            onBlur={() => handleBlur('position')}
          />
        </div>
      </div>

      {/* Non-editable display-only fields */}
      <div style={{ marginTop: 'var(--space-sm)', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 'var(--space-xs)', display: 'block' }}>
          Additional Fields (not yet in database)
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--space-md)', marginTop: 'var(--space-xs)' }}>
          <div>
            <label style={labelSt}>Filler</label>
            <div style={readOnlySt}>{'\u2014'}</div>
          </div>
          <div>
            <label style={labelSt}>PWHT Required</label>
            <div style={readOnlySt}>{'\u2014'}</div>
          </div>
          <div>
            <label style={labelSt}>Approval Body</label>
            <div style={readOnlySt}>{'\u2014'}</div>
          </div>
          <div>
            <label style={labelSt}>Notes</label>
            <div style={readOnlySt}>{'\u2014'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormField helper for the Add panel
// ---------------------------------------------------------------------------

function FormField({ label, value, onChange }) {
  return (
    <div>
      <label style={labelSt}>{label}</label>
      <input
        style={inputSt}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const th = { textAlign: 'left', padding: '10px var(--space-md)', fontWeight: 600, fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' };
const td = { padding: '10px var(--space-md)', whiteSpace: 'nowrap' };
const bPri = { padding: '8px var(--space-lg)', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const bSec = { padding: '8px var(--space-lg)', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer' };

const labelSt = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const inputSt = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  color: 'var(--color-text)',
  background: 'var(--color-surface)',
  outline: 'none',
  boxSizing: 'border-box',
};

const readOnlySt = {
  padding: '8px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  color: 'var(--color-text-muted)',
  background: 'var(--color-bg)',
  boxSizing: 'border-box',
};
