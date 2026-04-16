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
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
