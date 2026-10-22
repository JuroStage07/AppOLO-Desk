import { useCallback, useContext } from "react";

import { AuthCtx } from "../auth/AuthProvider";
import { canDo } from "../config/permissionCatalog";

/**
 * Permisos por botón: `const can = useCan(); can("despachoExportar")`.
 * Reglas en src/config/permissionCatalog.js (rol del sistema, clave explícita o
 * clave que ya la implica). El perfil llega en vivo, así que un cambio en la
 * matriz se refleja sin volver a iniciar sesión.
 */
export default function useCan() {
  const { role, permisos, profile } = useContext(AuthCtx) || {};
  return useCallback((key) => canDo({ role, permisos, profile }, key), [role, permisos, profile]);
}
