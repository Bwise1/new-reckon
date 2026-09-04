import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from './lib/react-query';
import { ConfirmProvider } from './contexts/ConfirmProvider';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import Settings from './pages/Settings';
import InviteAccept from './pages/InviteAccept';
import OrgInviteAccept from './pages/OrgInviteAccept';
import TeamSettings from './pages/TeamSettings';
import GeneralSettings from './pages/settings/GeneralSettings';
import BillingSettings from './pages/settings/BillingSettings';
import SecuritySettings from './pages/settings/SecuritySettings';
import { GuestRoute, ProtectedRoute, RootRedirect } from './components/auth/RouteGuards';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import './App.css';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/settings/general" element={<GeneralSettings />} />
        <Route path="/settings/billing" element={<BillingSettings />} />
        <Route path="/settings/security" element={<SecuritySettings />} />
        <Route path="/settings/team" element={<TeamSettings />} />
        <Route path="/settings/account" element={<Settings />} />
      </Route>

      {/* Reachable signed in or out: it decides what to show. */}
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route path="/org-invite/:token" element={<OrgInviteAccept />} />

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
        </Router>
        <PWAUpdatePrompt />
      </ConfirmProvider>
    </QueryProvider>
  );
}

export default App;
