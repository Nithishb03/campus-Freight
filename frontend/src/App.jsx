import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import RequesterDashboard from './pages/RequesterDashboard';
import AdminDashboard from './pages/AdminDashboard';
import DriverDashboard from './pages/DriverDashboard';

// Protected Route Component with Role Checks
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center space-x-3 text-slate-600 font-medium">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Authenticating campus session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to the dashboard appropriate for their actual role
    if (user.role === 'admin' || user.role === 'mailroom') {
      return <Navigate to="/admin" replace />;
    } else if (user.role === 'driver') {
      return <Navigate to="/driver" replace />;
    } else {
      return <Navigate to="/requester" replace />;
    }
  }

  return children;
};

// Root Redirect Component
const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin' || user.role === 'mailroom') {
    return <Navigate to="/admin" replace />;
  } else if (user.role === 'driver') {
    return <Navigate to="/driver" replace />;
  } else {
    return <Navigate to="/requester" replace />;
  }
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
          <Navbar />
          <main className="flex-1">
            <Routes>
              {/* Public Route */}
              <Route path="/login" element={<Login />} />

              {/* Requester Portal */}
              <Route
                path="/requester"
                element={
                  <ProtectedRoute allowedRoles={['requester', 'admin', 'mailroom']}>
                    <RequesterDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Admin & Mailroom Dashboard */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'mailroom']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Driver Dashboard */}
              <Route
                path="/driver"
                element={
                  <ProtectedRoute allowedRoles={['driver', 'admin']}>
                    <DriverDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Default Root Redirect */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
