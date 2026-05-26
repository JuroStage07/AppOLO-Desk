import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthCtx } from "./AuthProvider";

/** Rutas permitidas cuando el perfil tiene epaAdmin: true */
const EPA_ADMIN_ALLOWED =
  /^\/$|^\/welcome$|^\/areas$|^\/epa(\/.*)?$|^\/config-region$|^\/salud\/aperturas\/detalle\//;

export default function EpaAdminRouteGuard({ children }) {
  const { profile } = useContext(AuthCtx);
  const { pathname } = useLocation();

  if (profile?.epaAdmin === true && !EPA_ADMIN_ALLOWED.test(pathname)) {
    return <Navigate to="/epa" replace />;
  }

  return children;
}
