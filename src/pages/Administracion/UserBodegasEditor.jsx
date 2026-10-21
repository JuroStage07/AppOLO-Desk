import React, { useMemo } from "react";
import { Check, Star } from "lucide-react";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  SLATE,
  SURFACE,
  SURFACE_INSET,
  TEXT,
} from "../../styles/theme";
import { groupBodegasByScope, resolveBodegas } from "../../utils/userScope";

/**
 * Asignación de almacenes a un usuario (solo dev edita; el resto lo ve en modo lectura).
 * - Marcar = almacén asignado (puede ser de cualquier país/compañía).
 * - Estrella = almacén activo: define el país y la compañía con los que el usuario
 *   ve y registra datos. Tiene que estar entre los asignados.
 *
 * value: { bodegaIds: string[], activeBodegaId: string }
 */
export default function UserBodegasEditor({ catalog, value, onChange, readOnly = false }) {
  const selected = useMemo(() => new Set(value?.bodegaIds || []), [value]);
  const activeId = value?.activeBodegaId || "";

  // Todos los almacenes activos del catálogo + los ya asignados aunque estén inactivos.
  const options = useMemo(() => {
    const ids = new Set([...(catalog?.bodegas || []).filter((b) => b.active).map((b) => b.id), ...selected]);
    return resolveBodegas([...ids], catalog);
  }, [catalog, selected]);
  const groups = useMemo(
    () => groupBodegasByScope(readOnly ? options.filter((b) => selected.has(b.id)) : options, catalog),
    [options, catalog, readOnly, selected]
  );

  const toggle = (id) => {
    const next = new Set(selected);
    let nextActive = activeId;
    if (next.has(id)) {
      next.delete(id);
      if (nextActive === id) nextActive = [...next][0] || "";
    } else {
      next.add(id);
      if (!nextActive) nextActive = id;
    }
    onChange({ bodegaIds: [...next], activeBodegaId: nextActive });
  };

  const makeActive = (id) => {
    const next = new Set(selected).add(id);
    onChange({ bodegaIds: [...next], activeBodegaId: id });
  };

  if (groups.length === 0) {
    return <div style={styles.empty}>{readOnly ? "Sin almacenes asignados." : "No hay almacenes en el catálogo."}</div>;
  }

  return (
    <div style={styles.wrap}>
      {groups.map((g) => (
        <div key={g.key} style={styles.group}>
          <div style={styles.groupTitle}>
            {g.tenantName} · {g.companyName}
          </div>
          <div style={styles.grid}>
            {g.bodegas.map((b) => {
              const isSel = selected.has(b.id);
              const isActive = activeId === b.id;
              return (
                <div key={b.id} style={{ ...styles.item, ...(isSel ? styles.itemSel : null) }}>
                  {readOnly ? (
                    <span style={styles.itemLabel}>
                      <span style={styles.itemName}>{b.name}</span>
                      <span style={styles.itemId}>{b.id}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      style={styles.checkBtn}
                      onClick={() => toggle(b.id)}
                      aria-pressed={isSel}
                      aria-label={`${isSel ? "Quitar" : "Asignar"} ${b.name} (${b.id})`}
                    >
                      <span style={{ ...styles.checkbox, ...(isSel ? styles.checkboxOn : null) }}>
                        {isSel && <Check size={10} strokeWidth={3} color="#fff" />}
                      </span>
                      <span style={styles.itemLabel}>
                        <span style={styles.itemName}>{b.name}</span>
                        <span style={styles.itemId}>{b.id}</span>
                      </span>
                    </button>
                  )}
                  {!b.active && <span style={styles.tag}>Inactivo</span>}
                  {isActive ? (
                    <span style={styles.activeTag}>
                      <Star size={11} strokeWidth={2.6} /> Activo
                    </span>
                  ) : (
                    !readOnly &&
                    isSel && (
                      <button type="button" style={styles.makeActive} onClick={() => makeActive(b.id)}>
                        Hacer activo
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {!readOnly && (
        <div style={styles.hint}>
          Marcá los almacenes a los que tiene acceso. El <strong>activo</strong> define el país y la compañía
          con los que entra; puede cambiarlo él mismo entre los asignados desde la barra superior. Los datos de
          cada país y compañía no se comparten.
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { display: "grid", gap: 12 },
  group: { display: "grid", gap: 6 },
  groupTitle: { fontSize: 11, fontWeight: 900, color: SLATE, textTransform: "uppercase", letterSpacing: 0.4 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: 8 },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: "8px 10px",
    background: SURFACE,
    minWidth: 0,
  },
  itemSel: { borderColor: ACCENT, background: ACCENT_SOFT },
  checkBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    border: "none",
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 5,
    border: `1.5px solid ${BORDER}`,
    background: SURFACE,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  checkboxOn: { background: ACCENT, borderColor: ACCENT },
  itemLabel: { display: "flex", flexDirection: "column", minWidth: 0, flex: 1 },
  itemName: { fontSize: 13, fontWeight: 850, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  itemId: { fontSize: 10.5, fontWeight: 700, color: SLATE, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  tag: {
    fontSize: 10,
    fontWeight: 800,
    color: SLATE,
    background: SURFACE_INSET,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: "1px 7px",
    flexShrink: 0,
  },
  activeTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10.5,
    fontWeight: 900,
    color: "#fff",
    background: ACCENT,
    borderRadius: 999,
    padding: "2px 8px",
    flexShrink: 0,
  },
  makeActive: {
    border: `1px solid ${ACCENT}`,
    background: SURFACE,
    color: ACCENT,
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 10.5,
    fontWeight: 900,
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: "inherit",
  },
  hint: { fontSize: 12, fontWeight: 700, color: SLATE, lineHeight: 1.45 },
  empty: { fontSize: 13, fontWeight: 700, color: SLATE },
};
