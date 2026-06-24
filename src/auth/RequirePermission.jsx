import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthCtx } from "./AuthProvider";
import { canAccessByRoleOrPermission } from "../config/permissions";

export default function RequirePermission({
  roles = [],
  allowedRoles = [],
  anyPerms = [],
  allPerms = [],
  adminOverride = true,
  redirectTo = "/areas",
  children,
}) {
  const authCtx = useContext(AuthCtx) || {};
  const { loading, role, permisos, profile } = authCtx;

  if (loading) return null;

  const allowed = canAccessByRoleOrPermission(
    { role, permisos, profile },
    { roles, allowedRoles, anyPerms, allPerms, adminOverride }
  );

  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
