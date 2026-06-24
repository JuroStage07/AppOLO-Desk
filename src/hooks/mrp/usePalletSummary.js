// MRP Tarimas — hook de resúmenes/agregados de inventario.
//
// REGLA: `merma` es ubicación operativa y SÍ cuenta en el total global por marca.
//        `descartes` NO es ubicación operativa: se reporta aparte y nunca se
//        suma al inventario.
//
// Devuelve, todo derivado de una sola lectura de inventario + descartes:
//   - byBrand:    [{ brand_id, brand_name, total }]   (global por marca, todas las ubicaciones)
//   - byLocation: [{ location, total }]
//   - byType:     [{ pallet_type, total }]
//   - totalMerma, totalPend, totalGlobal  (números)
//   - totalDiscards  (número — registro administrativo, NO inventario)
import { useMemo } from "react";
import { listPalletInventory, listPalletDiscards } from "../../services/mrp";
import useAsyncData from "./useAsyncData";

export default function usePalletSummary(filters = {}) {
  const { warehouseId = null, brandId = null, palletType = null } = filters;

  const { data, loading, error, refetch } = useAsyncData(
    async () => {
      const [inventory, discards] = await Promise.all([
        listPalletInventory({
          warehouseId,
          brandId,
          palletType,
          onlyWithStock: true,
        }),
        listPalletDiscards({ warehouseId, brandId, palletType, limit: 10000 }),
      ]);
      return { inventory, discards };
    },
    [warehouseId, brandId, palletType],
    { channels: ["inventory", "discards"] }
  );

  const summary = useMemo(() => {
    const rows = data?.inventory || [];
    const discards = data?.discards || [];

    const brandMap = new Map();
    const locationMap = new Map();
    const typeMap = new Map();
    let totalMerma = 0;
    let totalPend = 0;
    let totalGlobal = 0;

    for (const r of rows) {
      const qty = Number(r.quantity) || 0;
      totalGlobal += qty; // incluye merma (operativa); descartes no está aquí

      const b = brandMap.get(r.brand_id) || {
        brand_id: r.brand_id,
        brand_name: r.brand?.name || "",
        total: 0,
      };
      b.total += qty;
      brandMap.set(r.brand_id, b);

      locationMap.set(r.location, (locationMap.get(r.location) || 0) + qty);
      typeMap.set(r.pallet_type, (typeMap.get(r.pallet_type) || 0) + qty);

      if (r.location === "merma") totalMerma += qty;
      if (r.location === "pend") totalPend += qty;
    }

    const totalDiscards = discards.reduce(
      (acc, d) => acc + (Number(d.quantity) || 0),
      0
    );

    return {
      byBrand: Array.from(brandMap.values()).sort((a, b) =>
        a.brand_name.localeCompare(b.brand_name)
      ),
      byLocation: Array.from(locationMap, ([location, total]) => ({
        location,
        total,
      })),
      byType: Array.from(typeMap, ([pallet_type, total]) => ({
        pallet_type,
        total,
      })),
      totalMerma,
      totalPend,
      totalGlobal,
      totalDiscards,
    };
  }, [data]);

  return { summary, loading, error, refetch };
}
