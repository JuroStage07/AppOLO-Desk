// MRP Tarimas — selector de artículo con búsqueda por código o nombre.
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SearchInput } from "../../../components/ui";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  SLATE,
  TEXT,
} from "../../../styles/theme";

export default function ArticuloSearchSelect({
  articulos = [],
  value = "",
  onChange,
  allLabel = "Todos los artículos",
  placeholder = "Buscar por código o nombre…",
  maxWidth = 360,
  size = "sm", // "sm" | "md"
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = articulos.find((a) => a.id === value);
  const label = selected
    ? `${selected.codigo} · ${selected.nombre}`
    : allLabel;

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? articulos.filter((a) =>
        `${a.codigo} ${a.nombre}`.toLowerCase().includes(needle)
      )
    : articulos;

  const pick = (id) => {
    onChange?.(id);
    setOpen(false);
    setQ("");
  };

  const triggerStyle = {
    ...trigger,
    padding: size === "md" ? "11px 14px" : "8px 10px",
    fontSize: size === "md" ? 15 : 13,
  };

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={triggerStyle}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <ChevronDown size={16} strokeWidth={2.2} color={SLATE} />
      </button>

      {open && (
        <div style={dropdown}>
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder={placeholder}
            autoFocus
          />
          <div style={list}>
            <button type="button" onClick={() => pick("")} style={item(!value)}>
              {allLabel}
            </button>
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a.id)}
                style={item(value === a.id)}
              >
                <b style={{ fontFamily: "monospace" }}>{a.codigo}</b> · {a.nombre}
              </button>
            ))}
            {filtered.length === 0 && <div style={empty}>Sin resultados</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const trigger = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 14,
  border: `1px solid ${BORDER}`,
  background: "#FBFCFF",
  color: TEXT,
  fontWeight: 850,
  fontSize: 13,
  fontFamily: "inherit",
  cursor: "pointer",
};

const dropdown = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  zIndex: 40,
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: "0 18px 40px rgba(15,23,42,0.16)",
  padding: 8,
  display: "grid",
  gap: 8,
};

const list = {
  maxHeight: 240,
  overflowY: "auto",
  display: "grid",
  gap: 2,
};

function item(active) {
  return {
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: active ? ACCENT_SOFT : "transparent",
    color: active ? ACCENT : TEXT,
    fontWeight: 800,
    fontSize: 13,
    fontFamily: "inherit",
    cursor: "pointer",
  };
}

const empty = {
  padding: "8px 10px",
  color: SLATE,
  fontWeight: 700,
  fontSize: 13,
};
