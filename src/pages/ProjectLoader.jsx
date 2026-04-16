import { useParams, Outlet, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { ProjectContext } from '../lib/project.jsx';
import AppLayout from '../components/AppLayout';

export default function ProjectLoader() {
  const { projectSlug } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);

      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('projects')
          .select('*')
          .order('name');

        if (cancelled) return;

        const match = (data || []).find(
          (p) => (p.code || '').toLowerCase().replace(/\s+/g, '-') === projectSlug
        );

        if (match) {
          setProject(match);
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [projectSlug]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--color-text-muted)',
        }}
      >
        Loading project...
      </div>
    );
  }

  if (notFound) {
    return <Navigate to="/" replace />;
  }

  return (
    <ProjectContext.Provider value={project}>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </ProjectContext.Provider>
  );
}
