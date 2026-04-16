import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function AuthGuard({ children }) {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return children;
}
