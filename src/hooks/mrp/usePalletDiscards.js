// MRP Tarimas — hook de descartes (ajustes negativos).
//
// Filtros soportados (todos opcionales):
//   articuloId, warehouseId, userId, userEmail, reason, dateFrom, dateTo, limit.
import { listPalletDiscards } from "../../services/mrp";
import useAsyncData from "./useAsyncData";

export default function usePalletDiscards(filters = {}) {
  const key = JSON.stringify(filters || {});

  const { data, loading, error, refetch } = useAsyncData(
    () => listPalletDiscards(filters),
    [key],
    { channels: ["discards"] }
  );

  return { discards: data || [], loading, error, refetch };
}
