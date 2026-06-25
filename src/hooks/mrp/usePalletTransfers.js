// MRP Tarimas — hook de traslados entre ubicaciones.
//
// Validaciones (origen, destino, stock suficiente, tienda obligatoria cuando la
// ubicación es `tienda`) se aplican en el servicio y en la RPC transaccional.
// Aquí sellamos el usuario, mostramos feedback y refrescamos inventario/historial.
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import { transferPallets } from "../../services/mrp";
import { bumpRefresh } from "./refreshBus";
import useMrpUser from "./useMrpUser";

export default function usePalletTransfers() {
  const toast = useToast();
  const { userId, userEmail } = useMrpUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const transfer = useCallback(
    async ({
      warehouseId,
      originLocation,
      destinationLocation,
      originStoreId,
      destinationStoreId,
      articuloId,
      quantity,
      reason,
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await transferPallets({
          warehouseId,
          originLocation,
          destinationLocation,
          originStoreId,
          destinationStoreId,
          articuloId,
          quantity,
          reason,
          userId,
          userEmail,
        });
        bumpRefresh("inventory", "movements");
        toast.success(`Traslado registrado (${res.movement_code}).`);
        return res;
      } catch (e) {
        setError(e);
        toast.error(e.message || "No se pudo registrar el traslado.");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [userId, userEmail, toast]
  );

  return { transfer, loading, error };
}
