import React from "react";
import { Pin, X } from "lucide-react";
import { useAllPinnedModules } from "../../hooks/usePinnedModules";
import { ACCENT, BORDER, MUTED, SLATE, TEXT } from "../../styles/theme";

const SHADOW_LG = "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)";

const AREA_TITLES = {
  despacho: "Despacho",
  salud: "Salud Ocupacional",
  recepcion: "Recepción",
  mantenimiento: "Mantenimiento",
  "servicios-generales": "Servicios Generales",
  epa: "EPA",
};

/**
 * Lateral flyout that lists every pinned shortcut ("Mis Pin").
 * Slides out to the right of a 300px sidebar.
 *
 * Props:
 *  - open: whether the flyout is visible.
 *  - onClose: close just the flyout (back to the sidebar).
 *  - onNavigate(path): called when a pin is clicked (caller should also close the sidebar).
 *  - restrictTo: optional moduleKey to limit which pins are shown (e.g. "epa").
 */
export default function PinsFlyout({ open, onClose, onNavigate, restrictTo }) {
  const { pins, removePin } = useAllPinnedModules();
  const visible = restrictTo ? pins.filter((p) => p.moduleKey === restrictTo) : pins;

  return (
    <aside
      style={{
        ...panel,
        transform: open ? "translateX(0)" : "translateX(-105%)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
    >
      <div style={header}>
        <span style={title}>Mis Pin</span>
        <button type="button" onClick={onClose} style={closeBtn} aria-label="Cerrar Mis Pin">
          <X size={18} strokeWidth={2.2} />
        </button>
      </div>
      <div style={body}>
        {visible.length === 0 ? (
          <div style={empty}>
            <Pin size={16} strokeWidth={2} style={{ transform: "rotate(-45deg)", flexShrink: 0 }} />
            <span>No tenés accesos fijados. Tocá el pin en las tarjetas para agregarlos.</span>
          </div>
        ) : (
          visible.map((p) => (
            <div key={`${p.moduleKey}:${p.path}`} style={row}>
              <button type="button" onClick={() => onNavigate(p.path)} style={item}>
                <span style={dot} />
                <span style={textWrap}>
                  <span style={label}>{p.label}</span>
                  <span style={moduleName}>{AREA_TITLES[p.moduleKey] ?? p.moduleKey}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => removePin(p.moduleKey, p.path)}
                style={removeBtn}
                title="Quitar pin"
                aria-label="Quitar pin"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

const panel = {
  position: "fixed",
  top: 0,
  bottom: 0,
  left: 300,
  width: 280,
  maxWidth: "80vw",
  background: "#FFFFFF",
  borderRight: `1px solid ${BORDER}`,
  boxShadow: SHADOW_LG,
  zIndex: 1001,
  display: "flex",
  flexDirection: "column",
  transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease",
  overflow: "hidden",
};
const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "18px 20px",
  borderBottom: `1px solid ${BORDER}`,
  flexShrink: 0,
};
const title = { fontSize: 15, fontWeight: 750, color: TEXT, letterSpacing: -0.2 };
const closeBtn = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "none",
  background: "#F1F5F9",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: "#475569",
  fontFamily: "inherit",
  padding: 0,
};
const body = {
  flex: 1,
  overflow: "auto",
  padding: "12px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const row = { display: "flex", alignItems: "center", gap: 0 };
const item = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  borderRadius: 10,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  width: "100%",
  flex: 1,
  minWidth: 0,
  transition: "background 150ms ease",
};
const dot = { width: 6, height: 6, borderRadius: 999, background: ACCENT, flexShrink: 0 };
const textWrap = { display: "grid", gap: 1, minWidth: 0 };
const label = {
  fontSize: 13,
  fontWeight: 700,
  color: TEXT,
  lineHeight: 1.2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const moduleName = { fontSize: 11, fontWeight: 500, color: MUTED, lineHeight: 1.2 };
const removeBtn = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: MUTED,
  flexShrink: 0,
  fontFamily: "inherit",
  padding: 0,
};
const empty = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "12px 14px",
  color: SLATE,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
};
