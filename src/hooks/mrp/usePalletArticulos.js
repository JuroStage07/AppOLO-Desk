// MRP Tarimas — hook de artículos: listar + crear (código autogenerado).
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletArticulos,
  createPalletArticulo,
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

  const create = useCallback(
    async ({ nombre, warehouseId: whId, clienteId = null }) => {
      setCreating(true);
      try {
        const articulo = await createPalletArticulo({
          nombre,
          warehouseId: whId,
          clienteId,
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
  const createForClientes = useCallback(
    async ({ nombre, warehouseId: whId, clienteIds }) => {
      const ids = Array.isArray(clienteIds) ? clienteIds : [];
      setCreating(true);
      try {
        const created = [];
        for (const clienteId of ids) {
          created.push(
            await createPalletArticulo({ nombre, warehouseId: whId, clienteId })
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

  const peekNextCode = useCallback(() => getNextArticuloCode(), []);

  return {
    articulos: data || [],
    loading,
    error,
    refetch,
    create,
    createForClientes,
    creating,
    setActive,
    setCliente,
    peekNextCode,
  };
}
