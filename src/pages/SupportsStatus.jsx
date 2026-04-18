import { useEffect, useState, useMemo } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { utils, writeFile } from 'xlsx';

// -- Status progression (ordered) ---------------------------------------------

const STATUS_ORDER = ['not_started', 'fitup', 'welded', 'inspected', 'painted', 'complete'];

function statusIndex(s) {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

// =============================================================================
// MAIN
// =============================================================================

export default function SupportsStatus() {
  const project = useProject();

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [fEidos, setFEidos]       = useState('');
  const [fShopField, setFShopField] = useState('');

  // -- fetch ------------------------------------------------------------------

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const data = await fetchAll(
        getSupabase().from('supports_list').select('*').eq('project_id', project.id)
      );
      if (!c) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => { c = true; };
  }, [project.id]);

  // -- distinct eidos for filter dropdown -------------------------------------

  const eidosOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.eidos).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  // -- filtered rows ----------------------------------------------------------

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fEidos && r.eidos !== fEidos) return false;
      if (fShopField === 'shop' && r.is_field === true) return false;
      if (fShopField === 'field' && r.is_field !== true) return false;
      return true;
    });
  }, [rows, fEidos, fShopField]);

  // -- pivot table ------------------------------------------------------------

  const pivot = useMemo(() => {
    const map = {};

    for (const r of filtered) {
      const key = r.eidos || '(none)';
      if (!map[key]) {
        map[key] = { eidos: key, total: 0, fitup: 0, welded: 0, inspected: 0, painted: 0, complete: 0 };
      }
      const g = map[key];
      g.total += 1;

      const idx = statusIndex(r.status);
      // Cumulative: if status >= fitup, count toward fitup, etc.
      if (idx >= 1) g.fitup += 1;
      if (idx >= 2) g.welded += 1;
      if (idx >= 3) g.inspected += 1;
      if (idx >= 4) g.painted += 1;
      if (idx >= 5) g.complete += 1;
    }

    const sorted = Object.values(map).sort((a, b) => a.eidos.localeCompare(b.eidos));

    // totals row
    const totals = { eidos: 'TOTAL', total: 0, fitup: 0, welded: 0, inspected: 0, painted: 0, complete: 0 };
    for (const g of sorted) {
      totals.total += g.total;
      totals.fitup += g.fitup;
      totals.welded += g.welded;
      totals.inspected += g.inspected;
      totals.painted += g.painted;
      totals.complete += g.complete;
    }

    return { rows: sorted, totals };
  }, [filtered]);

  // -- export -----------------------------------------------------------------

  function exportXlsx() {
    const out = [...pivot.rows, pivot.totals].map((r) => ({
      'Eidos': r.eidos,
      'Total': r.total,
      'Fit-Up': r.fitup,
      'Welded': r.welded,
      'Inspected': r.inspected,
      'Painted': r.painted,
      'Complete': r.complete,
      'Progress %': r.total > 0 ? Math.round((r.complete / r.total) * 100) : 0,
    }));
    const ws = utils.json_to_sheet(out);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Supports Status');
    writeFile(wb, `${project.code}_Supports_Status.xlsx`);
  }

  // -- progress bar helper ----------------------------------------------------

  function ProgressBar({ value }) {
    const pct = Math.round(value);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 80, height: 8, borderRadius: 4,
          background: 'var(--color-border)', overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{
            width: `${Math.min(pct, 100)}%`, height: '100%',
            background: '#059669', borderRadius: 4,
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{pct}%</span>
      </div>
    );
  }

  // -- render -----------------------------------------------------------------

  const COLS = [
    { k: 'eidos',     l: 'Eidos' },
    { k: 'total',     l: 'Total' },
    { k: 'fitup',     l: 'Fit-Up' },
    { k: 'welded',    l: 'Welded' },
    { k: 'inspected', l: 'Inspected' },
    { k: 'painted',   l: 'Painted' },
    { k: 'complete',  l: 'Complete' },
    { k: 'progress',  l: 'Progress %' },
  ];

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
            <h1 style={{ fontSize:22, fontWeight:600, marginBottom:2 }}>Supports Status</h1>
            <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>{project.name}</p>
          </div>
          <div style={{ display:'flex', gap:'var(--space-sm)' }}>
            <button onClick={exportXlsx} style={bSec}>Export</button>
          </div>
        </div>

        {/* filters */}
        <div style={{ display:'flex', gap:'var(--space-sm)', marginBottom:'var(--space-md)', flexWrap:'wrap' }}>
          <select value={fEidos} onChange={(e) => setFEidos(e.target.value)} style={sSt}>
            <option value="">All Eidos Types</option>
            {eidosOptions.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select value={fShopField} onChange={(e) => setFShopField(e.target.value)} style={sSt}>
            <option value="">Shop + Field</option>
            <option value="shop">Shop</option>
            <option value="field">Field</option>
          </select>
        </div>

        {/* body */}
        {loading ? (
          <p style={{ color:'var(--color-text-muted)' }}>Loading&hellip;</p>
        ) : rows.length === 0 ? (
          <div style={{ padding:'var(--space-xl)', background:'var(--color-surface)',
                        border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)',
                        textAlign:'center' }}>
            <p style={{ fontSize:15, color:'var(--color-text-secondary)', marginBottom:'var(--space-xs)' }}>
              No supports found.
            </p>
            <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>
              Import data to see the supports status summary.
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize:12, color:'var(--color-text-muted)', marginBottom:'var(--space-sm)' }}>
              {filtered.length} of {rows.length} supports
            </p>

            <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)',
                           borderRadius:'var(--radius-lg)', overflowX:'auto', width:'100%' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--color-border)', background:'var(--color-bg)' }}>
                    {COLS.map((c) => (
                      <th key={c.k} style={{ ...th, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>{c.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pivot.rows.length === 0 ? (
                    <tr><td colSpan={COLS.length} style={{ padding:'var(--space-lg)', textAlign:'center', color:'var(--color-text-muted)' }}>
                      No results match your filters
                    </td></tr>
                  ) : (
                    <>
                      {pivot.rows.map((row) => (
                        <tr key={row.eidos} style={{ borderBottom:'1px solid var(--color-border)' }}>
                          <td style={{ ...td, fontWeight:500 }}>{row.eidos}</td>
                          <td style={td}>{row.total}</td>
                          <td style={td}>{row.fitup}</td>
                          <td style={td}>{row.welded}</td>
                          <td style={td}>{row.inspected}</td>
                          <td style={td}>{row.painted}</td>
                          <td style={td}>{row.complete}</td>
                          <td style={td}>
                            <ProgressBar value={row.total > 0 ? (row.complete / row.total) * 100 : 0} />
                          </td>
                        </tr>
                      ))}
                      {/* totals row */}
                      <tr style={{ borderTop:'2px solid var(--color-border)', background:'var(--color-bg)' }}>
                        <td style={{ ...td, fontWeight:700 }}>{pivot.totals.eidos}</td>
                        <td style={{ ...td, fontWeight:700 }}>{pivot.totals.total}</td>
                        <td style={{ ...td, fontWeight:700 }}>{pivot.totals.fitup}</td>
                        <td style={{ ...td, fontWeight:700 }}>{pivot.totals.welded}</td>
                        <td style={{ ...td, fontWeight:700 }}>{pivot.totals.inspected}</td>
                        <td style={{ ...td, fontWeight:700 }}>{pivot.totals.painted}</td>
                        <td style={{ ...td, fontWeight:700 }}>{pivot.totals.complete}</td>
                        <td style={{ ...td, fontWeight:700 }}>
                          <ProgressBar value={pivot.totals.total > 0 ? (pivot.totals.complete / pivot.totals.total) * 100 : 0} />
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
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
const sSt = {
  padding:'var(--space-sm) var(--space-md)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
  fontSize:13, outline:'none', background:'var(--color-surface)', cursor:'pointer',
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
