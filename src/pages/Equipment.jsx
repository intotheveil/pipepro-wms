import React, { Fragment, useState, useEffect, useMemo } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// -- Helpers ------------------------------------------------------------------

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - now) / 86400000);
}

function statusInfo(expiryDate) {
  const days = daysUntil(expiryDate);
  if (days === null) return { label: 'No Expiry', bg: '#f3f4f6', fg: '#6b7280' };
  if (days < 0)     return { label: 'Expired', bg: '#fee2e2', fg: '#991b1b' };
  if (days < 10)    return { label: 'Expiring', bg: '#fee2e2', fg: '#991b1b' };
  if (days <= 30)   return { label: 'Expiring Soon', bg: '#fef3c7', fg: '#92400e' };
  return { label: 'Valid', bg: '#dcfce7', fg: '#065f46' };
}

function StatusBadge({ expiryDate }) {
  const s = statusInfo(expiryDate);
  return (
    <span style={{ ...badge, background: s.bg, color: s.fg }}>{s.label}</span>
  );
}

const badge = {
  display: 'inline-block', padding: '2px 10px', borderRadius: 12,
  fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
};

function blankRow(pid) {
  return {
    project_id: pid,
    equipment_name: '',
    equipment_id: '',
    type: '',
    manufacturer: '',
    serial_no: '',
    calibration_body: '',
    cert_no: '',
    cert_url: '',
    last_calibration_date: null,
    expiry_date: null,
    notes: '',
  };
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

export default function Equipment() {
  const project = useProject();

  // data
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // search
  const [search, setSearch] = useState('');

  // inline editing
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId]     = useState(null);
  const [flashId, setFlashId]       = useState(null);
  const [errorId, setErrorId]       = useState(null);

  // add panel
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState(() => blankRow(project.id));
  const [addBusy, setAddBusy]   = useState(false);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchAll(
        getSupabase()
          .from('equipment_calibration')
          .select('*')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })
      );
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  // -- filter -----------------------------------------------------------------

  const term = search.toLowerCase();
  const filtered = rows.filter((r) => {
    if (!term) return true;
    return (
      (r.equipment_name || '').toLowerCase().includes(term) ||
      (r.equipment_id || '').toLowerCase().includes(term) ||
      (r.serial_no || '').toLowerCase().includes(term)
    );
  });

  // -- stats ------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = rows.length;
    let valid = 0, expiringSoon = 0, expired = 0;
    for (const r of rows) {
      const days = daysUntil(r.expiry_date);
      if (days === null)  { valid++; continue; }
      if (days < 0)       { expired++; continue; }
      if (days <= 30)     { expiringSoon++; continue; }
      valid++;
    }
    return { total, valid, expiringSoon, expired };
  }, [rows]);

  // -- autosave ---------------------------------------------------------------

  async function autoSave(rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase()
      .from('equipment_calibration').update(updates).eq('id', rowId);
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

  // -- cert upload ------------------------------------------------------------

  async function uploadCert(rowId, file) {
    const row = rows.find(r => r.id === rowId);
    if (!row || !file) return;
    const filename = (row.cert_no || row.id).toString().replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf';
    const path = `${project.id}/equipment/certs/${filename}`;
    setSavingId(rowId);
    const { error: upErr } = await getSupabase().storage
      .from('quality-docs')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' });
    if (upErr) {
      setErrorId(rowId);
      setTimeout(() => setErrorId(null), 3000);
      setSavingId(null);
      return;
    }
    const certUrl = `quality-docs:${path}`;
    const { error } = await getSupabase()
      .from('equipment_calibration').update({ cert_url: certUrl }).eq('id', rowId);
    if (!error) {
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, cert_url: certUrl } : r));
      setFlashId(rowId);
      setTimeout(() => setFlashId(null), 600);
    } else {
      setErrorId(rowId);
      setTimeout(() => setErrorId(null), 3000);
    }
    setSavingId(null);
  }

  function viewCert(certUrl) {
    if (!certUrl) return;
    const [bucket, ...rest] = certUrl.split(':');
    const path = rest.join(':');
    const { data } = getSupabase().storage.from(bucket).getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  }

  // -- add equipment ----------------------------------------------------------

  async function handleAdd() {
    setAddBusy(true);
    const payload = { ...addForm, project_id: project.id };
    const { data, error } = await getSupabase()
      .from('equipment_calibration').insert(payload).select().single();
    if (!error && data) {
      setRows(prev => [data, ...prev]);
      setShowAdd(false);
      setAddForm(blankRow(project.id));
    }
    setAddBusy(false);
  }

  // -- render -----------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: '_spin .6s linear infinite' }} />
      </div>
    );
  }

  return (
    <Fragment>
      {/* -- Header ----------------------------------------------------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Equipment Calibration</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {project.code} &mdash; {project.name}
          </p>
        </div>
        <button style={bPri} onClick={() => { setAddForm(blankRow(project.id)); setShowAdd(true); }}>
          + Add Equipment
        </button>
      </div>

      {/* -- Stat Cards ------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <StatCard label="Total Equipment" value={stats.total} color="var(--color-primary)" />
        <StatCard label="Valid" value={stats.valid} color="#059669" />
        <StatCard label="Expiring Soon" value={stats.expiringSoon} color="#d97706" />
        <StatCard label="Expired" value={stats.expired} color="#dc2626" />
      </div>

      {/* -- Search ----------------------------------------------------------- */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <input
          type="text"
          placeholder="Search by name, ID, or serial no\u2026"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: 320, padding: '8px 12px', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', fontSize: 13, background: 'var(--color-surface)',
            color: 'var(--color-text)', outline: 'none',
          }}
        />
      </div>

      {/* -- Table ------------------------------------------------------------ */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={th}>Equipment Name</th>
              <th style={th}>ID</th>
              <th style={th}>Type</th>
              <th style={th}>Manufacturer</th>
              <th style={th}>Serial No</th>
              <th style={th}>Calibration Body</th>
              <th style={th}>Cert No</th>
              <th style={th}>Last Calibration</th>
              <th style={th}>Expiry Date</th>
              <th style={th}>Status</th>
              <th style={th}>Cert</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: 'var(--color-text-secondary)', padding: 40 }}>
                {rows.length === 0 ? 'No equipment records yet.' : 'No matching records.'}
              </td></tr>
            )}
            {filtered.map(row => {
              const isExpanded = expandedId === row.id;
              const isSaving = savingId === row.id;
              const isFlash = flashId === row.id;
              const isError = errorId === row.id;
              const rowBg = isError ? '#fef2f2'
                : isFlash ? '#f0fdf4'
                : isSaving ? '#fafafa'
                : 'transparent';

              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      background: rowBg,
                      transition: 'background .3s',
                    }}
                  >
                    <td style={td}>{row.equipment_name || '\u2014'}</td>
                    <td style={td}>{row.equipment_id || '\u2014'}</td>
                    <td style={td}>{row.type || '\u2014'}</td>
                    <td style={td}>{row.manufacturer || '\u2014'}</td>
                    <td style={td}>{row.serial_no || '\u2014'}</td>
                    <td style={td}>{row.calibration_body || '\u2014'}</td>
                    <td style={td}>{row.cert_no || '\u2014'}</td>
                    <td style={td}>{fmtDate(row.last_calibration_date)}</td>
                    <td style={td}>{fmtDate(row.expiry_date)}</td>
                    <td style={td}><StatusBadge expiryDate={row.expiry_date} /></td>
                    <td style={td} onClick={e => e.stopPropagation()}>
                      {row.cert_url && (
                        <button
                          style={{ ...linkBtn, marginRight: 6 }}
                          onClick={() => viewCert(row.cert_url)}
                        >View</button>
                      )}
                      <label style={{ ...linkBtn, color: 'var(--color-primary)' }}>
                        Upload
                        <input
                          type="file"
                          accept="application/pdf"
                          style={{ display: 'none' }}
                          onChange={e => {
                            if (e.target.files[0]) uploadCert(row.id, e.target.files[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </td>
                    <td style={td} onClick={e => e.stopPropagation()}>
                      <button
                        style={{ ...linkBtn, color: '#dc2626' }}
                        onClick={async () => {
                          if (!confirm('Delete this equipment record?')) return;
                          const { error } = await getSupabase()
                            .from('equipment_calibration').delete().eq('id', row.id);
                          if (!error) setRows(prev => prev.filter(r => r.id !== row.id));
                        }}
                      >Delete</button>
                    </td>
                  </tr>

                  {/* -- Expanded inline edit panel ----------------------------- */}
                  {isExpanded && (
                    <tr style={{ background: 'var(--color-bg)' }}>
                      <td colSpan={12} style={{ padding: 'var(--space-lg)' }}>
                        <ExpandedPanel row={row} autoSave={autoSave} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* -- Add Equipment slide-in panel ------------------------------------ */}
      {showAdd && (
        <Fragment>
          {/* backdrop */}
          <div
            onClick={() => setShowAdd(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)', zIndex: 49,
            }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
            background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.12)',
            zIndex: 50, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Add Equipment</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>&times;</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <FormField label="Equipment Name" value={addForm.equipment_name} onChange={v => setAddForm(p => ({ ...p, equipment_name: v }))} />
              <FormField label="Equipment ID" value={addForm.equipment_id} onChange={v => setAddForm(p => ({ ...p, equipment_id: v }))} />
              <FormField label="Type" value={addForm.type} onChange={v => setAddForm(p => ({ ...p, type: v }))} />
              <FormField label="Manufacturer" value={addForm.manufacturer} onChange={v => setAddForm(p => ({ ...p, manufacturer: v }))} />
              <FormField label="Serial No" value={addForm.serial_no} onChange={v => setAddForm(p => ({ ...p, serial_no: v }))} />
              <FormField label="Calibration Body" value={addForm.calibration_body} onChange={v => setAddForm(p => ({ ...p, calibration_body: v }))} />
              <FormField label="Cert No" value={addForm.cert_no} onChange={v => setAddForm(p => ({ ...p, cert_no: v }))} />
              <FormField label="Last Calibration Date" type="date" value={addForm.last_calibration_date || ''} onChange={v => setAddForm(p => ({ ...p, last_calibration_date: v || null }))} />
              <FormField label="Expiry Date" type="date" value={addForm.expiry_date || ''} onChange={v => setAddForm(p => ({ ...p, expiry_date: v || null }))} />
              <div>
                <label style={fieldLabel}>Notes</label>
                <textarea
                  value={addForm.notes}
                  onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  style={{ ...fieldInput, resize: 'vertical' }}
                />
              </div>
            </div>
            <div style={{ padding: 'var(--space-lg)', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button style={bSec} onClick={() => setShowAdd(false)} disabled={addBusy}>Cancel</button>
              <button style={bPri} onClick={handleAdd} disabled={addBusy}>
                {addBusy ? 'Saving\u2026' : 'Save'}
              </button>
            </div>
          </div>
        </Fragment>
      )}
    </Fragment>
  );
}

// =============================================================================
// Expanded inline-edit panel
// =============================================================================

function ExpandedPanel({ row, autoSave }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
      <InlineText label="Equipment Name" field="equipment_name" row={row} autoSave={autoSave} />
      <InlineText label="Equipment ID" field="equipment_id" row={row} autoSave={autoSave} />
      <InlineText label="Type" field="type" row={row} autoSave={autoSave} />
      <InlineText label="Manufacturer" field="manufacturer" row={row} autoSave={autoSave} />
      <InlineText label="Serial No" field="serial_no" row={row} autoSave={autoSave} />
      <InlineText label="Calibration Body" field="calibration_body" row={row} autoSave={autoSave} />
      <InlineText label="Cert No" field="cert_no" row={row} autoSave={autoSave} />
      <InlineDate label="Last Calibration Date" field="last_calibration_date" row={row} autoSave={autoSave} />
      <InlineDate label="Expiry Date" field="expiry_date" row={row} autoSave={autoSave} />
      <div style={{ gridColumn: '1 / -1' }}>
        <InlineTextarea label="Notes" field="notes" row={row} autoSave={autoSave} />
      </div>
    </div>
  );
}

function InlineText({ label, field, row, autoSave }) {
  const [val, setVal] = useState(row[field] || '');
  useEffect(() => { setVal(row[field] || ''); }, [row[field]]);
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (val !== (row[field] || '')) autoSave(row.id, { [field]: val }); }}
        style={fieldInput}
      />
    </div>
  );
}

function InlineDate({ label, field, row, autoSave }) {
  const [val, setVal] = useState(row[field] || '');
  useEffect(() => { setVal(row[field] || ''); }, [row[field]]);
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input
        type="date"
        value={val ? String(val).split('T')[0] : ''}
        onChange={e => {
          const v = e.target.value || null;
          setVal(v);
          autoSave(row.id, { [field]: v });
        }}
        style={fieldInput}
      />
    </div>
  );
}

