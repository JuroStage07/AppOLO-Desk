// MRP Tarimas — modal con el historial de movimientos de un artículo + accesos
// rápidos a Traslado y Ajuste.
import React from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import {
  Sheet,
  PrimaryButton,
  SecondaryButton,
  TableScroll,
  Spinner,
  ErrorState,
  EmptyState,
} from "../../../components/ui";
import { usePalletMovements, useMrpWorkspace } from "../../../hooks/mrp";
import { th, td, fmtDate } from "./mrpFormat";
import { LocationBadge, MovementBadge } from "./mrpUi";

export default function ArticuloHistorialModal({
  open,
  onClose,
  articuloId,
  codigo,
  nombre,
  onTraslado,
  onAjuste,
}) {
  const { warehouseId } = useMrpWorkspace();
  const { movements, loading, error, refetch } = usePalletMovements({
    warehouseId,
    articuloId,
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Artículo ${codigo || ""}`}
      maxWidth={780}
    >
      <Sheet.Body>
        <Sheet.Hint>{nombre}</Sheet.Hint>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PrimaryButton icon={Plus} onClick={() => onAjuste?.(articuloId)}>
            Ajuste
          </PrimaryButton>
          <SecondaryButton
            icon={ArrowLeftRight}
            onClick={() => onTraslado?.(articuloId)}
          >
            Traslado
          </SecondaryButton>
        </div>

        {loading ? (
          <Spinner label="Cargando historial…" />
        ) : error ? (
          <ErrorState description={error.message} onRetry={refetch} />
        ) : movements.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="Este artículo aún no tiene movimientos registrados."
          />
        ) : (
          <TableScroll minWidth={620}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th>
                  <th style={th}>Movimiento</th>
                  <th style={{ ...th, textAlign: "right" }}>Cant.</th>
                  <th style={th}>Origen</th>
                  <th style={th}>Destino</th>
                  <th style={th}>Motivo</th>
                  <th style={th}>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td style={td}>{fmtDate(m.created_at)}</td>
                    <td style={td}>
                      <MovementBadge value={m.movement_type} metadata={m.metadata} />
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 950 }}>
                      {m.quantity}
                    </td>
                    <td style={td}>
                      <LocationBadge value={m.origin_location} />
                    </td>
                    <td style={td}>
                      <LocationBadge value={m.destination_location} />
                    </td>
                    <td style={td}>{m.reason || "—"}</td>
                    <td style={td}>{m.user_email || m.user_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Sheet.Body>

      <Sheet.Actions>
        <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}
