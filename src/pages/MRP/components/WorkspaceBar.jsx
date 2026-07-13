// MRP Tarimas — barra de contexto de trabajo (tenant/company + almacén) y
// estado vacío cuando la bodega activa no tiene un almacén del MRP ligado.
//
// El almacén se resuelve de la bodega activa (no se selecciona a mano). El
// vínculo bodega→almacén se configura en /dev/config-modulos/mrp-tarimas.
import React from "react";
import { Warehouse } from "lucide-react";
import { Card, Badge, EmptyState } from "../../../components/ui";
import { useMrpWorkspace } from "../../../hooks/mrp";

export default function WorkspaceBar() {
  const { tenantId, company, warehouse } = useMrpWorkspace();

  return (
    <Card>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Badge tone="neutral">Tenant: {tenantId}</Badge>
        <Badge tone="neutral">Compañía: {company}</Badge>
        <Badge tone="accent" icon={Warehouse}>
          Almacén: {warehouse?.name || "— sin ligar —"}
        </Badge>
      </div>
    </Card>
  );
}

export function NoWarehouse() {
  return (
    <EmptyState
      icon={Warehouse}
      title="La bodega activa no tiene un almacén ligado"
      description="El módulo opera sobre el almacén ligado a la bodega seleccionada. Cambiá de bodega en el encabezado, o pedí a un administrador que configure el vínculo en Configuración de módulos › MRP Tarimas."
    />
  );
}
