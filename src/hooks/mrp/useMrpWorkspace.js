// MRP Tarimas — contexto de trabajo del módulo.
//
// Expone el tenant/company del usuario logeado (desde profiles/{uid} vía AuthCtx)
// y el ALMACÉN de trabajo, que ya no se elige a mano: se resuelve de la BODEGA
// activa (profiles/{uid}.bodegaId) según el vínculo bodega→almacén configurado en
// /dev/config-modulos/mrp-tarimas. Fija el scope runtime de los servicios para que
// TODAS las consultas/mutaciones usen el tenant/company correctos.
import { useContext, useEffect, useSyncExternalStore } from "react";
import { AuthCtx } from "../../auth/AuthProvider";
import { MRP_TENANT_ID, MRP_COMPANY, setMrpScope, setMrpUser } from "../../services/mrp";
import {
  getWorkspaceWarehouse,
  subscribeWorkspaceWarehouse,
  resolveWarehouseForBodega,
} from "./bodegaWarehouse";

export default function useMrpWorkspace() {
  const ctx = useContext(AuthCtx) || {};
  const tenantId = ctx.profile?.tenantId || MRP_TENANT_ID;
  const company = ctx.profile?.company || MRP_COMPANY;
  const bodegaId = ctx.profile?.bodegaId || null;
  const bodegaNombre = ctx.profile?.bodegaNombre || null;

  // Sincroniza el scope de los servicios con el perfil logeado.
  setMrpScope({ tenantId, company });
  // Sella la identidad del usuario para la bitácora de eventos.
  setMrpUser({
    userId: ctx.user?.uid || null,
    userEmail: ctx.profile?.email || ctx.user?.email || null,
  });

  const ws = useSyncExternalStore(
    subscribeWorkspaceWarehouse,
    getWorkspaceWarehouse,
    getWorkspaceWarehouse
  );

  // Dispara (una sola vez por bodega) la resolución del almacén ligado.
  useEffect(() => {
    resolveWarehouseForBodega(bodegaId);
  }, [bodegaId]);

  // Solo confiamos en el store si corresponde a la bodega activa.
  const matches = ws.bodegaId === (bodegaId ? String(bodegaId).trim() : null);
  const warehouse = matches ? ws.warehouse : null;
  const warehouseLoading = !matches || ws.loading;

  return {
    tenantId,
    company,
    bodegaId,
    bodegaNombre,
    warehouse,
    warehouseId: warehouse?.id || null,
    warehouseLoading,
    warehouseLinked: !!warehouse,
    warehouseError: matches ? ws.error : null,
  };
}
