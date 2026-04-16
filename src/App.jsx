import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import AuthGuard from './components/AuthGuard';
import LoginPage from './pages/LoginPage';
import ProjectPicker from './pages/ProjectPicker';
import ProjectLoader from './pages/ProjectLoader';
import ISORegister from './pages/ISORegister';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <AuthGuard>
                <ProjectPicker />
              </AuthGuard>
            }
          />

          <Route
            path="/p/:projectSlug"
            element={
              <AuthGuard>
                <ProjectLoader />
              </AuthGuard>
            }
          >
            <Route index element={<Navigate to="isos" replace />} />
            <Route path="isos" element={<ISORegister />} />

            {/* Placeholder routes for sidebar links */}
            <Route path="welds" element={<Placeholder title="Weld Log" />} />
            <Route path="spools" element={<Placeholder title="Spools" />} />
            <Route path="fabrication" element={<Placeholder title="Fab Dashboard" />} />
            <Route path="ndt" element={<Placeholder title="NDT Register" />} />
            <Route path="supports" element={<Placeholder title="Supports List" />} />
            <Route path="supports/status" element={<Placeholder title="Supports Status" />} />
            <Route path="supports/dashboard" element={<Placeholder title="Supports Dashboard" />} />
            <Route path="reports" element={<Placeholder title="Reports" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function Placeholder({ title }) {
  return (
    <div style={{ padding: 'var(--space-xl)' }}>
      <h1 style={{ fontSize: 22, marginBottom: 'var(--space-sm)' }}>{title}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Coming soon</p>
    </div>
  );
}
