import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthCtx } from "./AuthProvider";
import { canAccessByRoleOrPermission } from "../config/permissions";
import { findRouteAccessRule } from "../config/routeAccess";

export default function RequireRouteAccess({ children }) {
  const { pathname } = useLocation();
  const authCtx = useContext(AuthCtx) || {};
  const { loading, role, permisos, profile } = authCtx;

  if (loading) return null;

  const rule = findRouteAccessRule(pathname);
  if (!rule) return children;

  if (rule.allowEpaAdmin && profile?.epaAdmin === true) {
    return children;
  }

  const allowed = canAccessByRoleOrPermission(
    { role, permisos, profile },
    {
      roles: rule.roles || [],
      allowedRoles: rule.allowedRoles || [],
      anyPerms: rule.anyPerms || [],
      allPerms: rule.allPerms || [],
      adminOverride: rule.adminOverride !== false,
    }
  );

  if (!allowed) {
    return <Navigate to="/areas" replace />;
  }

  return children;
}
