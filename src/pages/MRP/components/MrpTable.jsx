// MRP Tarimas — primitivo de tabla SIMPLE (solo lectura) con estilo compartido:
// filas cebra + hover, dentro del wrapper con scroll horizontal y borde.
//
// Úsalo para tablas informativas (dashboard, descartes, modales de detalle) que
// escriben su propio <thead>/<tbody> con los estilos `th`/`td` de mrpFormat.
// Para tablas INTERACTIVAS (filtros por columna, reorden por arrastre,
// paginación, primera columna fija) usa MrpDataTable en su lugar.
import React from "react";
import { TableScroll } from "../../../components/ui";
import { accentAlpha, SURFACE_INSET } from "../../../styles/theme";

export default function MrpTable({ minWidth = 640, children, ...rest }) {
  return (
    <TableScroll minWidth={minWidth} {...rest}>
      <style>{`
        .mrp-table { width: 100%; border-collapse: collapse; }
        .mrp-table tbody tr { transition: background-color .12s ease; }
        .mrp-table tbody tr:nth-child(even) { background: ${SURFACE_INSET}; }
        .mrp-table tbody tr:hover { background: ${accentAlpha(0.08)}; }
      `}</style>
      <table className="mrp-table">{children}</table>
    </TableScroll>
  );
}
