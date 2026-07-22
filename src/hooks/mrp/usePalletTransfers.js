// MRP Tarimas — hook de traslados entre ubicaciones.
//
// Validaciones (origen, destino, stock suficiente, tienda obligatoria cuando la
// ubicación es `tienda`) se aplican en el servicio y en la RPC transaccional.
// Aquí sellamos el usuario, mostramos feedback y refrescamos inventario/historial.
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import { transferPallets, transferPalletsBetweenWarehouses } from "../../services/mrp";
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
      articuloId,
      quantity,
      reason,
      tiendaId,
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await transferPallets({
          warehouseId,
          originLocation,
          destinationLocation,
          articuloId,
          quantity,
          reason,
          tiendaId,
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

  const transferBetweenWarehouses = useCallback(
    async ({
      originWarehouseId,
      destWarehouseId,
      articuloId,
      originLocation,
      destinationLocation,
      quantity,
      reason,
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await transferPalletsBetweenWarehouses({
          originWarehouseId,
          destWarehouseId,
          articuloId,
          originLocation,
          destinationLocation,
          quantity,
          reason,
          userId,
          userEmail,
        });
        bumpRefresh("inventory", "movements");
        const extra = res?.dest_created ? " · artículo creado en destino" : "";
        toast.success(
          `Traslado entre almacenes registrado (${res.out_movement_code})${extra}.`
        );
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

  return { transfer, transferBetweenWarehouses, loading, error };
}
