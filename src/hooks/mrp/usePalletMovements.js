// MRP Tarimas — hook de historial de movimientos con filtros.
//
// Filtros soportados (todos opcionales):
//   movementCode, taskId, userId, brandId, palletType, movementType,
//   originLocation, destinationLocation, warehouseId, reason, dateFrom, dateTo, limit.
// Para ver solo descartes: movementType = 'ajuste_negativo'.
import { listPalletMovements } from "../../services/mrp";
import useAsyncData from "./useAsyncData";

export default function usePalletMovements(filters = {}) {
  const key = JSON.stringify(filters || {});

  const { data, loading, error, refetch } = useAsyncData(
    () => listPalletMovements(filters),
    [key],
    { channels: ["movements"] }
  );

  return { movements: data || [], loading, error, refetch };
}
