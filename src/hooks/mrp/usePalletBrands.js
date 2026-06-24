// MRP Tarimas — hook de marcas: listar + crear.
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletBrands,
  createPalletBrand,
  setPalletBrandActive,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function usePalletBrands({
  includeInactive = false,
  warehouseId = null,
} = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listPalletBrands({ includeInactive, warehouseId }),
    [includeInactive, warehouseId],
    { channels: ["brands"] }
  );
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async ({ name, warehouseId: whId }) => {
      setCreating(true);
      try {
        const brand = await createPalletBrand({ name, warehouseId: whId });
        bumpRefresh("brands");
        toast.success("Marca creada.");
        return brand;
      } catch (e) {
        toast.error(e.message || "No se pudo crear la marca.");
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
        const b = await setPalletBrandActive(id, active);
        bumpRefresh("brands");
        toast.success(active ? "Marca activada." : "Marca desactivada.");
        return b;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar la marca.");
        throw e;
      }
    },
    [toast]
  );

  return { brands: data || [], loading, error, refetch, create, creating, setActive };
}
