// MRP Tarimas — hook de almacenes: listar + crear.
// (No estaba en la lista de los 8, pero las pantallas de ajuste/traslado
//  necesitan el selector de almacén; se incluye por conveniencia.)
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletWarehouses,
  createPalletWarehouse,
  updatePalletWarehouse,
  deletePalletWarehouse,
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
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);

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

  const update = useCallback(
    async (id, { name, code }) => {
      setUpdating(true);
      try {
        const wh = await updatePalletWarehouse(id, { name, code });
        bumpRefresh("warehouses");
        toast.success("Almacén actualizado.");
        return wh;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el almacén.");
        throw e;
      } finally {
        setUpdating(false);
      }
    },
    [toast]
  );

  const remove = useCallback(
    async (id) => {
      setRemoving(true);
      try {
        await deletePalletWarehouse(id);
        bumpRefresh("warehouses");
        toast.success("Almacén eliminado.");
      } catch (e) {
        toast.error(e.message || "No se pudo eliminar el almacén.");
        throw e;
      } finally {
        setRemoving(false);
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

  return {
    warehouses: data || [],
    loading,
    error,
    refetch,
    create,
    creating,
    update,
    updating,
    remove,
    removing,
    setActive,
  };
}
