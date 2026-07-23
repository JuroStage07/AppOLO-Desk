// MRP Tarimas — modal con el detalle de cantidades por artículo en una ubicación.
import React, { useMemo } from "react";
import {
  Sheet,
  Spinner,
  ErrorState,
  EmptyState,
} from "../../../components/ui";
import { usePalletInventory, useMrpWorkspace } from "../../../hooks/mrp";
import { th, td } from "./mrpFormat";
import { CodeText } from "./mrpUi";
import MrpTable from "./MrpTable";
import { FW_EXTRABOLD } from "../../../styles/theme";

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
          <MrpTable minWidth={400}>
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
                    <td style={td}>
                      <CodeText>{r.codigo}</CodeText>
                    </td>
                    <td style={td}>{r.nombre}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: FW_EXTRABOLD }}>
                      {r.qty}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...td, fontWeight: FW_EXTRABOLD }} colSpan={2}>
                    Total
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: FW_EXTRABOLD }}>
                    {total}
                  </td>
                </tr>
              </tfoot>
          </MrpTable>
        )}
      </Sheet.Body>
    </Sheet>
  );
}
