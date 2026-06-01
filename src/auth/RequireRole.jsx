import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthCtx } from "./AuthProvider";

/**
 * Restringe el acceso a rutas según el role del profile.
 * Uso: <RequireRole roles={["admin", "dev"]}> ... </RequireRole>
 * Si el usuario no tiene un role permitido, lo redirige a /areas.
 */
export default function RequireRole({ roles = [], children }) {
  const { role, loading } = useContext(AuthCtx);

  if (loading) return null;

  if (!roles.includes(role)) {
    return <Navigate to="/areas" replace />;
  }

  return children;
}
