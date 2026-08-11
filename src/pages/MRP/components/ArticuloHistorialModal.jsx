// MRP Tarimas — modal con el historial de movimientos de un artículo + accesos
// rápidos a Traslado y Ajuste.
import React from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import {
  Sheet,
  PrimaryButton,
  SecondaryButton,
  Spinner,
  ErrorState,
  EmptyState,
} from "../../../components/ui";
import { usePalletMovements, useMrpWorkspace } from "../../../hooks/mrp";
import { th, td, fmtDate } from "./mrpFormat";
import { LocationBadge, MovementBadge } from "./mrpUi";
import MrpTable from "./MrpTable";
import { FW_EXTRABOLD } from "../../../styles/theme";

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

        {/* Accesos rápidos: solo si quien abre el modal los habilita (permisos
            `mrpAjustes` / `mrpTraslados`). */}
        {onAjuste || onTraslado ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onAjuste ? (
              <PrimaryButton icon={Plus} onClick={() => onAjuste(articuloId)}>
                Ajuste
              </PrimaryButton>
            ) : null}
            {onTraslado ? (
              <SecondaryButton
                icon={ArrowLeftRight}
                onClick={() => onTraslado(articuloId)}
              >
                Traslado
              </SecondaryButton>
            ) : null}
          </div>
        ) : null}

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
          <MrpTable minWidth={620}>
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
                    <td style={{ ...td, textAlign: "right", fontWeight: FW_EXTRABOLD }}>
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
          </MrpTable>
        )}
      </Sheet.Body>

      <Sheet.Actions>
        <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
      </Sheet.Actions>
    </Sheet>
  );
}
