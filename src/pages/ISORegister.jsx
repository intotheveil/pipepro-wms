import { useEffect, useState } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';

const STATUS_STYLES = {
  NOT_STARTED: { background: '#e5e7eb', color: '#374151', label: 'Not Started' },
  IN_PROGRESS: { background: '#fef3c7', color: '#92400e', label: 'In Progress' },
  COMPLETE:    { background: '#d1fae5', color: '#065f46', label: 'Complete' },
  ON_HOLD:     { background: '#fee2e2', color: '#991b1b', label: 'On Hold' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.NOT_STARTED;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: s.background,
        color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

export default function ISORegister() {
  const project = useProject();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data } = await getSupabase()
          .from('iso_register')
          .select('id, drawing_no, revision, fluid_code, piping_class, size_nps, status')
          .eq('project_id', project.id)
          .order('drawing_no');
        if (!cancelled) setRows(data || []);
      } catch {
        // query failed
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [project.id]);

  const term = search.toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (r.drawing_no || '').toLowerCase().includes(term) ||
      (r.fluid_code || '').toLowerCase().includes(term)
  );

  return (
    <div style={{ padding: 'var(--space-lg) var(--space-xl)' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-lg)',
          flexWrap: 'wrap',
          gap: 'var(--space-md)',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>ISO Register</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {project.name}
          </p>
        </div>
        <input
          type="text"
          placeholder="Search drawing no. or fluid code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 280,
            padding: 'var(--space-sm) var(--space-md)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            outline: 'none',
            background: 'var(--color-surface)',
          }}
        />
      </div>

      {/* Content */}
      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-xl)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
            No ISOs found.
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Import data to get started.
          </p>
        </div>
      ) : (
        <>
          {/* Results count */}
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-muted)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            {filtered.length} of {rows.length} ISOs
          </p>

          {/* Table */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                  }}
                >
                  {['Drawing No.', 'Rev', 'Fluid Code', 'Piping Class', 'Size (NPS)', 'Status'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '10px var(--space-md)',
                          fontWeight: 600,
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: 'var(--space-lg)',
                        textAlign: 'center',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      No results match "{search}"
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'var(--color-bg)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      <td style={{ padding: '10px var(--space-md)', fontWeight: 500 }}>
                        {row.drawing_no || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {row.revision || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {row.fluid_code || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {row.piping_class || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        {row.size_nps || '\u2014'}
                      </td>
                      <td style={{ padding: '10px var(--space-md)' }}>
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
