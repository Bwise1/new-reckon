import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from './lib/react-query';
import { ConfirmProvider } from './contexts/ConfirmProvider';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Settings from './pages/Settings';
import { GuestRoute, ProtectedRoute, RootRedirect } from './components/auth/RouteGuards';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import FeedbackWidget from './components/FeedbackWidget';
import './App.css';

// Admin dashboard is lazy-loaded: normal users never download its code. The
// real gate is the backend's separate admin auth — this is only bundle hygiene.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// Closed-beta switch (set at build time): hides self-signup. The backend
// enforces the same rule via REGISTRATION_DISABLED, which is the real gate.
export const REGISTRATION_DISABLED =
  import.meta.env.VITE_REGISTRATION_DISABLED === 'true';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route
          path="/signup"
          element={
            REGISTRATION_DISABLED ? <Navigate to="/login" replace /> : <Signup />
          }
        />
      </Route>

      <Route
        path="/admin"
        element={
          <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
            <AdminDashboard />
          </Suspense>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="/verify-email" element={<div className="p-8">Verify Email - Coming Soon</div>} />
      <Route path="/forgot-password" element={<div className="p-8">Forgot Password - Coming Soon</div>} />
    </Routes>
  );
}

function App() {
  return (
    <QueryProvider>
      <ConfirmProvider>
        <Router>
          <AppRoutes />
          {/* Inside Router: the widget reads the current route for context. */}
          <FeedbackWidget />
        </Router>
        <PWAUpdatePrompt />
      </ConfirmProvider>
    </QueryProvider>
  );
}

export default App;
