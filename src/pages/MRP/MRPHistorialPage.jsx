// MRP Tarimas — Historial de movimientos de artículos.
// Tabla con filtros por columna estilo Excel, columnas reordenables por arrastre,
// paginación y primera columna fija (ver components/MrpDataTable).
import React, { useMemo } from "react";
import { History } from "lucide-react";
import {
  Badge,
  Card,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import { usePalletMovements, useMrpWorkspace } from "../../hooks/mrp";
import {
  PALLET_LOCATION_LABELS,
  PALLET_MOVEMENT_TYPE_LABELS,
} from "../../services/mrp";
import { fmtDate } from "./components/mrpFormat";
import { LocationBadge, MovementBadge, CodeText } from "./components/mrpUi";
import MrpDataTable from "./components/MrpDataTable";

// Etiqueta del movimiento (coherente con MovementBadge, incl. traslado de almacén).
const movementLabel = (m) => {
  if (m.movement_type === "traslado" && m.metadata?.cross_warehouse) {
    const dir =
      m.metadata.direction === "out"
        ? " · salida"
        : m.metadata.direction === "in"
        ? " · entrada"
        : "";
    return `Traslado de almacén${dir}`;
  }
  return PALLET_MOVEMENT_TYPE_LABELS[m.movement_type] || m.movement_type || "—";
};
const locLabel = (l) => (l ? PALLET_LOCATION_LABELS[l] || l : "—");

// Definición de columnas: value (clave del filtro) + label (texto visible) + render.
const COLS = [
  {
    key: "fecha",
    title: "Fecha",
    get: (m) => ({ value: fmtDate(m.created_at), label: fmtDate(m.created_at) }),
    render: (m) => fmtDate(m.created_at),
  },
  {
    key: "movimiento",
    title: "Movimiento",
    get: (m) => {
      const l = movementLabel(m);
      return { value: l, label: l };
    },
    render: (m) => <MovementBadge value={m.movement_type} metadata={m.metadata} />,
  },
  {
    key: "movcode",
    title: "ID movimiento",
    get: (m) => ({ value: m.movement_code || "—", label: m.movement_code || "—" }),
    render: (m) => (
      <span style={{ fontFamily: "monospace" }}>{m.movement_code}</span>
    ),
  },
  {
    key: "task",
    title: "ID tarea",
    get: (m) => ({
      value: m.task_id || "—",
      label: m.task_id ? m.task_id.slice(0, 8) : "—",
    }),
    render: (m) => (
      <span style={{ fontFamily: "monospace" }}>
        {m.task_id ? m.task_id.slice(0, 8) : "—"}
      </span>
    ),
  },
  {
    key: "articulo",
    title: "Artículo",
    get: (m) => {
      const v = `${m.articulo?.codigo || ""} · ${m.articulo?.nombre || ""}`;
      return { value: v, label: v };
    },
    render: (m) => (
      <>
        <CodeText>{m.articulo?.codigo}</CodeText>{" "}
        · {m.articulo?.nombre}
      </>
    ),
  },
  {
    key: "cantidad",
    title: "Cantidad",
    align: "right",
    get: (m) => ({ value: String(m.quantity), label: String(m.quantity) }),
    render: (m) => m.quantity,
  },
  {
    key: "origen",
    title: "Origen",
    get: (m) => ({
      value: m.origin_location || "∅",
      label: locLabel(m.origin_location),
    }),
    render: (m) => <LocationBadge value={m.origin_location} />,
  },
  {
    key: "destino",
    title: "Destino",
    get: (m) => ({
      value: m.destination_location || "∅",
      label: locLabel(m.destination_location),
    }),
    render: (m) => <LocationBadge value={m.destination_location} />,
  },
  {
    key: "motivo",
    title: "Motivo",
    get: (m) => ({ value: m.reason || "—", label: m.reason || "—" }),
    render: (m) => m.reason || "—",
  },
  {
    key: "usuario",
    title: "Usuario",
    get: (m) => {
      const v = m.user_email || m.user_id || "—";
      return { value: v, label: v };
    },
    render: (m) => m.user_email || m.user_id || "—",
  },
];

export default function MRPHistorialPage() {
  const { warehouseId } = useMrpWorkspace();

  const filters = useMemo(
    () => (warehouseId ? { warehouseId } : {}),
    [warehouseId]
  );

  const { movements, loading, error, refetch } = usePalletMovements(filters);

  return (
    <>
      <SectionTitle
        title="Historial de movimientos"
        action={<Badge tone="accent">Movimientos</Badge>}
      />

      <SectionTitle
        title="Movimientos"
        hint={!loading ? `${movements.length} movimiento(s)` : undefined}
      />

      {loading ? (
        <Spinner label="Cargando historial…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : movements.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sin movimientos"
          description="No hay movimientos con los filtros seleccionados."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={COLS}
            rows={movements}
            rowKey={(m) => m.id}
            storageKey="appolo_mrp_hist_cols"
            pageSize={5}
            minWidth={1120}
          />
        </Card>
      )}
    </>
  );
}
