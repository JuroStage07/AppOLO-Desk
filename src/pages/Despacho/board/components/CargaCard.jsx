// Feature: despachos-dev — tarjeta de una carga en tiempo real.
//
// Reproduce el estilo de "Despachos en progreso": encabezado con referencia y
// badge "En tiempo real", subdatos (tienda · placa, estado, UID), KPIs S/D/T y
// Ocupado X/24, barra de progreso y el grid 12×2 del contenedor.
//
// Solo lectura. Colores/espaciados desde tokens del tema.

import React from "react";
import { Card, theme } from "../../../../components/ui";
import { gridStats } from "../lib/cargaLayout.js";
import { labelFor } from "../lib/mapaEstados.js";
import { orNoValue } from "../lib/despachoFormat.js";
import CargaSlotGrid from "./CargaSlotGrid.jsx";

function Kpi({ label, value }) {
  return (
    <div style={styles.kpi}>
      <span style={styles.kpiLabel}>{label}</span>
      <span style={styles.kpiValue}>{value}</span>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.despacho - Registro del despacho (referencia, tienda, placa, estado, id).
 * @param {Array<object>} props.slots - Array de 24 posiciones del layout.
 * @param {Array<{codigo:string,nombre?:string}>} [props.catalogo]
 * @param {{label:Function}} [props.mapaEstados]
 */
export default function CargaCard({ despacho, slots, catalogo, mapaEstados }) {
  const d = despacho || {};
  const { cells, counts, ocupado, capacity, progress } = gridStats(slots);
  const estadoLabel = mapaEstados
    ? mapaEstados.label(d.estado)
    : labelFor(d.estado, catalogo);

  return (
    <Card padding={theme.SPACE_4} style={styles.card}>
      <div style={styles.header}>
        <span style={styles.title}>{orNoValue(d.referencia)}</span>
        <span style={styles.liveBadge}>
          <span style={styles.liveDot} />
          En tiempo real
        </span>
      </div>

      <div style={styles.meta}>
        <span>
          Tienda: <strong>{orNoValue(d.tienda)}</strong> · Placa:{" "}
          <strong>{orNoValue(d.placa)}</strong>
        </span>
        <span>
          Estado: <strong>{orNoValue(estadoLabel)}</strong>
        </span>
        <span style={styles.uid}>UID: {orNoValue(d.id)}</span>
      </div>

      <div style={styles.kpis}>
        <Kpi label="S" value={counts.S} />
        <Kpi label="D" value={counts.D} />
        <Kpi label="T" value={counts.T} />
        <Kpi label="C" value={counts.C} />
        <Kpi label="Ocupado" value={`${ocupado}/${capacity}`} />
      </div>

      <div style={styles.progressOuter}>
        <div style={{ ...styles.progressInner, width: `${progress}%` }} />
      </div>
      <div style={styles.progressText}>{progress}% ocupado</div>

      <div style={styles.gridWrap}>
        <CargaSlotGrid cells={cells} />
      </div>
    </Card>
  );
}

const styles = {
  card: { display: "flex", flexDirection: "column", gap: theme.SPACE_2 },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACE_2,
  },
  title: {
    fontSize: theme.FS_BASE,
    fontWeight: theme.FW_EXTRABOLD,
    color: theme.TEXT,
  },
  liveBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.SPACE_1,
    padding: `${theme.SPACE_1}px ${theme.SPACE_3}px`,
    borderRadius: theme.RADIUS_PILL,
    background: theme.ACCENT_SOFT,
    color: theme.ACCENT,
    border: `1px solid ${theme.ACCENT_BORDER}`,
    fontSize: theme.FS_XS,
    fontWeight: theme.FW_EXTRABOLD,
    whiteSpace: "nowrap",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: theme.RADIUS_PILL,
    background: theme.ACCENT,
    display: "inline-block",
  },
  meta: {
    display: "grid",
    gap: 2,
    color: theme.SLATE,
    fontSize: theme.FS_SM,
    fontWeight: theme.FW_MEDIUM,
  },
  uid: {
    color: theme.MUTED,
    fontSize: theme.FS_XS,
    fontFamily: "monospace",
    wordBreak: "break-all",
  },
  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(52px, 1fr))",
    gap: theme.SPACE_1,
  },
  kpi: {
    border: `1px solid ${theme.BORDER}`,
    background: theme.SURFACE_SOFT,
    borderRadius: theme.RADIUS_SM,
    padding: `${theme.SPACE_1}px ${theme.SPACE_2}px`,
    display: "grid",
    gap: 0,
  },
  kpiLabel: {
    color: theme.MUTED,
    fontSize: 10,
    fontWeight: theme.FW_BOLD,
  },
  kpiValue: {
    color: theme.TEXT,
    fontSize: theme.FS_BASE,
    fontWeight: theme.FW_EXTRABOLD,
  },
  progressOuter: {
    height: 7,
    borderRadius: theme.RADIUS_PILL,
    background: theme.SURFACE_INSET,
    overflow: "hidden",
  },
  progressInner: {
    height: "100%",
    background: theme.ACCENT,
    transition: "width 200ms ease",
  },
  progressText: {
    color: theme.SLATE,
    fontSize: theme.FS_XS,
    fontWeight: theme.FW_BOLD,
  },
  gridWrap: {
    marginTop: theme.SPACE_1,
  },
};
