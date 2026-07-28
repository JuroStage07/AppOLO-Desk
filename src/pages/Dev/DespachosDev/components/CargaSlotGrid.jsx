// Feature: despachos-dev — grid 12×2 del contenedor (posiciones de carga).
//
// Renderiza las 24 posiciones del layout como una grilla de 12 filas × 2
// columnas, coloreada por tipo de tarima (E/S/D/T/C) usando los tokens del tema
// `CARGA_SLOT_COLORS`. Incluye la leyenda (Libre, S, D, T, C).
//
// Solo lectura: no muta ni escribe posiciones.

import React from "react";
import { theme } from "../../../../components/ui";
import { toRows } from "../lib/cargaLayout.js";

const LEGEND = [
  { key: "E", label: "Libre" },
  { key: "S", label: "S" },
  { key: "D", label: "D" },
  { key: "T", label: "T" },
  { key: "C", label: "C" },
];

function colorFor(type) {
  return theme.CARGA_SLOT_COLORS[type] || theme.CARGA_SLOT_COLORS.E;
}

function SlotCell({ pos, cell }) {
  const filled = cell.type !== "E";
  return (
    <div
      style={{
        ...styles.cell,
        background: colorFor(cell.type),
        color: filled ? "#fff" : theme.SLATE,
        borderColor: filled ? "transparent" : theme.BORDER,
      }}
      title={filled ? `Posición ${pos} · ${cell.type}` : `Posición ${pos} · libre`}
    >
      {pos}
    </div>
  );
}

/**
 * @param {{ cells: Array<{type:string}> }} props - 24 celdas normalizadas.
 */
export default function CargaSlotGrid({ cells }) {
  const rows = toRows(cells);
  return (
    <div>
      <div style={styles.grid}>
        {rows.map((r) => (
          <div key={r.row} style={styles.rowPair}>
            <SlotCell pos={r.left.pos} cell={r.left.cell} />
            <SlotCell pos={r.right.pos} cell={r.right.cell} />
          </div>
        ))}
      </div>

      <div style={styles.legend}>
        {LEGEND.map((l) => (
          <span key={l.key} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: colorFor(l.key) }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gap: theme.SPACE_1,
    justifyContent: "center",
  },
  rowPair: {
    display: "flex",
    gap: theme.SPACE_1,
    justifyContent: "center",
  },
  cell: {
    width: 26,
    height: 22,
    borderRadius: 6,
    border: "1px solid",
    display: "grid",
    placeItems: "center",
    fontSize: 10,
    fontWeight: theme.FW_EXTRABOLD,
    lineHeight: 1,
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.SPACE_2,
    justifyContent: "center",
    marginTop: theme.SPACE_2,
    color: theme.SLATE,
    fontSize: theme.FS_XS,
    fontWeight: theme.FW_BOLD,
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.SPACE_1,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    border: `1px solid ${theme.BORDER}`,
    display: "inline-block",
  },
};
