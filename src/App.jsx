import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import AuthGuard from './components/AuthGuard';
import LoginPage from './pages/LoginPage';
import ProjectPicker from './pages/ProjectPicker';
import ProjectLoader from './pages/ProjectLoader';
import Home from './pages/Home';
import ISORegister from './pages/ISORegister';
import Import from './pages/Import';
import Documents from './pages/Documents';
import WeldLog from './pages/WeldLog';
import Welders from './pages/Welders';
import WPSRegister from './pages/WPSRegister';
import Spools from './pages/Spools';
import FabDashboard from './pages/FabDashboard';
import NDTRegister from './pages/NDTRegister';
import Supports from './pages/Supports';
import SupportsStatus from './pages/SupportsStatus';
import SupportsDashboard from './pages/SupportsDashboard';
import Materials from './pages/Materials';
import ISODetail from './pages/ISODetail';
import QCRecords from './pages/QCRecords';
import Personnel from './pages/Personnel';
import Equipment from './pages/Equipment';

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
            <Route index element={<Home />} />
            <Route path="iso/:fastNo" element={<ISODetail />} />
            <Route path="isos" element={<ISORegister />} />
            <Route path="welds" element={<WeldLog />} />
            <Route path="welders" element={<Welders />} />
            <Route path="wps" element={<WPSRegister />} />
            <Route path="spools" element={<Spools />} />
            <Route path="fabrication" element={<FabDashboard />} />
            <Route path="qc-records" element={<QCRecords />} />
            <Route path="materials" element={<Materials />} />
            <Route path="ndt" element={<NDTRegister />} />
            <Route path="supports" element={<Supports />} />
            <Route path="supports/status" element={<SupportsStatus />} />
            <Route path="supports/dashboard" element={<SupportsDashboard />} />
            <Route path="documents" element={<Documents />} />
            <Route path="personnel" element={<Personnel />} />
            <Route path="equipment" element={<Equipment />} />
            <Route path="import" element={<Import />} />
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
