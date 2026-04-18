import { useEffect, useState, useMemo } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// -- Stage definitions --------------------------------------------------------

const STAGES = [
  { key: 'material_checked', label: 'Material Check', color: '#93c5fd' },
  { key: 'fab_started',      label: 'Fab Started',    color: '#60a5fa' },
  { key: 'fabricated',       label: 'Fabricated',     color: '#34d399' },
  { key: 'qc_released',     label: 'QC Released',    color: '#10b981' },
  { key: 'sent_to_paint',   label: 'Painted',        color: '#059669' },
  { key: 'at_laydown',      label: 'At Laydown',     color: '#047857' },
  { key: 'erected',         label: 'Erected',        color: '#064e3b' },
];

// Note: "painted" uses the sent_to_paint field? Actually re-reading the spec:
// KPI cards show "Painted" = painted===true, pipeline shows "Painted" stage.
// The table schema has both sent_to_paint and painted as separate bools.
// Let me use the correct fields per the spec.

const KPI_CARDS = [
  { key: '_total',       label: 'TOTAL SPOOLS' },
  { key: 'fabricated',   label: 'FABRICATED' },
  { key: 'qc_released',  label: 'QC RELEASED' },
  { key: 'painted',      label: 'PAINTED' },
  { key: 'at_laydown',   label: 'AT LAYDOWN' },
  { key: 'erected',      label: 'ERECTED' },
];

const PIPELINE_STAGES = [
  { key: 'material_checked', label: 'Material Check', color: '#93c5fd' },
  { key: 'fab_started',      label: 'Fab Started',    color: '#60a5fa' },
  { key: 'fabricated',       label: 'Fabricated',     color: '#34d399' },
  { key: 'qc_released',     label: 'QC Released',    color: '#10b981' },
  { key: 'painted',         label: 'Painted',        color: '#059669' },
  { key: 'at_laydown',      label: 'At Laydown',     color: '#047857' },
  { key: 'erected',         label: 'Erected',        color: '#064e3b' },
];

const TABLE_STAGES = [
  { key: 'material_checked', label: 'Material Check' },
  { key: 'fab_started',      label: 'Fab Started' },
  { key: 'fabricated',       label: 'Fabricated' },
  { key: 'qc_released',     label: 'QC Released' },
  { key: 'painted',         label: 'Painted' },
  { key: 'at_laydown',      label: 'At Laydown' },
  { key: 'erected',         label: 'Erected' },
];

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

export default function FabDashboard() {
  const project = useProject();

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const data = await fetchAll(
        getSupabase().from('spools').select('*').eq('project_id', project.id)
      );
      if (!c) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // -- computed ---------------------------------------------------------------

  const kpis = useMemo(() => {
    const total = rows.length;
    const fabricated  = rows.filter((r) => r.fabricated).length;
    const qc_released = rows.filter((r) => r.qc_released).length;
    const painted     = rows.filter((r) => r.painted).length;
    const at_laydown  = rows.filter((r) => r.at_laydown).length;
    const erected     = rows.filter((r) => r.erected).length;
    return { _total: total, fabricated, qc_released, painted, at_laydown, erected };
  }, [rows]);

  const pipeline = useMemo(() => {
    return PIPELINE_STAGES.map((s) => ({
      ...s,
      count: rows.filter((r) => r[s.key]).length,
    }));
  }, [rows]);

  const maxPipeline = useMemo(() => Math.max(1, ...pipeline.map((s) => s.count)), [pipeline]);

  const breakdown = useMemo(() => {
    return TABLE_STAGES.map((s) => {
      const shop  = rows.filter((r) => r[s.key] && r.shop_field === 'shop').length;
      const field = rows.filter((r) => r[s.key] && r.shop_field === 'field').length;
      const total = rows.filter((r) => r[s.key]).length;
      return { label: s.label, shop, field, total };
    });
  }, [rows]);

  // -- render -----------------------------------------------------------------

  return (
    <div style={{ padding: 'var(--space-lg) var(--space-xl)', height: '100%', overflow: 'auto' }}>

      {/* header */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Fabrication Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{project.name}</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading&hellip;</p>
      ) : rows.length === 0 ? (
        <div style={{
          padding: 'var(--space-xl)', background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
            No spools found.
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Import data to populate the fabrication dashboard.
          </p>
        </div>
      ) : (
        <>
          {/* 1. KPI Cards */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)',
            marginBottom: 'var(--space-lg)',
          }}>
            {KPI_CARDS.map((card) => (
              <div key={card.key} style={{
                padding: 'var(--space-md) var(--space-lg)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                minWidth: 140,
              }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text)' }}>
                  {kpis[card.key]}
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--color-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: 4,
                }}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>

          {/* 2. Fabrication Pipeline */}
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)',
            marginBottom: 'var(--space-lg)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
              Fabrication Pipeline
            </h2>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 'var(--space-lg)',
              justifyContent: 'space-around', minHeight: 280,
            }}>
              {pipeline.map((stage) => {
                const pct = rows.length > 0 ? Math.round((stage.count / rows.length) * 100) : 0;
                const barH = Math.max(4, (stage.count / maxPipeline) * 200);
                return (
                  <div key={stage.key} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    flex: 1, minWidth: 60,
                  }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, marginBottom: 'var(--space-xs)',
                      color: 'var(--color-text)',
                    }}>
                      {stage.count}
                    </div>
                    <div style={{
                      width: '100%', maxWidth: 56, height: barH,
                      background: stage.color, borderRadius: 'var(--radius-sm)',
                    }} />
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
                      textAlign: 'center', marginTop: 'var(--space-sm)',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                    }}>
                      {stage.label}
                    </div>
                    <div style={{
                      fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2,
                    }}>
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Shop vs Field Breakdown */}
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            marginBottom: 'var(--space-lg)',
          }}>
            <div style={{ padding: 'var(--space-lg) var(--space-lg) 0' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-md)' }}>
                Shop vs Field Breakdown
              </h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                    <th style={th}>Stage</th>
                    <th style={th}>Shop</th>
                    <th style={th}>Field</th>
                    <th style={th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={td}>{row.label}</td>
                      <td style={td}>{row.shop}</td>
                      <td style={td}>{row.field}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
