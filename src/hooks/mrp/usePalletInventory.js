// MRP Tarimas — hook de inventario con filtros.
//
// Filtros: warehouseId, location, brandId, palletType, storeId, onlyWithStock.
// Se refresca solo cuando una mutación emite en el canal "inventory".
import { listPalletInventory } from "../../services/mrp";
import useAsyncData from "./useAsyncData";

export default function usePalletInventory(filters = {}) {
  const {
    warehouseId = null,
    location = null,
    brandId = null,
    palletType = null,
    storeId = null,
    onlyWithStock = true,
  } = filters;

  const { data, loading, error, refetch } = useAsyncData(
    () =>
      listPalletInventory({
        warehouseId,
        location,
        brandId,
        palletType,
        storeId,
        onlyWithStock,
      }),
    [warehouseId, location, brandId, palletType, storeId, onlyWithStock],
    { channels: ["inventory"] }
  );

  return { inventory: data || [], loading, error, refetch };
}
