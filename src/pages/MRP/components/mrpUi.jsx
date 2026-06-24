// MRP Tarimas — badges de presentación compartidos por las pantallas.
// (Helpers no-componente: ver mrpFormat.js)
import React from "react";
import { Badge } from "../../../components/ui";
import {
  PALLET_TYPE_LABELS,
  PALLET_LOCATION_LABELS,
  PALLET_MOVEMENT_TYPE_LABELS,
} from "../../../services/mrp";

export function TypeBadge({ value }) {
  if (!value) return <>—</>;
  return <Badge tone="neutral">{PALLET_TYPE_LABELS[value] || value}</Badge>;
}

export function LocationBadge({ value }) {
  if (!value) return <>—</>;
  // merma se distingue (operativa pero "fin de línea"); pend = entrada.
  const tone = value === "merma" ? "dark" : value === "pend" ? "accent" : "neutral";
  return <Badge tone={tone}>{PALLET_LOCATION_LABELS[value] || value}</Badge>;
}

export function MovementBadge({ value }) {
  if (!value) return <>—</>;
  const tone =
    value === "ajuste_positivo"
      ? "accent"
      : value === "ajuste_negativo"
      ? "dark"
      : "neutral";
  return <Badge tone={tone}>{PALLET_MOVEMENT_TYPE_LABELS[value] || value}</Badge>;
}
