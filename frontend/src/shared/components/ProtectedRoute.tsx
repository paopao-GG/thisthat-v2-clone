import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@shared/contexts/AuthContext';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute - Wraps routes that require authentication
 * Redirects to pre-login page if user is not authenticated
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  // Show nothing while checking authentication status
  if (loading) {
    return null;
  }

  // Redirect to pre-login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;


