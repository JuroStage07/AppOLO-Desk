// MRP Tarimas — hook de ajustes positivos y negativos.
//
// REGLA CRÍTICA:
//   - ajuste positivo  -> ingresa a `pend`.
//   - ajuste negativo  -> se registra en `descartes` y descuenta de la ubicación
//     origen (default `pend`). NUNCA va a `merma` ni crea stock operativo.
//
// La validación de motivo obligatorio y cantidad > 0 vive en el servicio/RPC;
// aquí sellamos el usuario, mostramos feedback y refrescamos inventario/resumen.
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import {
  createPositivePalletAdjustment,
  createNegativePalletAdjustment,
} from "../../services/mrp";
import { bumpRefresh } from "./refreshBus";
import useMrpUser from "./useMrpUser";

export default function usePalletAdjustments() {
  const toast = useToast();
  const { userId, userEmail } = useMrpUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createPositive = useCallback(
    async ({ warehouseId, brandId, palletType, quantity, reason }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await createPositivePalletAdjustment({
          warehouseId,
          brandId,
          palletType,
          quantity,
          reason,
          userId,
          userEmail,
        });
        // refresca inventario + resumen + historial
        bumpRefresh("inventory", "movements");
        toast.success(`Ajuste positivo registrado (${res.movement_code}).`);
        return res;
      } catch (e) {
        setError(e);
        toast.error(e.message || "No se pudo registrar el ajuste positivo.");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [userId, userEmail, toast]
  );

  const createNegative = useCallback(
    async ({
      warehouseId,
      brandId,
      palletType,
      quantity,
      reason,
      originLocation, // opcional; default 'pend' en el servicio
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await createNegativePalletAdjustment({
          warehouseId,
          brandId,
          palletType,
          quantity,
          reason,
          originLocation,
          userId,
          userEmail,
        });
        // afecta inventario, historial y descartes
        bumpRefresh("inventory", "movements", "discards");
        toast.success(`Descarte registrado (${res.movement_code}).`);
        return res;
      } catch (e) {
        setError(e);
        toast.error(e.message || "No se pudo registrar el descarte.");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [userId, userEmail, toast]
  );

  return { createPositive, createNegative, loading, error };
}
