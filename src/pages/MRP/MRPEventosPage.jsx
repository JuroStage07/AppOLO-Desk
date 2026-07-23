// MRP Tarimas — Registro de eventos: bitácora de auditoría de los catálogos
// (edición, activación, desactivación, eliminación) y ajustes de stock de
// insumos. Es independiente del Historial de movimientos (stock por tarima).
import React from "react";
import { ClipboardList } from "lucide-react";
import {
  Badge,
  Card,
  Spinner,
  ErrorState,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import { useMrpEventos } from "../../hooks/mrp";
import { fmtDate } from "./components/mrpFormat";
import { CodeText } from "./components/mrpUi";
import MrpDataTable from "./components/MrpDataTable";

const ENTITY_LABELS = {
  articulo: "Artículo",
  compania: "Compañía",
  cliente: "Cliente",
  insumo: "Insumo",
  bom: "BOM",
  almacen: "Almacén",
};

const ACTION_LABELS = {
  create: "Creación",
  update: "Edición",
  activate: "Activación",
  deactivate: "Desactivación",
  delete: "Eliminación",
  adjust: "Ajuste",
};

function ActionBadge({ action }) {
  const tone =
    action === "delete"
      ? "dark"
      : action === "adjust" || action === "create" || action === "activate"
      ? "accent"
      : "neutral";
  return <Badge tone={tone}>{ACTION_LABELS[action] || action}</Badge>;
}

const objetoText = (e) =>
  `${e.entity_codigo || ""}${e.entity_codigo && e.entity_nombre ? " · " : ""}${
    e.entity_nombre || (e.entity_codigo ? "" : "—")
  }`;

const COLS = [
  {
    key: "fecha",
    title: "Fecha",
    get: (e) => ({ value: fmtDate(e.created_at), label: fmtDate(e.created_at) }),
    render: (e) => fmtDate(e.created_at),
  },
  {
    key: "tipo",
    title: "Tipo",
    get: (e) => ({
      value: e.entity_type,
      label: ENTITY_LABELS[e.entity_type] || e.entity_type,
    }),
    render: (e) => ENTITY_LABELS[e.entity_type] || e.entity_type,
  },
  {
    key: "objeto",
    title: "Objeto",
    get: (e) => ({ value: objetoText(e), label: objetoText(e) }),
    render: (e) => (
      <>
        {e.entity_codigo ? (
          <CodeText>{e.entity_codigo}</CodeText>
        ) : null}
        {e.entity_codigo && e.entity_nombre ? " · " : ""}
        {e.entity_nombre || (!e.entity_codigo ? "—" : "")}
      </>
    ),
  },
  {
    key: "accion",
    title: "Acción",
    get: (e) => ({
      value: e.action,
      label: ACTION_LABELS[e.action] || e.action,
    }),
    render: (e) => <ActionBadge action={e.action} />,
  },
  {
    key: "detalle",
    title: "Detalle",
    get: (e) => ({ value: e.detail || "—", label: e.detail || "—" }),
    render: (e) => e.detail || "—",
  },
  {
    key: "usuario",
    title: "Usuario",
    get: (e) => {
      const v = e.user_email || e.user_id || "—";
      return { value: v, label: v };
    },
    render: (e) => e.user_email || e.user_id || "—",
  },
];

export default function MRPEventosPage() {
  const { eventos, loading, error, refetch } = useMrpEventos();

  return (
    <>
      <SectionTitle
        title="Registro de eventos"
        action={<Badge tone="accent">Auditoría</Badge>}
      />

      <SectionTitle
        title="Eventos"
        hint={!loading ? `${eventos.length} evento(s)` : undefined}
      />

      {loading ? (
        <Spinner label="Cargando eventos…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : eventos.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin eventos"
          description="Aún no se ha registrado actividad en los catálogos."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={COLS}
            rows={eventos}
            rowKey={(e) => e.id}
            storageKey="appolo_mrp_eventos_cols"
            pageSize={5}
            minWidth={860}
          />
        </Card>
      )}
    </>
  );
}
