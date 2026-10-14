import React from "react";
import { BORDER, SLATE, SURFACE, SURFACE_INSET, TEXT } from "../styles/theme";

/**
 * Tabla de solo lectura con aspecto de hoja de cálculo: líneas de celda,
 * encabezado y columna de número de fila fijos, scroll horizontal y vertical.
 *
 * columns: [{ header, key, align?, width?, render?(row) }]
 * rowStyle?(row): estilo extra por fila (p. ej. resaltar atrasadas).
 */
export default function OvertimeSheetTable({ columns, rows, rowKey, rowStyle, maxHeight = "70vh" }) {
  return (
    <div style={{ ...styles.scroll, maxHeight }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, ...styles.corner }}>#</th>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ ...styles.th, textAlign: col.align || "left", minWidth: col.width || 90 }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i} style={rowStyle ? rowStyle(row) : undefined}>
              <td style={styles.rowNum}>{i + 1}</td>
              {columns.map((col) => (
                <td key={col.key} style={{ ...styles.td, textAlign: col.align || "left" }}>
                  {col.render ? col.render(row) : row[col.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cell = {
  border: `1px solid ${BORDER}`,
  padding: "6px 10px",
  fontSize: 12.5,
  whiteSpace: "nowrap",
};

const styles = {
  scroll: {
    overflow: "auto",
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    background: SURFACE,
  },
  table: {
    borderCollapse: "collapse",
    width: "max-content",
    minWidth: "100%",
    fontVariantNumeric: "tabular-nums",
  },
  th: {
    ...cell,
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: SURFACE_INSET,
    color: SLATE,
    fontWeight: 950,
    fontSize: 11.5,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  corner: {
    left: 0,
    zIndex: 3,
    textAlign: "center",
    minWidth: 44,
  },
  rowNum: {
    ...cell,
    position: "sticky",
    left: 0,
    zIndex: 1,
    background: SURFACE_INSET,
    color: SLATE,
    fontWeight: 900,
    textAlign: "center",
  },
  td: {
    ...cell,
    color: TEXT,
    fontWeight: 700,
  },
};
