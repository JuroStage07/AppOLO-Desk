// MRP Tarimas — hook de inventario por artículo con filtros.
//
// Filtros: warehouseId, location, articuloId, storeId, onlyWithStock.
import { listPalletInventory } from "../../services/mrp";
import useAsyncData from "./useAsyncData";

export default function usePalletInventory(filters = {}) {
  const {
    warehouseId = null,
    location = null,
    articuloId = null,
    onlyWithStock = true,
  } = filters;

  const { data, loading, error, refetch } = useAsyncData(
    () =>
      listPalletInventory({ warehouseId, location, articuloId, onlyWithStock }),
    [warehouseId, location, articuloId, onlyWithStock],
    { channels: ["inventory"] }
  );

  return { inventory: data || [], loading, error, refetch };
}
