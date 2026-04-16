import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth.jsx';

export default function LoginPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (authLoading) return null;
  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'var(--color-bg)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 380,
          padding: 'var(--space-xl)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
          <div style={{ fontSize: 28, marginBottom: 'var(--space-sm)' }}>PipePro WMS</div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Sign in to your account
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-danger)',
              fontSize: 13,
              marginBottom: 'var(--space-md)',
            }}
          >
            {error}
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 'var(--space-md)' }}>
          <span
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 'var(--space-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              width: '100%',
              padding: 'var(--space-sm) var(--space-md)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 'var(--space-lg)' }}>
          <span
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 'var(--space-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: 'var(--space-sm) var(--space-md)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px var(--space-md)',
            background: loading ? 'var(--color-primary-hover)' : 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'background var(--transition-fast)',
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
