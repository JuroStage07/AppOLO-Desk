// MRP Tarimas — capacidades del perfil activo (secciones + escritura).
// Envuelve config/mrpAccess.js sobre AuthCtx para que las pantallas no tengan
// que resolver rol/permisos a mano.
import { useContext, useMemo } from "react";
import { AuthCtx } from "../../auth/AuthProvider";
import {
  canAccessMrpPath,
  canMrpAjustes,
  canMrpInsumos,
  canMrpTraslados,
  isMrpRestrictedProfile,
} from "../../config/mrpAccess";

export default function useMrpAccess() {
  const { profile, permisos, role } = useContext(AuthCtx) || {};

  return useMemo(() => {
    const ctx = { profile, permisos, role };
    return {
      restricted: isMrpRestrictedProfile(ctx),
      canAjustes: canMrpAjustes(ctx),
      canTraslados: canMrpTraslados(ctx),
      canInsumos: canMrpInsumos(ctx),
      canAccessPath: (path) => canAccessMrpPath(path, ctx),
    };
  }, [profile, permisos, role]);
}
