import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from './lib/react-query';
import { useAuthStore } from './stores/auth.store';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import './App.css';

function AppRoutes() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      {/* Add more routes as needed */}
      <Route path="/dashboard" element={<div className="p-8">Dashboard - Coming Soon</div>} />
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
