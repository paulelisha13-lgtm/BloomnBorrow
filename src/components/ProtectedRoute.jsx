import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getStoredUser, getToken } from "../lib/api";

export function ProtectedRoute({ children, roles }) {
  const location = useLocation();
  const token = getToken();
  const user = getStoredUser();
  if (!token || !user) {
    // Remember where they were headed so login can send them straight back.
    return <Navigate to={`/access/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    // Signed in but this page is admin-only: back to the dashboard, which every
    // role can open (so this never loops).
    return <Navigate to="/admin" replace />;
  }
  return children;
}
