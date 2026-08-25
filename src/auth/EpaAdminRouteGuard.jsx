import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthCtx } from "./AuthProvider";
import { canAccessMrpPath, isMrpPath, MRP_HOME } from "../config/mrpAccess";

/** Rutas permitidas cuando el perfil tiene epaAdmin: true */
const EPA_ADMIN_ALLOWED =
  /^\/$|^\/welcome$|^\/areas$|^\/epa(\/.*)?$|^\/config-region$|^\/(salud|seguridad)\/aperturas\/detalle\//;

export default function EpaAdminRouteGuard({ children }) {
  const { profile, permisos, role } = useContext(AuthCtx);
  const { pathname } = useLocation();

  // MRP Tarimas: acceso por sección. El permiso `mrpTarimas` lo sigue exigiendo
  // RequireRouteAccess; aquí se acotan las secciones — recorte de los perfiles
  // epaAdmin y permisos por sección, p. ej. `mrpInsumos` (ver mrpAccess.js).
  if (isMrpPath(pathname)) {
    return canAccessMrpPath(pathname, { profile, permisos, role }) ? (
      children
    ) : (
      <Navigate to={MRP_HOME} replace />
    );
  }

  if (profile?.epaAdmin === true) {
    if (!EPA_ADMIN_ALLOWED.test(pathname)) {
      return <Navigate to="/epa" replace />;
    }
  }

  return children;
}
