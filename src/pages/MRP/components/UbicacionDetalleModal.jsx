// MRP Tarimas — modal con el detalle de cantidades por artículo en una ubicación.
import React, { useMemo } from "react";
import {
  Sheet,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
} from "../../../components/ui";
import { usePalletInventory, useMrpWorkspace } from "../../../hooks/mrp";
import { th, td } from "./mrpFormat";

export default function UbicacionDetalleModal({
  open,
  onClose,
  location,
  locationLabel,
  articuloId,
}) {
  const { warehouseId } = useMrpWorkspace();
  const { inventory, loading, error, refetch } = usePalletInventory({
    warehouseId,
    location,
    articuloId: articuloId || null,
    onlyWithStock: true,
  });

  const rows = useMemo(
    () =>
      inventory
        .map((r) => ({
          id: r.articulo_id,
          codigo: r.articulo?.codigo || "",
          nombre: r.articulo?.nombre || "",
          qty: Number(r.quantity) || 0,
        }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [inventory]
  );
  const total = rows.reduce((acc, r) => acc + r.qty, 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Ubicación: ${locationLabel || location}`}
      maxWidth={560}
    >
      <Sheet.Body>
        {loading ? (
          <Spinner label="Cargando…" />
        ) : error ? (
          <ErrorState description={error.message} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Sin existencias"
            description="No hay artículos con stock en esta ubicación."
          />
        ) : (
          <TableScroll minWidth={400}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Código</th>
                  <th style={th}>Artículo</th>
                  <th style={{ ...th, textAlign: "right" }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td
                      style={{ ...td, fontFamily: "monospace", fontWeight: 950 }}
                    >
                      {r.codigo}
                    </td>
                    <td style={td}>{r.nombre}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                      {r.qty}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 950 }} colSpan={2}>
                    Total
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                    {total}
                  </td>
                </tr>
              </tbody>
            </table>
          </TableScroll>
        )}
      </Sheet.Body>
    </Sheet>
  );
}
