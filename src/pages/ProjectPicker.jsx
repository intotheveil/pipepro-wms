import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth.jsx';

function toSlug(code) {
  return (code || '').toLowerCase().replace(/\s+/g, '-');
}

export default function ProjectPicker() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await getSupabase()
          .from('projects')
          .select('id, code, name, client, active_tier')
          .order('name');
        setProjects(data || []);
      } catch {
        // Supabase query failed
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg)',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-md) var(--space-lg)',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 16 }}>PipePro WMS</span>
        <button
          onClick={signOut}
          style={{
            padding: 'var(--space-xs) var(--space-md)',
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </header>

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'var(--space-xl)',
          overflow: 'auto',
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 'var(--space-xs)' }}>Select a Project</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }}>
          Choose a project to continue
        </p>

        {loading ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading projects...</p>
        ) : projects.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-xl)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center',
              maxWidth: 400,
            }}
          >
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
              No projects found.
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              Ask an admin to add you to a project.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 'var(--space-md)',
              width: '100%',
              maxWidth: 800,
            }}
          >
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/p/${toSlug(p.code)}/isos`)}
                style={{
                  padding: 'var(--space-lg)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'box-shadow var(--transition-fast)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text)' }}>
                  {p.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginTop: 'var(--space-xs)',
                  }}
                >
                  {p.code} {p.client ? `\u00b7 ${p.client}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
