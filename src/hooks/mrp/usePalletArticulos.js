// MRP Tarimas — hook de artículos: listar + crear (código autogenerado).
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletArticulos,
  createPalletArticulo,
  setPalletArticuloActive,
  getNextArticuloCode,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function usePalletArticulos({
  includeInactive = false,
  warehouseId = null,
} = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listPalletArticulos({ includeInactive, warehouseId }),
    [includeInactive, warehouseId],
    { channels: ["articulos"] }
  );
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async ({ nombre, warehouseId: whId }) => {
      setCreating(true);
      try {
        const articulo = await createPalletArticulo({ nombre, warehouseId: whId });
        bumpRefresh("articulos");
        toast.success(`Artículo ${articulo?.codigo || ""} creado.`);
        return articulo;
      } catch (e) {
        toast.error(e.message || "No se pudo crear el artículo.");
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
        const a = await setPalletArticuloActive(id, active);
        bumpRefresh("articulos");
        toast.success(active ? "Artículo activado." : "Artículo desactivado.");
        return a;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el artículo.");
        throw e;
      }
    },
    [toast]
  );

  const peekNextCode = useCallback(() => getNextArticuloCode(), []);

  return {
    articulos: data || [],
    loading,
    error,
    refetch,
    create,
    creating,
    setActive,
    peekNextCode,
  };
}
