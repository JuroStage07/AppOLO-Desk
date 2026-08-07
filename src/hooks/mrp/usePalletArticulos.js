// MRP Tarimas — hook de artículos: listar + crear (código autogenerado).
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletArticulos,
  createPalletArticulo,
  updatePalletArticulo,
  deletePalletArticulo,
  setPalletArticuloActive,
  setPalletArticuloCliente,
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
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);

  const create = useCallback(
    async ({ nombre, warehouseId: whId, clienteId = null, codigo = null }) => {
      setCreating(true);
      try {
        const articulo = await createPalletArticulo({
          nombre,
          warehouseId: whId,
          clienteId,
          codigo,
        });
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

  // Crea el mismo artículo (por nombre) para cada cliente indicado: una fila por
  // cliente con código correlativo distinto. Los códigos se asignan en secuencia
  // porque las llamadas a la RPC se serializan (await por cliente).
  //
  // `codigo` (opcional) fuerza el código en vez de autogenerarlo. Como el código
  // es único por tenant/company, solo tiene sentido con UN cliente: con varios
  // el segundo chocaría. Se valida aquí antes de tocar la RPC.
  const createForClientes = useCallback(
    async ({ nombre, warehouseId: whId, clienteIds, codigo = null }) => {
      const ids = Array.isArray(clienteIds) ? clienteIds : [];
      if (codigo && ids.length > 1) {
        const msg =
          "Con código manual solo se puede crear para una compañía a la vez.";
        toast.error(msg);
        throw new Error(msg);
      }
      setCreating(true);
      try {
        const created = [];
        for (const clienteId of ids) {
          created.push(
            await createPalletArticulo({
              nombre,
              warehouseId: whId,
              clienteId,
              codigo,
            })
          );
        }
        bumpRefresh("articulos");
        const codes = created.map((a) => a?.codigo).filter(Boolean).join(", ");
        toast.success(
          created.length === 1
            ? `Artículo ${codes} creado.`
            : `${created.length} artículos creados (${codes}).`
        );
        return created;
      } catch (e) {
        // Refresca igual: pudo haberse creado un subconjunto antes del fallo.
        bumpRefresh("articulos");
        toast.error(e.message || "No se pudieron crear los artículos.");
        throw e;
      } finally {
        setCreating(false);
      }
    },
    [toast]
  );

  const setCliente = useCallback(
    async (id, clienteId) => {
      try {
        const a = await setPalletArticuloCliente(id, clienteId);
        bumpRefresh("articulos");
        toast.success("Cliente asignado.");
        return a;
      } catch (e) {
        toast.error(e.message || "No se pudo asignar el cliente.");
        throw e;
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

  const update = useCallback(
    async (id, { nombre }) => {
      setUpdating(true);
      try {
        const a = await updatePalletArticulo(id, { nombre });
        bumpRefresh("articulos");
        toast.success(`Artículo ${a?.codigo || ""} actualizado.`);
        return a;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el artículo.");
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
        await deletePalletArticulo(id);
        bumpRefresh("articulos");
        toast.success("Artículo eliminado.");
      } catch (e) {
        toast.error(e.message || "No se pudo eliminar el artículo.");
        throw e;
      } finally {
        setRemoving(false);
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
    createForClientes,
    creating,
    update,
    updating,
    remove,
    removing,
    setActive,
    setCliente,
    peekNextCode,
  };
}
