// MRP Tarimas — Registro de insumos: bitácora de auditoría específica de los
// insumos (creación, edición, activación/desactivación, ajustes de stock,
// consumos y eliminación). Es la vista "espejo" del Registro de eventos, pero
// filtrada a entity_type = 'insumo' (que se excluyen del Registro de eventos).
import React from "react";
import { Boxes } from "lucide-react";
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

const ACTION_LABELS = {
  create: "Creación",
  update: "Edición",
  activate: "Activación",
  deactivate: "Desactivación",
  delete: "Eliminación",
  adjust: "Ajuste",
  consume: "Consumo",
};

function ActionBadge({ action }) {
  const tone =
    action === "delete"
      ? "dark"
      : action === "consume" || action === "adjust" || action === "create" || action === "activate"
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
    key: "insumo",
    title: "Insumo",
    get: (e) => ({ value: objetoText(e), label: objetoText(e) }),
    render: (e) => (
      <>
        {e.entity_codigo ? <CodeText>{e.entity_codigo}</CodeText> : null}
        {e.entity_codigo && e.entity_nombre ? " · " : ""}
        {e.entity_nombre || (!e.entity_codigo ? "—" : "")}
      </>
    ),
  },
  {
    key: "accion",
    title: "Acción",
    get: (e) => ({ value: e.action, label: ACTION_LABELS[e.action] || e.action }),
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

export default function MRPInsumosRegistroPage() {
  const { eventos, loading, error, refetch } = useMrpEventos({
    entityType: "insumo",
  });

  return (
    <>
      <SectionTitle
        title="Registro de insumos"
        action={<Badge tone="accent">Auditoría</Badge>}
      />

      <SectionTitle
        title="Movimientos de insumos"
        hint={!loading ? `${eventos.length} registro(s)` : undefined}
      />

      {loading ? (
        <Spinner label="Cargando registros…" />
      ) : error ? (
        <ErrorState description={error.message} onRetry={refetch} />
      ) : eventos.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Sin registros de insumos"
          description="Aún no se ha registrado actividad de insumos (creación, ajustes o consumos)."
        />
      ) : (
        <Card padding={0}>
          <MrpDataTable
            columns={COLS}
            rows={eventos}
            rowKey={(e) => e.id}
            storageKey="appolo_mrp_insumos_registro_cols"
            pageSize={5}
            minWidth={860}
          />
        </Card>
      )}
    </>
  );
}
