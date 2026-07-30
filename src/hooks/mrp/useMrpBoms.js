// MRP Tarimas — hook de BOM (Bill of Materials): listar (con insumos) + crear
// (código autogenerado) + editar + activar/desactivar + eliminar. Se fija solo
// por tenant/company.
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listMrpBoms,
  createMrpBom,
  updateMrpBom,
  deleteMrpBom,
  setMrpBomActive,
  consumeBom,
  getNextBomCode,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function useMrpBoms({ includeInactive = false } = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listMrpBoms({ includeInactive }),
    [includeInactive],
    { channels: ["boms", "insumos"] }
  );
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);

  const create = useCallback(
    async ({ nombre, items }) => {
      setCreating(true);
      try {
        const bom = await createMrpBom({ nombre, items });
        bumpRefresh("boms");
        toast.success(`BOM ${bom?.codigo || ""} creado.`);
        return bom;
      } catch (e) {
        toast.error(e.message || "No se pudo crear el BOM.");
        throw e;
      } finally {
        setCreating(false);
      }
    },
    [toast]
  );

  const update = useCallback(
    async (id, { nombre, items }) => {
      setUpdating(true);
      try {
        const bom = await updateMrpBom(id, { nombre, items });
        bumpRefresh("boms");
        toast.success(`BOM ${bom?.codigo || ""} actualizado.`);
        return bom;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el BOM.");
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
        await deleteMrpBom(id);
        bumpRefresh("boms");
        toast.success("BOM eliminado.");
      } catch (e) {
        toast.error(e.message || "No se pudo eliminar el BOM.");
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
        const bom = await setMrpBomActive(id, active);
        bumpRefresh("boms");
        toast.success(active ? "BOM activado." : "BOM desactivado.");
        return bom;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el BOM.");
        throw e;
      }
    },
    [toast]
  );

  // Consumir una receta BOM (por bodega). Descuenta insumos atómicamente y
  // registra un evento por insumo (entity_type='insumo', action='consume').
  const [consuming, setConsuming] = useState(false);
  const consume = useCallback(
    async ({ bomId, multiplier = 1, reason, fecha } = {}) => {
      setConsuming(true);
      try {
        const res = await consumeBom({ bomId, multiplier, reason, fecha });
        bumpRefresh("insumos", "eventos", "boms");
        toast.success("Consumo de receta registrado.");
        return res;
      } catch (e) {
        toast.error(e.message || "No se pudo consumir la receta.");
        throw e;
      } finally {
        setConsuming(false);
      }
    },
    [toast]
  );

  const peekNextCode = useCallback(() => getNextBomCode(), []);

  return {
    boms: data || [],
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
    consume,
    consuming,
    peekNextCode,
  };
}
