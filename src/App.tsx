import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryProvider } from './lib/react-query';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import { GuestRoute, ProtectedRoute, RootRedirect } from './components/auth/RouteGuards';
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
      </Route>

      <Route path="/verify-email" element={<div className="p-8">Verify Email - Coming Soon</div>} />
      <Route path="/forgot-password" element={<div className="p-8">Forgot Password - Coming Soon</div>} />
    </Routes>
  );
}

function App() {
  return (
    <QueryProvider>
      <Router>
        <AppRoutes />
      </Router>
    </QueryProvider>
  );
}

export default App;
