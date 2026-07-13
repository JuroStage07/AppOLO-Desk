import React from "react";
import { Navigate } from "react-router-dom";

export default function RequireTenant({ children }) {
  const raw = localStorage.getItem("appolo_profile");
  const profile = raw ? JSON.parse(raw) : null;

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  // Falta país o bodega → a configurar. La bodega es obligatoria: las reglas de
  // Firestore (sameTenantScopeData) exigen que el perfil tenga bodegaId para leer
  // documentos con bodega asignada.
  if (!profile.tenantId || !profile.bodegaId) {
    return <Navigate to="/config-region" replace />;
  }

  return children;
}