// MRP Tarimas — hook de tiendas destino: listar + crear (código autogenerado
// TD####) + activar/desactivar. Se fija solo por tenant/company (no usa almacén).
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletTiendas,
  createPalletTienda,
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
    setActive,
    peekNextCode,
  };
}
