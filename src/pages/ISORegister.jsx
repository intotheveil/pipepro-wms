import { useProject } from '../lib/project.jsx';

export default function ISORegister() {
  const project = useProject();

  return (
    <div style={{ padding: 'var(--space-xl)' }}>
      <h1 style={{ fontSize: 22, marginBottom: 'var(--space-sm)' }}>ISO Register</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Coming soon — {project.name}
      </p>
    </div>
  );
}
