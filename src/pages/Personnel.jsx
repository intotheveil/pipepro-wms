import React, { Fragment, useEffect, useState, useMemo } from 'react';
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
  const exp = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - now) / 86400000);
}

function statusBadge(expiryDate) {
  const days = daysUntil(expiryDate);
  if (days === null) return { label: 'No Expiry', bg: '#f3f4f6', fg: '#6b7280' };
  if (days < 0) return { label: 'Expired', bg: '#fee2e2', fg: '#991b1b' };
  if (days < 10) return { label: 'Expiring', bg: '#fee2e2', fg: '#991b1b' };
  if (days <= 30) return { label: 'Expiring Soon', bg: '#fef3c7', fg: '#92400e' };
  return { label: 'Active', bg: '#dcfce7', fg: '#065f46' };
}

function has(val, term) {
  return (val || '').toLowerCase().includes(term);
}

function blankRow(projectId) {
  return {
    project_id: projectId,
    full_name: '',
    role: '',
    company: '',
    cert_type: '',
    cert_no: '',
    cert_url: null,
    issue_date: null,
    expiry_date: null,
    notes: '',
  };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function Personnel() {
  const project = useProject();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [errorId, setErrorId] = useState(null);

  // Slide-in panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [newRow, setNewRow] = useState(() => blankRow(project.id));

  // -- Fetch data -------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await fetchAll(
          getSupabase()
            .from('personnel_qualifications')
            .select('*')
            .eq('project_id', project.id)
            .order('full_name', { ascending: true })
        );
        if (!cancelled) setRows(data);
      } catch (e) {
        console.error('personnel load error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [project.id]);

  // -- Auto-save --------------------------------------------------------------

  async function autoSave(rowId, updates) {
    setSavingId(rowId);
    const { error } = await getSupabase()
      .from('personnel_qualifications')
      .update(updates)
      .eq('id', rowId);
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

  // -- Upload cert ------------------------------------------------------------

  async function handleUpload(row) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const pathKey = `${project.id}/personnel-qualifications/${row.cert_no || row.id}.pdf`;
      const { error: upErr } = await getSupabase().storage
        .from('quality-docs')
        .upload(pathKey, file, { upsert: true });
      if (upErr) {
        console.error('upload error', upErr);
        return;
      }
      const certUrl = `quality-docs:${pathKey}`;
      await autoSave(row.id, { cert_url: certUrl });
    };
    input.click();
  }

  // -- Add person -------------------------------------------------------------

  async function handleAddPerson() {
    const payload = { ...newRow, project_id: project.id };
    const { data, error } = await getSupabase()
      .from('personnel_qualifications')
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error('insert error', error);
      return;
    }
    setRows(prev => [...prev, data]);
    setNewRow(blankRow(project.id));
    setPanelOpen(false);
  }

  // -- Filtered rows ----------------------------------------------------------

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter(r =>
      has(r.full_name, term) || has(r.cert_type, term) || has(r.company, term)
    );
  }, [rows, search]);

  // -- Stats ------------------------------------------------------------------

  const stats = useMemo(() => {
    let total = rows.length;
    let valid = 0;
    let expiringSoon = 0;
    let expired = 0;
    for (const r of rows) {
      const days = daysUntil(r.expiry_date);
      if (days === null) { valid++; continue; }
      if (days < 0) { expired++; }
      else if (days <= 30) { expiringSoon++; }
      else { valid++; }
    }
    return { total, valid, expiringSoon, expired };
  }, [rows]);

  // -- Render -----------------------------------------------------------------

  return (
    <div style={{ padding: 'var(--space-lg)', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Personnel Qualifications</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            {project.code} &mdash; {project.name}
          </p>
        </div>
        <button style={bPri} onClick={() => { setNewRow(blankRow(project.id)); setPanelOpen(true); }}>
          + Add Person
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
        <StatCard label="Total Personnel" value={stats.total} />
        <StatCard label="Valid" value={stats.valid} color="#065f46" />
        <StatCard label="Expiring Soon" value={stats.expiringSoon} color="#92400e" />
        <StatCard label="Expired" value={stats.expired} color="#991b1b" />
      </div>

      {/* Search */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <input
          type="text"
          placeholder="Search by name, cert type, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...iSt, width: 320 }}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading personnel...
        </div>
      )}

      {/* Empty */}
      {!loading && rows.length === 0 && <Empty />}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={th}>Full Name</th>
                <th style={th}>Role</th>
                <th style={th}>Company</th>
                <th style={th}>Cert Type</th>
                <th style={th}>Cert No</th>
                <th style={th}>Issue Date</th>
                <th style={th}>Expiry Date</th>
                <th style={th}>Status</th>
                <th style={th}>Cert</th>
                <th style={{ ...th, width: 50, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isExpanded = expandedId === row.id;
                const isSaving = savingId === row.id;
                const isFlash = flashId === row.id;
                const isError = errorId === row.id;
                const status = statusBadge(row.expiry_date);

                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        cursor: 'pointer',
                        background: isFlash ? '#f0fdf4' : isError ? '#fef2f2' : 'transparent',
                        transition: 'background 0.3s',
                      }}
                    >
                      <td style={td}>{row.full_name || '\u2014'}</td>
                      <td style={td}>{row.role || '\u2014'}</td>
                      <td style={td}>{row.company || '\u2014'}</td>
                      <td style={td}>{row.cert_type || '\u2014'}</td>
                      <td style={td}>{row.cert_no || '\u2014'}</td>
                      <td style={td}>{fmtDate(row.issue_date)}</td>
                      <td style={td}>{fmtDate(row.expiry_date)}</td>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                          fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                          background: status.bg, color: status.fg,
                        }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={td} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {row.cert_url && (
                            <a
                              href={row.cert_url.startsWith('http') ? row.cert_url : '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 12, color: 'var(--color-primary)', textDecoration: 'underline' }}
                            >
                              View
                            </a>
                          )}
                          <button style={{ ...bSec, padding: '4px 10px', fontSize: 12 }} onClick={() => handleUpload(row)}>
                            Upload
                          </button>
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ fontSize: 14, transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                          &#9654;
                        </span>
                      </td>
                    </tr>

                    {/* Expanded inline edit panel */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, background: 'var(--color-bg, #fafafa)' }}>
                          <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                            gap: 'var(--space-md)', padding: 'var(--space-lg)',
                          }}>
                            {/* Full Name */}
                            <label style={{ display: 'block' }}>
                              <span style={lbl}>Full Name</span>
                              <input type="text" defaultValue={row.full_name || ''} style={fi}
                                onBlur={(e) => { if (e.target.value !== (row.full_name || '')) autoSave(row.id, { full_name: e.target.value || null }); }} />
                            </label>

                            {/* Role */}
                            <label style={{ display: 'block' }}>
                              <span style={lbl}>Role</span>
                              <input type="text" defaultValue={row.role || ''} style={fi}
                                onBlur={(e) => { if (e.target.value !== (row.role || '')) autoSave(row.id, { role: e.target.value || null }); }} />
                            </label>

                            {/* Company */}
                            <label style={{ display: 'block' }}>
                              <span style={lbl}>Company</span>
                              <input type="text" defaultValue={row.company || ''} style={fi}
                                onBlur={(e) => { if (e.target.value !== (row.company || '')) autoSave(row.id, { company: e.target.value || null }); }} />
                            </label>

                            {/* Cert Type */}
                            <label style={{ display: 'block' }}>
                              <span style={lbl}>Cert Type</span>
                              <input type="text" defaultValue={row.cert_type || ''} style={fi}
                                onBlur={(e) => { if (e.target.value !== (row.cert_type || '')) autoSave(row.id, { cert_type: e.target.value || null }); }} />
                            </label>

                            {/* Cert No */}
                            <label style={{ display: 'block' }}>
                              <span style={lbl}>Cert No</span>
                              <input type="text" defaultValue={row.cert_no || ''} style={fi}
                                onBlur={(e) => { if (e.target.value !== (row.cert_no || '')) autoSave(row.id, { cert_no: e.target.value || null }); }} />
                            </label>

                            {/* Issue Date */}
                            <label style={{ display: 'block' }}>
                              <span style={lbl}>Issue Date</span>
                              <input type="date" defaultValue={row.issue_date ? String(row.issue_date).split('T')[0] : ''} style={fi}
                                onChange={(e) => autoSave(row.id, { issue_date: e.target.value || null })} />
                            </label>

                            {/* Expiry Date */}
                            <label style={{ display: 'block' }}>
                              <span style={lbl}>Expiry Date</span>
                              <input type="date" defaultValue={row.expiry_date ? String(row.expiry_date).split('T')[0] : ''} style={fi}
                                onChange={(e) => autoSave(row.id, { expiry_date: e.target.value || null })} />
                            </label>

                            {/* Notes (full width) */}
                            <label style={{ display: 'block', gridColumn: '1 / -1' }}>
                              <span style={lbl}>Notes</span>
                              <textarea defaultValue={row.notes || ''} rows={3}
                                style={{ ...fi, resize: 'vertical' }}
                                onBlur={(e) => { if (e.target.value !== (row.notes || '')) autoSave(row.id, { notes: e.target.value || null }); }} />
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-in Add Person Panel */}
      {panelOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setPanelOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 49,
            }}
          />
          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
            background: '#fff', zIndex: 50,
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--color-border)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Add Person</h2>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Full Name</span>
                <input type="text" value={newRow.full_name} style={fi}
                  onChange={(e) => setNewRow(prev => ({ ...prev, full_name: e.target.value }))} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Role</span>
                <input type="text" value={newRow.role} style={fi}
                  onChange={(e) => setNewRow(prev => ({ ...prev, role: e.target.value }))} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Company</span>
                <input type="text" value={newRow.company} style={fi}
                  onChange={(e) => setNewRow(prev => ({ ...prev, company: e.target.value }))} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Cert Type</span>
                <input type="text" value={newRow.cert_type} style={fi}
                  onChange={(e) => setNewRow(prev => ({ ...prev, cert_type: e.target.value }))} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Cert No</span>
                <input type="text" value={newRow.cert_no} style={fi}
                  onChange={(e) => setNewRow(prev => ({ ...prev, cert_no: e.target.value }))} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Issue Date</span>
                <input type="date" value={newRow.issue_date || ''} style={fi}
                  onChange={(e) => setNewRow(prev => ({ ...prev, issue_date: e.target.value || null }))} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Expiry Date</span>
                <input type="date" value={newRow.expiry_date || ''} style={fi}
                  onChange={(e) => setNewRow(prev => ({ ...prev, expiry_date: e.target.value || null }))} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Notes</span>
                <textarea value={newRow.notes} rows={3} style={{ ...fi, resize: 'vertical' }}
                  onChange={(e) => setNewRow(prev => ({ ...prev, notes: e.target.value }))} />
              </label>
            </div>
            <div style={{ padding: 'var(--space-lg)', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button style={bSec} onClick={() => setPanelOpen(false)}>Cancel</button>
              <button style={bPri} onClick={handleAddPerson}>Save</button>
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
    <div style={{
      padding: 'var(--space-xl)', background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
        No personnel records found.
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        Add personnel qualifications using the button above.
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
