// MRP Tarimas — hook de tiendas destino: listar + crear (código autogenerado
// TD####) + activar/desactivar. Se fija solo por tenant/company (no usa almacén).
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletTiendas,
  createPalletTienda,
  updatePalletTienda,
  deletePalletTienda,
  setPalletTiendaActive,
  getNextTiendaCode,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function usePalletTiendas({ includeInactive = false } = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listPalletTiendas({ includeInactive }),
    [includeInactive],
    { channels: ["tiendas"] }
  );
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);

  const create = useCallback(
    async ({ nombre }) => {
      setCreating(true);
      try {
        const tienda = await createPalletTienda({ nombre });
        bumpRefresh("tiendas");
        toast.success(`Tienda ${tienda?.codigo || ""} creada.`);
        return tienda;
      } catch (e) {
        toast.error(e.message || "No se pudo crear la tienda.");
        throw e;
      } finally {
        setCreating(false);
      }
    },
    [toast]
  );

  const update = useCallback(
    async (id, { nombre }) => {
      setUpdating(true);
      try {
        const t = await updatePalletTienda(id, { nombre });
        bumpRefresh("tiendas");
        toast.success(`Tienda ${t?.codigo || ""} actualizada.`);
        return t;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar la tienda.");
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
        await deletePalletTienda(id);
        bumpRefresh("tiendas");
        toast.success("Tienda eliminada.");
      } catch (e) {
        toast.error(e.message || "No se pudo eliminar la tienda.");
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
        const t = await setPalletTiendaActive(id, active);
        bumpRefresh("tiendas");
        toast.success(active ? "Tienda activada." : "Tienda desactivada.");
        return t;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar la tienda.");
        throw e;
      }
    },
    [toast]
  );

  const peekNextCode = useCallback(() => getNextTiendaCode(), []);

  return {
    tiendas: data || [],
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
    peekNextCode,
  };
}
