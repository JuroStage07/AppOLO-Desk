// Feature: despachos-dev — insignia de estado (color + texto).
//
// Especialización delgada del `Badge` del UI kit. Compone el color del estado
// (tokens del tema, vía `colorFor`) con una etiqueta legible no vacía (nombre
// del Catalogo_Estados, vía `labelFor`/`mapaEstados.label`). El estado NUNCA se
// comunica sólo por color: siempre se renderiza texto. Para códigos
// desconocidos usa color neutro y el propio código como etiqueta.
// (Requirements 3.2, 3.3, 5.4, 11.1 — Property 4). No duplica `Badge`: lo reutiliza.

import React from "react";
import * as LucideIcons from "lucide-react";
import { Badge, theme } from "../../../../components/ui";
import { colorFor, labelFor, iconFor } from "../lib/mapaEstados.js";

/**
 * Insignia de estado. Acepta un `mapaEstados` prearmado o un `catalogo`; deriva
 * la etiqueta y el color desde la capa de dominio pura (que a su vez consume los
 * tokens del tema). Siempre renderiza texto legible, aun para estados
 * desconocidos (fallback al propio `codigo`).
 *
 * @param {object} props
 * @param {string} props.codigo - Código del estado a mostrar.
 * @param {Array<{codigo:string,nombre?:string}>} [props.catalogo] - Catalogo_Estados.
 * @param {{label:(codigo:string)=>string,color:(codigo:string)=>string,icon:(codigo:string)=>string}} [props.mapaEstados]
 * @param {object} [props.style] - Override de estilo para el `Badge` subyacente.
 */
export default function EstadoBadge({ codigo, catalogo, mapaEstados, style }) {
  // Etiqueta: mapaEstados prearmado > catálogo > el propio código (nunca vacía).
  const rawLabel = mapaEstados
    ? mapaEstados.label(codigo)
    : labelFor(codigo, catalogo);
  const label =
    typeof rawLabel === "string" && rawLabel.trim().length > 0
      ? rawLabel
      : String(codigo ?? "");

  // Color e ícono desde los tokens del tema (neutro para desconocidos).
  const color = mapaEstados ? mapaEstados.color(codigo) : colorFor(codigo);
  const iconName = mapaEstados ? mapaEstados.icon(codigo) : iconFor(codigo);
  const Icon = iconName ? LucideIcons[iconName] : undefined;

  // Fondo/borde sutiles derivados del color del estado; texto legible con el
  // color pleno (buen contraste sobre el tinte claro). Sin literales de color.
  const colorStyle = {
    background: theme.withAlpha(color, 0.12),
    border: `1px solid ${theme.withAlpha(color, 0.35)}`,
    color,
  };

  return (
    <Badge icon={Icon} style={{ ...colorStyle, ...style }}>
      {label}
    </Badge>
  );
}
