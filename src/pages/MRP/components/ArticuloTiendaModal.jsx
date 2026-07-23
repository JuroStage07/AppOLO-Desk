// MRP Tarimas — modal con la distribución por TIENDA del stock de un artículo
// que está en la ubicación `tienda`. Se abre desde la columna "Tienda" del
// Inventario de artículos.
import React, { useMemo } from "react";
import { Sheet, Spinner, ErrorState, EmptyState } from "../../../components/ui";
import { usePalletInventory, useMrpWorkspace } from "../../../hooks/mrp";
import { th, td } from "./mrpFormat";
import MrpTable from "./MrpTable";
import { SLATE, FS_XS, FW_SEMIBOLD, FW_EXTRABOLD } from "../../../styles/theme";

export default function ArticuloTiendaModal({
  open,
  onClose,
  articuloId,
  codigo,
  nombre,
}) {
  const { warehouseId } = useMrpWorkspace();
  const { inventory, loading, error, refetch } = usePalletInventory({
    warehouseId,
    location: "tienda",
    articuloId: articuloId || null,
    onlyWithStock: true,
  });

  const rows = useMemo(
    () =>
      inventory
        .map((r) => ({
          id: r.store_id || "—",
          codigo: r.tienda?.codigo || null,
          nombre: r.tienda?.nombre || "Sin asignar",
          qty: Number(r.quantity) || 0,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [inventory]
  );
  const total = rows.reduce((acc, r) => acc + r.qty, 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Distribución por tienda · ${codigo || ""}`}
      maxWidth={520}
    >
      <Sheet.Body>
        <Sheet.Hint>{nombre}</Sheet.Hint>

        {loading ? (
          <Spinner label="Cargando…" />
        ) : error ? (
          <ErrorState description={error.message} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Sin stock en tienda"
            description="Este artículo no tiene existencias en la ubicación tienda."
          />
        ) : (
          <MrpTable minWidth={360}>
            <thead>
              <tr>
                <th style={th}>Tienda</th>
                <th style={{ ...th, textAlign: "right" }}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>
                    {r.codigo ? (
                      <span style={{ display: "grid", gap: 1, lineHeight: 1.2 }}>
                        <span>{r.nombre}</span>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: FS_XS,
                            fontWeight: FW_SEMIBOLD,
                            color: SLATE,
                          }}
                        >
                          {r.codigo}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: SLATE }}>{r.nombre}</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: FW_EXTRABOLD }}>
                    {r.qty}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: FW_EXTRABOLD }}>Total</td>
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
