import React from "react";
import { Check } from "lucide-react";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, SURFACE, SURFACE_INSET, TEXT } from "../../styles/theme";
import { PERMISSION_MATRIX } from "../../config/permissions";

/**
 * Matriz de permisos por acción: una fila por módulo, una columna por acción.
 * Si el módulo tiene "acceso total" (fullKey) y está activo, las acciones quedan
 * marcadas como incluidas (no hace falta marcarlas una por una).
 *
 * props: permisos (map), onToggle(key), readOnly
 */
export default function PermissionMatrix({ permisos = {}, onToggle, readOnly = false }) {
  return (
    <div style={styles.wrap}>
      {PERMISSION_MATRIX.map((mod) => {
        const fullOn = mod.fullKey ? permisos[mod.fullKey] === true : false;
        return (
          <div key={mod.key} style={styles.module}>
            <div style={styles.moduleHead}>
              <span style={styles.moduleName}>{mod.label}</span>
              {mod.fullKey && (
                <Cell
                  label="Acceso total"
                  on={fullOn}
                  readOnly={readOnly}
                  onClick={() => onToggle?.(mod.fullKey)}
                  strong
                />
              )}
            </div>
            <div style={styles.actions}>
              {mod.actions.map((a) => {
                const explicit = permisos[a.key] === true;
                return (
                  <Cell
                    key={a.key}
                    label={a.label}
                    on={explicit || fullOn}
                    implied={fullOn && !explicit}
                    readOnly={readOnly || fullOn}
                    onClick={() => onToggle?.(a.key)}
                    title={fullOn ? "Incluido por «Acceso total»" : undefined}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cell({ label, on, implied, readOnly, onClick, strong, title }) {
  const style = {
    ...styles.cell,
    ...(on ? styles.cellOn : null),
    ...(implied ? styles.cellImplied : null),
    ...(strong ? styles.cellStrong : null),
    cursor: readOnly ? "default" : "pointer",
  };
  const content = (
    <>
      <span style={{ ...styles.box, ...(on ? styles.boxOn : null), ...(implied ? styles.boxImplied : null) }}>
        {on && <Check size={10} strokeWidth={3} color="#fff" />}
      </span>
      {label}
    </>
  );
  if (readOnly) {
    return (
      <span style={style} title={title}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" style={style} onClick={onClick} aria-pressed={on} title={title}>
      {content}
    </button>
  );
}

const styles = {
  wrap: { display: "grid", gap: 10 },
  module: { border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", background: SURFACE },
  moduleHead: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 10px",
    background: SURFACE_INSET,
    borderBottom: `1px solid ${BORDER}`,
  },
  moduleName: { fontSize: 12.5, fontWeight: 950, color: TEXT },
  actions: { display: "flex", flexWrap: "wrap", gap: 6, padding: 10 },
  cell: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    color: TEXT,
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 800,
    fontFamily: "inherit",
  },
  cellOn: { borderColor: ACCENT, background: ACCENT_SOFT, color: ACCENT },
  cellImplied: { opacity: 0.75 },
  cellStrong: { fontWeight: 950 },
  box: {
    width: 14,
    height: 14,
    borderRadius: 4,
    border: `1.5px solid ${BORDER}`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    background: SURFACE,
  },
  boxOn: { background: ACCENT, borderColor: ACCENT },
  boxImplied: { background: SLATE, borderColor: SLATE },
};
