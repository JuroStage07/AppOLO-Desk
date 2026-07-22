// MRP Tarimas — hook de clientes: listar + crear (código autogenerado CL####)
// + activar/desactivar. Se fija solo por tenant/company (no usa almacén).
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listPalletClientes,
  createPalletCliente,
  setPalletClienteActive,
  getNextClienteCode,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function usePalletClientes({ includeInactive = false } = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listPalletClientes({ includeInactive }),
    [includeInactive],
    { channels: ["clientes"] }
  );
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async ({ nombre }) => {
      setCreating(true);
      try {
        const cliente = await createPalletCliente({ nombre });
        bumpRefresh("clientes");
        toast.success(`Cliente ${cliente?.codigo || ""} creado.`);
        return cliente;
      } catch (e) {
        toast.error(e.message || "No se pudo crear el cliente.");
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
        const c = await setPalletClienteActive(id, active);
        bumpRefresh("clientes");
        toast.success(active ? "Cliente activado." : "Cliente desactivado.");
        return c;
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el cliente.");
        throw e;
      }
    },
    [toast]
  );

  const peekNextCode = useCallback(() => getNextClienteCode(), []);

  return {
    clientes: data || [],
    loading,
    error,
    refetch,
    create,
    creating,
    setActive,
    peekNextCode,
  };
}
