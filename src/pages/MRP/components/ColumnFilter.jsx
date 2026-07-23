// MRP — filtro de columna estilo Excel: botón embudo en el encabezado que abre
// un popover con buscador + lista de valores (checkboxes). `selected === null`
// significa "todos" (sin filtro); un array son los valores permitidos.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Filter, Search, Check, X } from "lucide-react";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, SURFACE, SURFACE_SOFT, TEXT } from "../../../styles/theme";

export default function ColumnFilter({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  const active = Array.isArray(selected);
  const allValues = useMemo(() => options.map((o) => o.value), [options]);
  // Conjunto marcado actual (todos si no hay filtro).
  const checked = useMemo(
    () => new Set(active ? selected : allValues),
    [active, selected, allValues]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term));
  }, [options, q]);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 260;
    const left = Math.min(r.left, window.innerWidth - width - 12);
    setPos({ top: r.bottom + 6, left: Math.max(12, left), width });
  };

  useLayoutEffect(() => {
    // Posiciona el popover respecto al botón al abrir (patrón válido de medición).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (
        !popRef.current?.contains(e.target) &&
        !btnRef.current?.contains(e.target)
      )
        setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onScroll = () => place();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Emite el nuevo estado; si quedan todos marcados → null (sin filtro).
  const emit = (nextSet) => {
    if (nextSet.size >= allValues.length) onChange(null);
    else onChange([...nextSet]);
  };

  const toggle = (value) => {
    const next = new Set(checked);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    emit(next);
  };

  const selectAll = () => onChange(null);
  const clearAll = () => onChange([]);
  const onlyFiltered = () => emit(new Set(filtered.map((o) => o.value)));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...btn, ...(active ? btnActive : {}) }}
        title={active ? "Filtro activo" : "Filtrar columna"}
        aria-label="Filtrar columna"
      >
        <Filter size={13} strokeWidth={2.4} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ ...pop, top: pos.top, left: pos.left, width: pos.width }}
          >
            <div style={searchWrap}>
              <Search size={14} strokeWidth={2.3} color={SLATE} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar…"
                style={searchInput}
              />
              {q && (
                <button type="button" onClick={() => setQ("")} style={clearBtn} aria-label="Limpiar búsqueda">
                  <X size={13} strokeWidth={2.4} />
                </button>
              )}
            </div>

            <div style={quickRow}>
              <button type="button" onClick={selectAll} style={link}>
                Seleccionar todo
              </button>
              <span style={{ color: BORDER }}>·</span>
              <button type="button" onClick={clearAll} style={link}>
                Limpiar
              </button>
              {q && (
                <>
                  <span style={{ color: BORDER }}>·</span>
                  <button type="button" onClick={onlyFiltered} style={link}>
                    Solo estos
                  </button>
                </>
              )}
            </div>

            <div style={list}>
              {filtered.length === 0 ? (
                <div style={empty}>Sin coincidencias</div>
              ) : (
                filtered.map((o) => {
                  const on = checked.has(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggle(o.value)}
                      style={row}
                    >
                      <span style={{ ...box, ...(on ? boxOn : {}) }}>
                        {on && <Check size={12} strokeWidth={3} color="#fff" />}
                      </span>
                      <span style={rowLabel}>{o.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

const btn = {
  display: "inline-grid",
  placeItems: "center",
  width: 22,
  height: 22,
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: SLATE,
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
};
const btnActive = { borderColor: ACCENT, background: ACCENT_SOFT, color: ACCENT };

const pop = {
  position: "fixed",
  zIndex: 30060,
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow: "0 18px 46px rgba(15,23,42,0.22)",
  padding: 10,
  display: "grid",
  gap: 8,
};
const searchWrap = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  border: `1px solid ${BORDER}`,
  borderRadius: 9,
  padding: "7px 9px",
  background: SURFACE_SOFT,
};
const searchInput = {
  flex: 1,
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: 13,
  fontWeight: 650,
  color: TEXT,
  fontFamily: "inherit",
  minWidth: 0,
};
const clearBtn = {
  border: "none",
  background: "transparent",
  color: SLATE,
  cursor: "pointer",
  padding: 0,
  lineHeight: 0,
};
const quickRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11.5,
  paddingLeft: 2,
};
const link = {
  border: "none",
  background: "transparent",
  color: ACCENT,
  fontWeight: 800,
  fontSize: 11.5,
  cursor: "pointer",
  padding: 0,
  fontFamily: "inherit",
};
const list = {
  display: "grid",
  gap: 2,
  maxHeight: 240,
  overflowY: "auto",
};
const row = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  padding: "7px 8px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};
const box = {
  width: 17,
  height: 17,
  borderRadius: 5,
  border: `1.5px solid ${BORDER}`,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const boxOn = { background: ACCENT, borderColor: ACCENT };
const rowLabel = {
  fontSize: 13,
  fontWeight: 700,
  color: TEXT,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const empty = { fontSize: 12.5, fontWeight: 700, color: SLATE, padding: "8px 4px" };
