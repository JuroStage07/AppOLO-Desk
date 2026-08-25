// Feature: despachos-dev — modal de "Cargas en tiempo real".
//
// Envuelve el `Sheet` del UI kit y muestra una tarjeta (`CargaCard`) por cada
// despacho activo con acomodo de contenedor, actualizándose en vivo. Estados
// propios de carga / vacío / error, sin bloquear el resto de la página.

import React from "react";
import { PackageOpen } from "lucide-react";
import { Sheet, EmptyState, ErrorState, Skeleton, theme } from "../../../../components/ui";
import { useCargasRealtime } from "../hooks/useCargasRealtime";
import CargaCard from "./CargaCard.jsx";
import RealtimeIndicator from "./RealtimeIndicator.jsx";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string|null} [props.tenantId]
 * @param {string|null} [props.company]
 * @param {string|null} [props.bodegaId]
 * @param {Array<{codigo:string,nombre?:string}>} [props.catalogo]
 * @param {{label:Function}} [props.mapaEstados]
 */
export default function CargasRealtimeModal({
  open,
  onClose,
  tenantId,
  company,
  bodegaId,
  catalogo,
  mapaEstados,
}) {
  const { cargas, loading, error, realtimeStatus, reload } = useCargasRealtime({
    tenantId,
    company,
    bodegaId,
    enabled: open,
  });

  let body;
  if (loading && cargas.length === 0) {
    body = (
      <div style={styles.grid}>
        <Skeleton height={360} radius={theme.RADIUS_XL} />
        <Skeleton height={360} radius={theme.RADIUS_XL} />
      </div>
    );
  } else if (error) {
    body = (
      <ErrorState
        title="No se pudieron cargar las cargas"
        description="No se pudo completar la consulta. Revisá tu conexión e intentá nuevamente."
        onRetry={reload}
      />
    );
  } else if (cargas.length === 0) {
    body = (
      <EmptyState
        center
        icon={PackageOpen}
        title="No hay cargas en curso"
        description="No hay despachos con acomodo de contenedor activo en tu bodega en este momento."
      />
    );
  } else {
    body = (
      <div style={styles.grid}>
        {cargas.map(({ despacho, slots }) => (
          <CargaCard
            key={despacho.id}
            despacho={despacho}
            slots={slots}
            catalogo={catalogo}
            mapaEstados={mapaEstados}
          />
        ))}
      </div>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} placement="center" title="Cargas en tiempo real" maxWidth={1040}>
      <Sheet.Body>
        <div style={styles.toolbar}>
          <span style={styles.count}>
            {cargas.length} carga{cargas.length === 1 ? "" : "s"} en curso
          </span>
          <RealtimeIndicator status={realtimeStatus} />
        </div>
        {body}
      </Sheet.Body>
    </Sheet>
  );
}

const styles = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACE_3,
    flexWrap: "wrap",
    marginBottom: theme.SPACE_2,
  },
  count: {
    color: theme.TEXT,
    fontWeight: theme.FW_EXTRABOLD,
    fontSize: theme.FS_SM,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: theme.SPACE_3,
    alignItems: "start",
  },
};
