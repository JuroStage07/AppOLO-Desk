// MRP Tarimas — badges de presentación compartidos por las pantallas.
// (Helpers no-componente: ver mrpFormat.js)
import React from "react";
import { Badge } from "../../../components/ui";
import {
  PALLET_LOCATION_LABELS,
  PALLET_MOVEMENT_TYPE_LABELS,
} from "../../../services/mrp";

export function LocationBadge({ value }) {
  if (!value) return <>—</>;
  // merma se distingue (operativa pero "fin de línea"); pend = entrada.
  const tone = value === "merma" ? "dark" : value === "pend" ? "accent" : "neutral";
  return <Badge tone={tone}>{PALLET_LOCATION_LABELS[value] || value}</Badge>;
}

export function MovementBadge({ value, metadata }) {
  if (!value) return <>—</>;
  const crossWh = value === "traslado" && metadata?.cross_warehouse;
  const tone =
    value === "ajuste_positivo"
      ? "accent"
      : value === "ajuste_negativo"
      ? "dark"
      : "neutral";
  let label = PALLET_MOVEMENT_TYPE_LABELS[value] || value;
  if (crossWh) {
    const dir =
      metadata.direction === "out"
        ? " · salida"
        : metadata.direction === "in"
        ? " · entrada"
        : "";
    label = `Traslado de almacén${dir}`;
  }
  return <Badge tone={tone}>{label}</Badge>;
}
