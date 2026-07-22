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
  setPalletTiendaCompania,
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
    async ({ nombre, companiaId = null }) => {
      setCreating(true);
      try {
        const tienda = await createPalletTienda({ nombre, companiaId });
        bumpRefresh("tiendas");
        toast.success(`Cliente ${tienda?.codigo || ""} creado.`);
        return tienda;
      } catch (e) {
        toast.error(e.message || "No se pudo crear el cliente.");
        throw e;
      } finally {
        setCreating(false);
      }
    },
    [toast]
  );

  // Crea el mismo cliente (por nombre) para cada compañía indicada: una fila por
  // compañía con código correlativo distinto (llamadas serializadas por await).
  const createForCompanias = useCallback(
    async ({ nombre, companiaIds }) => {
      const ids = Array.isArray(companiaIds) ? companiaIds : [];
      setCreating(true);
      try {
        const created = [];
        for (const companiaId of ids) {
          created.push(await createPalletTienda({ nombre, companiaId }));
        }
        bumpRefresh("tiendas");
        const codes = created.map((t) => t?.codigo).filter(Boolean).join(", ");
        toast.success(
          created.length === 1
            ? `Cliente ${codes} creado.`
            : `${created.length} clientes creados (${codes}).`
        );
        return created;
      } catch (e) {
        bumpRefresh("tiendas");
        toast.error(e.message || "No se pudieron crear los clientes.");
        throw e;
      } finally {
        setCreating(false);
      }
    },
    [toast]
  );

  const setCompania = useCallback(
    async (id, companiaId) => {
      try {
        const t = await setPalletTiendaCompania(id, companiaId);
        bumpRefresh("tiendas");
        toast.success("Compañía asignada.");
        return t;
      } catch (e) {
        toast.error(e.message || "No se pudo asignar la compañía.");
        throw e;
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
    createForCompanias,
    creating,
    update,
    updating,
    remove,
    removing,
    setActive,
    setCompania,
    peekNextCode,
  };
}
