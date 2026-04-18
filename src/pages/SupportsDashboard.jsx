import { useEffect, useState, useMemo } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// -- Status config ------------------------------------------------------------

const STATUS_ORDER = ['not_started', 'fitup', 'welded', 'inspected', 'painted', 'complete'];

const STATUS_META = {
  not_started: { label: 'Not Started', color: '#e5e7eb' },
  fitup:       { label: 'Fit-Up',      color: '#3b82f6' },
  welded:      { label: 'Welded',      color: '#059669' },
  inspected:   { label: 'Inspected',   color: '#0d9488' },
  painted:     { label: 'Painted',     color: '#d97706' },
  complete:    { label: 'Complete',    color: '#064e3b' },
};

// =============================================================================
// MAIN
// =============================================================================

export default function SupportsDashboard() {
  const project = useProject();

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchAll(
        getSupabase().from('supports_list').select('*').eq('project_id', project.id)
      );
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  // -- computed KPIs ----------------------------------------------------------

  const kpis = useMemo(() => {
    const total = rows.length;
    const totalWeight = rows.reduce((s, r) => s + (Number(r.weight_kg) || 0), 0);
    const weldedIdx = STATUS_ORDER.indexOf('welded');
    const welded = rows.filter((r) => STATUS_ORDER.indexOf(r.status) >= weldedIdx).length;
    const complete = rows.filter((r) => r.status === 'complete').length;
    return { total, totalWeight, welded, complete };
  }, [rows]);

  // -- eidos chart data -------------------------------------------------------

  const eidosData = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const key = r.eidos || 'Unknown';
      map[key] = (map[key] || 0) + 1;
    }
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = entries.length ? entries[0][1] : 1;
    return { entries, max };
  }, [rows]);

  // -- weight by status -------------------------------------------------------

  const weightByStatus = useMemo(() => {
    const map = {};
    for (const s of STATUS_ORDER) map[s] = 0;
    for (const r of rows) {
      const st = r.status || 'not_started';
      if (map[st] !== undefined) map[st] += Number(r.weight_kg) || 0;
    }
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return { map, total };
  }, [rows]);

  // -- render -----------------------------------------------------------------

  return (
    <div style={{ padding: 'var(--space-lg) var(--space-xl)', height: '100%', overflow: 'auto' }}>

      {/* header */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Supports Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{project.name}</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
      ) : rows.length === 0 ? (
        <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                      textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
            No supports found.
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Import data to view the dashboard.
          </p>
        </div>
      ) : (
        <>
          {/* 1 — KPI Cards */}
          <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
            <KPICard label="Total Supports" value={kpis.total} />
            <KPICard label="Total Weight" value={kpis.totalWeight.toLocaleString() + ' kg'} />
            <KPICard label="Welded" value={kpis.welded} color="var(--color-primary)" />
            <KPICard label="Complete" value={kpis.complete} color="#059669" />
          </div>

          {/* 2 — Bar chart by Eidos */}
          <div style={card}>
            <h2 style={cardTitle}>Supports by Eidos Type</h2>
            <div>
              {eidosData.entries.map(([name, count]) => (
                <div key={name} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, minWidth: 120, flexShrink: 0 }}>{name}</span>
                    <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 32, position: 'relative' }}>
                      <div style={{
                        width: `${(count / eidosData.max) * 100}%`,
                        background: '#3b82f6',
                        height: 32,
                        borderRadius: 4,
                        minWidth: 2,
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3 — Progress by weight */}
          <div style={card}>
            <h2 style={cardTitle}>Progress by Weight</h2>

            {/* segmented bar */}
            <div style={{ width: '100%', height: 16, borderRadius: 8, overflow: 'hidden', display: 'flex', background: '#e5e7eb' }}>
              {STATUS_ORDER.map((s) => {
                const w = weightByStatus.total > 0
                  ? (weightByStatus.map[s] / weightByStatus.total) * 100
                  : 0;
                if (w === 0) return null;
                return (
                  <div key={s} style={{
                    width: `${w}%`,
                    background: STATUS_META[s].color,
                    height: 16,
                  }} />
                );
              })}
            </div>

            {/* legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
              {STATUS_ORDER.map((s) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: STATUS_META[s].color, display: 'inline-block', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {STATUS_META[s].label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>
                    {weightByStatus.map[s].toLocaleString()} kg
                  </span>
                </div>
              ))}
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

function KPICard({ label, value, color }) {
  return (
    <div style={{
      padding: 'var(--space-md) var(--space-lg)',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      minWidth: 140,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--color-text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const card = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-lg)',
  marginBottom: 'var(--space-lg)',
};

const cardTitle = {
  fontSize: 15, fontWeight: 600, marginBottom: 'var(--space-md)',
};
