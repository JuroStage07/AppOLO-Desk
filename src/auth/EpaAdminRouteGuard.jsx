import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthCtx } from "./AuthProvider";
import { canAccessMrpPath, isMrpPath, MRP_HOME } from "../config/mrpAccess";

/** Rutas permitidas cuando el perfil tiene epaAdmin: true */
const EPA_ADMIN_ALLOWED =
  /^\/$|^\/welcome$|^\/areas$|^\/epa(\/.*)?$|^\/config-region$|^\/(salud|seguridad)\/aperturas\/detalle\//;

export default function EpaAdminRouteGuard({ children }) {
  const { profile } = useContext(AuthCtx);
  const { pathname } = useLocation();

  if (profile?.epaAdmin === true) {
    // MRP Tarimas: acceso parcial. El permiso `mrpTarimas` lo sigue exigiendo
    // RequireRouteAccess; aquí solo se acota a las secciones permitidas
    // (ver config/mrpAccess.js).
    if (isMrpPath(pathname)) {
      return canAccessMrpPath(pathname, { profile }) ? (
        children
      ) : (
        <Navigate to={MRP_HOME} replace />
      );
    }

    if (!EPA_ADMIN_ALLOWED.test(pathname)) {
      return <Navigate to="/epa" replace />;
    }
  }

  return children;
}
