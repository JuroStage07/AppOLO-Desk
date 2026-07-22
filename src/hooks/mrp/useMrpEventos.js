// MRP Tarimas — hook del registro de eventos (bitácora de catálogos).
import { listEventos } from "../../services/mrp";
import useAsyncData from "./useAsyncData";

export default function useMrpEventos(filters = {}) {
  const key = JSON.stringify(filters || {});
  const { data, loading, error, refetch } = useAsyncData(
    () => listEventos(filters),
    [key],
    { channels: ["eventos"] }
  );
  return { eventos: data || [], loading, error, refetch };
}
