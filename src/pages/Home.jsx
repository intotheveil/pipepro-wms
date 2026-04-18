import { useState, useEffect, useMemo } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { getNotifications } from '../lib/notifications';
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';

// ---- inject spinner keyframes once ----
if (typeof document !== 'undefined' && !document.getElementById('_spinkf')) {
  const s = document.createElement('style');
  s.id = '_spinkf';
  s.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({ label, value, color }) {
  return (
    <div style={{
      ...card,
      flex: '1 1 0',
      minWidth: 140,
      textAlign: 'center',
      marginBottom: 0,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--color-text)' }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  );
}

// =============================================================================
// WELD STATUS COLORS
// =============================================================================

const WELD_STATUS_COLORS = {
  not_started: '#e5e7eb',
  fit_up:      '#3b82f6',
  welded:      '#f59e0b',
  accepted:    '#22c55e',
  rejected:    '#ef4444',
};

const WELD_STATUS_LABELS = {
  not_started: 'Not Started',
  fit_up:      'Fit-up',
  welded:      'Welded',
  accepted:    'Accepted',
  rejected:    'Rejected',
};

// =============================================================================
// SPOOL PIPELINE STAGES
// =============================================================================

const SPOOL_STAGES = [
  { key: 'material_checked', label: 'Material Check' },
  { key: 'fab_started',      label: 'Fab Started' },
  { key: 'fabricated',       label: 'Fabricated' },
  { key: 'qc_released',     label: 'QC Released' },
  { key: 'sent_to_paint',   label: 'Sent to Paint' },
  { key: 'painted',         label: 'Painted' },
  { key: 'at_laydown',      label: 'At Laydown' },
  { key: 'erected',         label: 'Erected' },
];

// =============================================================================
// HELPERS
// =============================================================================

/** Return ISO week string like "2026-W03" */
function isoWeek(dateStr) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function fmtTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// =============================================================================
// MAIN
// =============================================================================

export default function Home() {
  const project = useProject();
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [isoCount, setIsoCount] = useState(0);
  const [welds, setWelds] = useState([]);
  const [spools, setSpools] = useState([]);
  const [supports, setSupports] = useState([]);
  const [docCount, setDocCount] = useState(0);
  const [recentWelds, setRecentWelds] = useState([]);
  const [recentSupports, setRecentSupports] = useState([]);
  const [recentSpools, setRecentSpools] = useState([]);
  const [recentDocs, setRecentDocs] = useState([]);

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [
          notifs,
          isoRes,
          weldData,
          spoolData,
          supportData,
          docCountRes,
          rWelds,
          rSupports,
          rSpools,
          rDocs,
        ] = await Promise.all([
          getNotifications(supabase, project.id),
          supabase.from('iso_register').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
          fetchAll(supabase.from('weld_log').select('*').eq('project_id', project.id)),
          fetchAll(supabase.from('spools').select('*').eq('project_id', project.id)),
          fetchAll(supabase.from('supports_list').select('*').eq('project_id', project.id)),
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
          supabase.from('weld_log').select('weld_id, status, updated_at').eq('project_id', project.id).order('updated_at', { ascending: false }).limit(10),
          supabase.from('supports_list').select('support_mark, status, updated_at').eq('project_id', project.id).order('updated_at', { ascending: false }).limit(10),
          supabase.from('spools').select('spool_no, fabricated, qc_released, painted, erected, updated_at').eq('project_id', project.id).order('updated_at', { ascending: false }).limit(10),
          supabase.from('documents').select('doc_no, title, revision, uploaded_at').eq('project_id', project.id).order('uploaded_at', { ascending: false }).limit(5),
        ]);

        if (cancelled) return;

        setNotifications(notifs || []);
        setIsoCount(isoRes.count ?? 0);
        setWelds(weldData || []);
        setSpools(spoolData || []);
        setSupports(supportData || []);
        setDocCount(docCountRes.count ?? 0);
        setRecentWelds(rWelds.data || []);
        setRecentSupports(rSupports.data || []);
        setRecentSpools(rSpools.data || []);
        setRecentDocs(rDocs.data || []);
      } catch (e) {
        console.error('Home fetch error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  // -- KPIs -------------------------------------------------------------------

  const kpis = useMemo(() => {
    const weldTotal = welds.length;
    const weldedCount = welds.filter(w => w.welded || w.status === 'welded' || w.status === 'accepted').length;
    const fitUpCount = welds.filter(w => w.status === 'fit_up').length;
    const weldNotStarted = welds.filter(w => !w.status || w.status === 'not_started').length;

    const spoolTotal = spools.length;
    const spoolFab = spools.filter(s => s.fabricated).length;
    const spoolQC = spools.filter(s => s.qc_released).length;
    const spoolPainted = spools.filter(s => s.painted).length;

    const supTotal = supports.length;
    const supWelded = supports.filter(s => s.status === 'welded' || s.status === 'installed' || s.status === 'completed').length;
    const totalWeight = supports.reduce((a, s) => a + (parseFloat(s.weight_kg) || 0), 0);
    const weldedWeight = supports.filter(s => s.status === 'welded' || s.status === 'installed' || s.status === 'completed')
      .reduce((a, s) => a + (parseFloat(s.weight_kg) || 0), 0);
    const weightPct = totalWeight > 0 ? Math.round((weldedWeight / totalWeight) * 100) : 0;

    return {
      isoCount,
      weldTotal, weldedCount, fitUpCount, weldNotStarted,
      spoolTotal, spoolFab, spoolQC, spoolPainted,
      supTotal, supWelded, weightPct,
      docCount,
    };
  }, [welds, spools, supports, isoCount, docCount]);

  // -- Chart data: Weld Progress Pie ------------------------------------------

  const weldPieData = useMemo(() => {
    const counts = {};
    welds.forEach(w => {
      const s = w.status || 'not_started';
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(WELD_STATUS_LABELS).map(([key, label]) => ({
      name: label,
      value: counts[key] || 0,
      color: WELD_STATUS_COLORS[key],
    })).filter(d => d.value > 0);
  }, [welds]);

  // -- Chart data: Supports by eidos -----------------------------------------

  const supportsBarData = useMemo(() => {
    const eidosMap = {};
    supports.forEach(s => {
      const e = s.eidos || 'Unknown';
      if (!eidosMap[e]) eidosMap[e] = { eidos: e, total: 0, welded: 0 };
      eidosMap[e].total += 1;
      if (s.status === 'welded' || s.status === 'installed' || s.status === 'completed') {
        eidosMap[e].welded += 1;
      }
    });
    return Object.values(eidosMap);
  }, [supports]);

  // -- Chart data: Spool Pipeline ---------------------------------------------

  const spoolPipelineData = useMemo(() => {
    return SPOOL_STAGES.map(stage => ({
      name: stage.label,
      count: spools.filter(s => s[stage.key]).length,
    }));
  }, [spools]);

  // -- Chart data: Weekly Production ------------------------------------------

  const weeklyData = useMemo(() => {
    const now = new Date();
    const weeks = {};
    // Init last 12 weeks
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const wk = isoWeek(d.toISOString());
      weeks[wk] = 0;
    }
    welds.forEach(w => {
      if (!w.weld_date) return;
      const wk = isoWeek(w.weld_date);
      if (wk in weeks) weeks[wk] += 1;
    });
    return Object.entries(weeks).map(([week, count]) => ({ week, count }));
  }, [welds]);

  // -- Recent activity --------------------------------------------------------

  const recentActivity = useMemo(() => {
    const items = [];
    recentWelds.forEach(w => items.push({
      ts: w.updated_at,
      text: `Weld ${w.weld_id || '—'} — ${w.status || 'not started'}`,
    }));
    recentSupports.forEach(s => items.push({
      ts: s.updated_at,
      text: `Support ${s.support_mark || '—'} — ${s.status || 'not started'}`,
    }));
    recentSpools.forEach(s => {
      const stage = s.erected ? 'erected' : s.painted ? 'painted' : s.qc_released ? 'QC released' : s.fabricated ? 'fabricated' : 'in progress';
      items.push({
        ts: s.updated_at,
        text: `Spool ${s.spool_no || '—'} — ${stage}`,
      });
    });
    items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    return items.slice(0, 10);
  }, [recentWelds, recentSupports, recentSpools]);

  // -- loading spinner --------------------------------------------------------

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: '_spin .6s linear infinite' }} />
      </div>
    );
  }

  // -- render -----------------------------------------------------------------

  return (
    <div style={{ padding: 'var(--space-lg) var(--space-xl)', height: '100%', overflow: 'auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Dashboard</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }}>{project.name}</p>

      {/* SECTION 1 — NOTIFICATIONS */}
      {notifications.length > 0 && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          {notifications.map((n, i) => (
            <div key={i} style={{
              background: n.type === 'error' ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${n.type === 'error' ? '#fecaca' : '#fde68a'}`,
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-sm) var(--space-md)',
              marginBottom: 'var(--space-xs)',
              fontSize: 13,
              color: n.type === 'error' ? '#991b1b' : '#92400e',
            }}>
              ⚠️ {n.message}
            </div>
          ))}
        </div>
      )}

      {/* SECTION 2 — KPI STAT CARDS */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-lg)' }}>
        <StatCard label="ISO Drawings" value={kpis.isoCount} color="var(--color-primary)" />
        <StatCard label="Total Welds" value={kpis.weldTotal} />
        <StatCard label="Welded" value={kpis.weldedCount} color="#f59e0b" />
        <StatCard label="Fit-ups" value={kpis.fitUpCount} color="#3b82f6" />
        <StatCard label="Total Spools" value={kpis.spoolTotal} />
        <StatCard label="Fabricated" value={kpis.spoolFab} color="#34d399" />
        <StatCard label="QC Released" value={kpis.spoolQC} color="#10b981" />
        <StatCard label="Painted" value={kpis.spoolPainted} color="#059669" />
        <StatCard label="Supports" value={`${kpis.supWelded}/${kpis.supTotal}`} />
        <StatCard label="Weight %" value={`${kpis.weightPct}%`} color="#6366f1" />
        <StatCard label="Documents" value={kpis.docCount} />
      </div>

      {/* SECTION 3 — CHARTS ROW 1 */}
      <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
        {/* Weld Progress Pie */}
        <div style={{ ...card, flex: '1 1 400px', minWidth: 340, marginBottom: 0 }}>
          <div style={cardTitle}>Weld Progress</div>
          {weldPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={weldPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {weldPieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>No weld data</div>
          )}
        </div>

        {/* Supports by Type */}
        <div style={{ ...card, flex: '1 1 400px', minWidth: 340, marginBottom: 0 }}>
          <div style={cardTitle}>Supports Progress</div>
          {supportsBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={supportsBarData}>
                <XAxis dataKey="eidos" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#93c5fd" name="Total" />
                <Bar dataKey="welded" fill="#22c55e" name="Welded" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>No support data</div>
          )}
        </div>
      </div>

      {/* SECTION 3 — CHARTS ROW 2 */}
      <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
        {/* Spool Pipeline */}
        <div style={{ ...card, flex: '1 1 400px', minWidth: 340, marginBottom: 0 }}>
          <div style={cardTitle}>Spool Pipeline</div>
          {spoolPipelineData.some(d => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={spoolPipelineData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" name="Spools" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>No spool data</div>
          )}
        </div>

        {/* Weekly Production */}
        <div style={{ ...card, flex: '1 1 400px', minWidth: 340, marginBottom: 0 }}>
          <div style={cardTitle}>Weekly Weld Production</div>
          {weeklyData.some(d => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={weeklyData}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Welds" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>No weld date data</div>
          )}
        </div>
      </div>

      {/* SECTION 4 — RECENT ACTIVITY */}
      <div style={card}>
        <div style={cardTitle}>Recent Activity</div>
        {recentActivity.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            {recentActivity.map((item, i) => (
              <div key={i} style={{
                fontSize: 13,
                padding: 'var(--space-xs) 0',
                borderBottom: i < recentActivity.length - 1 ? '1px solid var(--color-border)' : 'none',
                color: 'var(--color-text)',
              }}>
                <span style={{ color: 'var(--color-text-muted)', marginRight: 8, fontSize: 12 }}>{fmtTimestamp(item.ts)}</span>
                {item.text}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No recent activity</div>
        )}
      </div>

      {/* SECTION 5 — DOCUMENT UPDATES */}
      <div style={card}>
        <div style={cardTitle}>Recent Documents</div>
        {recentDocs.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                <th style={th}>Doc No</th>
                <th style={th}>Title</th>
                <th style={th}>Rev</th>
                <th style={th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentDocs.map((doc, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={td}>{doc.doc_no || '—'}</td>
                  <td style={td}>{doc.title || '—'}</td>
                  <td style={td}>{doc.revision ?? '—'}</td>
                  <td style={td}>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No documents uploaded</div>
        )}
      </div>
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
  fontSize: 14,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: 'var(--color-text-secondary)',
  marginBottom: 'var(--space-md)',
};

const th = {
  padding: 'var(--space-xs) var(--space-sm)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const td = {
  padding: 'var(--space-xs) var(--space-sm)',
  color: 'var(--color-text)',
};
