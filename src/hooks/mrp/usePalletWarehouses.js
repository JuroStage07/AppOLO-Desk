// MRP Tarimas — hook de almacenes: listar + crear.
// (No estaba en la lista de los 8, pero las pantallas de ajuste/traslado
//  necesitan el selector de almacén; se incluye por conveniencia.)
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletWarehouses,
  createPalletWarehouse,
  setPalletWarehouseActive,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function usePalletWarehouses({ includeInactive = false } = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listPalletWarehouses({ includeInactive }),
    [includeInactive],
    { channels: ["warehouses"] }
  );
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async ({ name, code }) => {
      setCreating(true);
      try {
        const wh = await createPalletWarehouse({ name, code });
        bumpRefresh("warehouses");
        toast.success("Almacén creado.");
        return wh;
      } catch (e) {
        toast.error(e.message || "No se pudo crear el almacén.");
        throw e;
      } finally {
        setCreating(false);
      }
    },
    [toast]
  );

  const setActive = useCallback(
    async (id, active) => {
      try {
        const wh = await setPalletWarehouseActive(id, active);
        bumpRefresh("warehouses");
        toast.success(active ? "Almacén activado." : "Almacén desactivado.");
        return wh;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el almacén.");
        throw e;
      }
    },
    [toast]
  );

  return { warehouses: data || [], loading, error, refetch, create, creating, setActive };
}
