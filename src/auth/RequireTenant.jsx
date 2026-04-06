import React from "react";
import { Navigate } from "react-router-dom";

export default function RequireTenant({ children }) {
  const raw = localStorage.getItem("appolo_profile");
  const profile = raw ? JSON.parse(raw) : null;

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  // fkujo
  if (!profile.tenantId) {
    return <Navigate to="/config-region" replace />;
  }

  return children;
}