function InlineTextarea({ label, field, row, autoSave }) {
  const [val, setVal] = useState(row[field] || '');
  useEffect(() => { setVal(row[field] || ''); }, [row[field]]);
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (val !== (row[field] || '')) autoSave(row.id, { [field]: val }); }}
        rows={3}
        style={{ ...fieldInput, resize: 'vertical' }}
      />
    </div>
  );
}

// =============================================================================
// Stat Card
// =============================================================================

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// =============================================================================
// Form Field (for Add panel)
// =============================================================================

function FormField({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={fieldInput}
      />
    </div>
  );
}

// =============================================================================
// Style constants
// =============================================================================

const th = {
  textAlign: 'left', padding: '10px var(--space-md)', fontWeight: 600,
  fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase',
  letterSpacing: '0.03em', whiteSpace: 'nowrap',
};

const td = {
  padding: '10px var(--space-md)', whiteSpace: 'nowrap',
};

const bPri = {
  padding: '8px var(--space-lg)', background: 'var(--color-primary)',
  color: '#fff', border: 'none', borderRadius: 'var(--radius-md)',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

const bSec = {
  padding: '8px var(--space-lg)', background: 'var(--color-surface)',
  color: 'var(--color-text)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer',
};

const fieldLabel = {
  display: 'block', fontSize: 12, fontWeight: 500,
  color: 'var(--color-text-secondary)', marginBottom: 4,
};

const fieldInput = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)', fontSize: 13, background: 'var(--color-surface)',
  color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
};

const linkBtn = {
  background: 'none', border: 'none', fontSize: 12,
  cursor: 'pointer', color: 'var(--color-primary)', textDecoration: 'underline',
  padding: 0,
};
