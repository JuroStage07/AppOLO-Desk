// MRP Tarimas — hook de tiendas: listar + crear.
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletStores,
  createPalletStore,
  setPalletStoreActive,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function usePalletStores({
  includeInactive = false,
  warehouseId = null,
} = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listPalletStores({ includeInactive, warehouseId }),
    [includeInactive, warehouseId],
    { channels: ["stores"] }
  );
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async ({ storeNumber, name, warehouseId: whId }) => {
      setCreating(true);
      try {
        const store = await createPalletStore({
          storeNumber,
          name,
          warehouseId: whId,
        });
        bumpRefresh("stores");
        toast.success("Tienda creada.");
        return store;
      } catch (e) {
        toast.error(e.message || "No se pudo crear la tienda.");
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
        const s = await setPalletStoreActive(id, active);
        bumpRefresh("stores");
        toast.success(active ? "Tienda activada." : "Tienda desactivada.");
        return s;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar la tienda.");
        throw e;
      }
    },
    [toast]
  );

  return { stores: data || [], loading, error, refetch, create, creating, setActive };
}
