// MRP Tarimas — contexto de trabajo del módulo.
//
// Expone el tenant/company del usuario logeado (desde profiles/{uid} vía AuthCtx)
// y el almacén de trabajo seleccionado. Fija el scope runtime de los servicios
// para que TODAS las consultas/mutaciones usen el tenant/company correctos.
import { useCallback, useContext, useSyncExternalStore } from "react";
import { AuthCtx } from "../../auth/AuthProvider";
import { MRP_TENANT_ID, MRP_COMPANY, setMrpScope } from "../../services/mrp";
import {
  getSelectedWarehouse,
  setSelectedWarehouse,
  subscribeWarehouse,
} from "./selectedWarehouse";

export default function useMrpWorkspace() {
  const ctx = useContext(AuthCtx) || {};
  const tenantId = ctx.profile?.tenantId || MRP_TENANT_ID;
  const company = ctx.profile?.company || MRP_COMPANY;

  // Sincroniza el scope de los servicios con el perfil logeado.
  setMrpScope({ tenantId, company });

  const warehouse = useSyncExternalStore(
    subscribeWarehouse,
    getSelectedWarehouse,
    getSelectedWarehouse
  );

  const selectWarehouse = useCallback((wh) => setSelectedWarehouse(wh), []);

  return {
    tenantId,
    company,
    warehouse,
    warehouseId: warehouse?.id || null,
    selectWarehouse,
  };
}
