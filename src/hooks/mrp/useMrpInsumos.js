// MRP Tarimas — hook de artículos insumo: listar + crear (código autogenerado)
// + activar/desactivar. Se fija solo por tenant/company (no usa almacén).
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listInsumos,
  createInsumo,
  updateInsumo,
  deleteInsumo,
  setInsumoActive,
  getNextInsumoCode,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function useMrpInsumos({ includeInactive = false } = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listInsumos({ includeInactive }),
    [includeInactive],
    { channels: ["insumos"] }
  );
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);

  const create = useCallback(
    async ({ nombre, detalle, price, priceMode }) => {
      setCreating(true);
      try {
        const insumo = await createInsumo({ nombre, detalle, price, priceMode });
        bumpRefresh("insumos");
        toast.success(`Insumo ${insumo?.codigo || ""} creado.`);
        return insumo;
      } catch (e) {
        toast.error(e.message || "No se pudo crear el insumo.");
        throw e;
      } finally {
        setCreating(false);
      }
    },
    [toast]
  );

  const update = useCallback(
    async (id, fields) => {
      setUpdating(true);
      try {
        const i = await updateInsumo(id, fields);
        bumpRefresh("insumos", "boms");
        toast.success(`Insumo ${i?.codigo || ""} actualizado.`);
        return i;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el insumo.");
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
        await deleteInsumo(id);
        bumpRefresh("insumos", "boms");
        toast.success("Insumo eliminado.");
      } catch (e) {
        toast.error(e.message || "No se pudo eliminar el insumo.");
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
        const i = await setInsumoActive(id, active);
        bumpRefresh("insumos", "boms");
        toast.success(active ? "Insumo activado." : "Insumo desactivado.");
        return i;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el insumo.");
        throw e;
      }
    },
    [toast]
  );

  const peekNextCode = useCallback(() => getNextInsumoCode(), []);

  return {
    insumos: data || [],
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
