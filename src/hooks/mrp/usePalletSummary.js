// MRP Tarimas — hook de resúmenes/agregados de inventario por artículo.
//
// REGLA: `merma` es ubicación operativa y SÍ cuenta en el total global.
//        `descartes` NO es ubicación: se reporta aparte y nunca se suma.
//
// Devuelve, derivado de una lectura de inventario + descartes:
//   - byArticulo: [{ articulo_id, codigo, nombre, total }]
//   - byLocation: [{ location, total }]
//   - totalMerma, totalPend, totalGlobal, totalDiscards (números)
import { useMemo } from "react";
import { listPalletInventory, listPalletDiscards } from "../../services/mrp";
import useAsyncData from "./useAsyncData";

export default function usePalletSummary(filters = {}) {
  const { warehouseId = null, articuloId = null } = filters;

  const { data, loading, error, refetch } = useAsyncData(
    async () => {
      const [inventory, discards] = await Promise.all([
        listPalletInventory({ warehouseId, articuloId, onlyWithStock: true }),
        listPalletDiscards({ warehouseId, articuloId, limit: 10000 }),
      ]);
      return { inventory, discards };
    },
    [warehouseId, articuloId],
    { channels: ["inventory", "discards"] }
  );

  const summary = useMemo(() => {
    const rows = data?.inventory || [];
    const discards = data?.discards || [];

    const articuloMap = new Map();
    const locationMap = new Map();
    let totalMerma = 0;
    let totalPend = 0;
    let totalGlobal = 0;

    for (const r of rows) {
      const qty = Number(r.quantity) || 0;
      totalGlobal += qty;

      const a = articuloMap.get(r.articulo_id) || {
        articulo_id: r.articulo_id,
        codigo: r.articulo?.codigo || "",
        nombre: r.articulo?.nombre || "",
        total: 0,
      };
      a.total += qty;
      articuloMap.set(r.articulo_id, a);

      locationMap.set(r.location, (locationMap.get(r.location) || 0) + qty);
      if (r.location === "merma") totalMerma += qty;
      if (r.location === "pend") totalPend += qty;
    }

    const totalDiscards = discards.reduce(
      (acc, d) => acc + (Number(d.quantity) || 0),
      0
    );

    return {
      byArticulo: Array.from(articuloMap.values()).sort((a, b) =>
        a.codigo.localeCompare(b.codigo)
      ),
      byLocation: Array.from(locationMap, ([location, total]) => ({
        location,
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
