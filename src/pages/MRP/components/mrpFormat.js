// MRP Tarimas — helpers de formato y estilos de tabla (sin componentes).
import { BORDER, SLATE, TEXT } from "../../../styles/theme";

export function fmtDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("es-CR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return String(ts);
  }
}

// Estilos de celdas de tabla reutilizables (coherentes con el kit).
export const th = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 900,
  color: SLATE,
  borderBottom: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
};

export const td = {
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 700,
  color: TEXT,
  borderBottom: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
};

// Fila de filtros: grid responsive auto-fit.
export const filtersRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 12,
  alignItems: "end",
};
