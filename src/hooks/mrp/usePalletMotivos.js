// MRP Tarimas — hook de motivos por tipo de movimiento: listar + CRUD.
//
// Lo consumen los modales de Ajuste/Traslado (solo activos) y la pantalla de
// administración de motivos (con inactivos + edición).
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  listMotivos,
  createMotivo,
  setMotivoActive,
  deleteMotivo,
} from "../../services/mrp";
import useAsyncData from "./useAsyncData";
import { bumpRefresh } from "./refreshBus";

export default function usePalletMotivos({ tipo, includeInactive = false } = {}) {
  const toast = useToast();
  const { data, loading, error, refetch } = useAsyncData(
    () => listMotivos({ tipo, includeInactive }),
    [tipo, includeInactive],
    { channels: ["motivos"] }
  );
  const [busy, setBusy] = useState(false);

  const create = useCallback(
    async (label) => {
      setBusy(true);
      try {
        const m = await createMotivo({ tipo, label });
        bumpRefresh("motivos");
        toast.success("Motivo agregado.");
        return m;
      } catch (e) {
        toast.error(e.message || "No se pudo agregar el motivo.");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [tipo, toast]
  );

  const setActive = useCallback(
    async (id, active) => {
      try {
        await setMotivoActive(id, active);
        bumpRefresh("motivos");
      } catch (e) {
        toast.error(e.message || "No se pudo actualizar el motivo.");
        throw e;
      }
    },
    [toast]
  );

  const remove = useCallback(
    async (id) => {
      try {
        await deleteMotivo(id);
        bumpRefresh("motivos");
        toast.success("Motivo eliminado.");
      } catch (e) {
        toast.error(e.message || "No se pudo eliminar el motivo.");
        throw e;
      }
    },
    [toast]
  );

  return { motivos: data || [], loading, error, refetch, create, setActive, remove, busy };
}
