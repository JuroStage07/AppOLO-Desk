// MRP Tarimas — barra de contexto de trabajo (tenant/company + almacén) y
// estado vacío cuando no hay almacén seleccionado.
import React from "react";
import { useNavigate } from "react-router-dom";
import { Warehouse } from "lucide-react";
import {
  Card,
  Badge,
  GhostButton,
  PrimaryButton,
  EmptyState,
} from "../../../components/ui";
import { useMrpWorkspace } from "../../../hooks/mrp";

export default function WorkspaceBar() {
  const nav = useNavigate();
  const { tenantId, company, warehouse } = useMrpWorkspace();

  return (
    <Card>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge tone="neutral">Tenant: {tenantId}</Badge>
          <Badge tone="neutral">Compañía: {company}</Badge>
          <Badge tone="accent" icon={Warehouse}>
            Almacén: {warehouse?.name || "— sin seleccionar —"}
          </Badge>
        </div>
        <GhostButton onClick={() => nav("/mrp-tarimas")}>Cambiar almacén</GhostButton>
      </div>
    </Card>
  );
}

export function NoWarehouse() {
  const nav = useNavigate();
  return (
    <EmptyState
      icon={Warehouse}
      title="Selecciona un almacén de trabajo"
      description="Todo el módulo opera sobre un almacén. Elige uno en el inicio del módulo para continuar."
      action={
        <PrimaryButton onClick={() => nav("/mrp-tarimas")}>
          Ir a seleccionar almacén
        </PrimaryButton>
      }
    />
  );
}
