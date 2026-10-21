import { useContext, useMemo } from "react";
import { AuthCtx } from "../auth/AuthProvider";
import { getOtAccess } from "../config/otAccess";

/** Acciones de OTs que puede hacer el usuario actual (ver config/otAccess.js). */
export default function useOtAccess() {
  const { role, permisos, profile } = useContext(AuthCtx) || {};
  return useMemo(() => getOtAccess({ role, permisos, profile }), [role, permisos, profile]);
}
