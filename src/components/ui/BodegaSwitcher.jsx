import React, { useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Warehouse, ChevronDown, Check, X, Loader2 } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { AuthCtx } from "../../auth/AuthProvider";
import { getBodegasForScope, getBodegaLabel } from "../../config/bodegas";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, SURFACE, SURFACE_SOFT, TEXT } from "../../styles/theme";

/**
 * Chip en la sub-barra (junto a "CR · OLO") que abre un modal para cambiar la
 * bodega activa. La bodega vive en profiles/{uid}.bodegaId y gobierna todo el
 * scope de lectura/escritura (reglas + filtros en memoria + payloads).
 *
 * Al cambiarla escribimos Firestore + localStorage y recargamos, para que
 * AuthProvider relea el perfil y TODA la app use la nueva bodega.
 */
export default function BodegaSwitcher() {
  const { profile } = useContext(AuthCtx) || {};
  const tenantId = String(profile?.tenantId || "").trim();
  const company = String(profile?.company || "").trim();
  const bodegaId = String(profile?.bodegaId || "").trim();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(bodegaId);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const options = useMemo(
    () => (tenantId ? getBodegasForScope(tenantId, company) : []),
    [tenantId, company]
  );

  // Sin scope de tenant/company aún → no mostramos el chip (ver /config-region).
  if (!tenantId || !company) return null;

  const currentLabel = bodegaId ? getBodegaLabel(bodegaId) : "Sin bodega";

  const openModal = () => {
    setSelected(bodegaId);
    setErr("");
    setOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setOpen(false);
  };

  const handleSave = async () => {
    setErr("");
    if (!selected || selected === bodegaId) {
      setOpen(false);
      return;
    }
    const bodega = options.find((b) => b.id === selected);
    if (!bodega) {
      setErr("Bodega inválida.");
      return;
    }
    if (!auth.currentUser) {
      setErr("No hay sesión activa.");
      return;
    }
    try {
      setSaving(true);
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, "profiles", uid), {
        bodegaId: bodega.id,
        bodegaNombre: bodega.label,
      });

      const raw = localStorage.getItem("appolo_profile");
      const current = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        "appolo_profile",
        JSON.stringify({ ...current, bodegaId: bodega.id, bodegaNombre: bodega.label })
      );
      window.dispatchEvent(new Event("appolo_profile_updated"));

      // Recarga completa: garantiza que AuthProvider relea el perfil y que todas
      // las vistas/consultas usen la nueva bodega (lectura y escritura).
      window.location.reload();
    } catch (e) {
      console.error("BodegaSwitcher save error:", e);
      setErr(e?.message || "No se pudo cambiar la bodega.");
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        style={chip}
        title="Cambiar bodega"
        aria-label={`Bodega actual: ${currentLabel}. Cambiar bodega`}
      >
        <Warehouse size={13} strokeWidth={2.3} style={{ color: ACCENT, flexShrink: 0 }} />
        <span style={chipLabel}>{currentLabel}</span>
        <ChevronDown size={13} strokeWidth={2.4} style={{ color: SLATE, flexShrink: 0 }} />
      </button>

      {open &&
        createPortal(
          <div style={overlay} onMouseDown={closeModal} role="presentation">
            <div
              style={card}
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Cambiar bodega"
            >
              <div style={header}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={iconBox}>
                    <Warehouse size={18} strokeWidth={2.2} style={{ color: ACCENT }} />
                  </div>
                  <div>
                    <div style={title}>Cambiar bodega</div>
                    <div style={subtitle}>
                      {tenantId} · {company}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  style={closeBtn}
                  aria-label="Cerrar"
                >
                  <X size={18} strokeWidth={2.3} />
                </button>
              </div>

              <div style={body}>
                {options.length === 0 ? (
                  <div style={emptyHint}>
                    No hay bodegas configuradas para {tenantId} · {company}.
                  </div>
                ) : (
                  <div style={list}>
                    {options.map((b) => {
                      const isSel = selected === b.id;
                      const isCurrent = bodegaId === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          disabled={saving}
                          onClick={() => setSelected(b.id)}
                          style={{ ...row, ...(isSel ? rowActive : {}) }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                            <span style={rowLabel}>{b.label}</span>
                            <span style={rowId}>{b.id}</span>
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            {isCurrent && <span style={currentTag}>Actual</span>}
                            {isSel && <Check size={17} strokeWidth={2.6} style={{ color: ACCENT }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {err ? <div style={errBox}>{err}</div> : null}
              </div>

              <div style={footer}>
                <button type="button" onClick={closeModal} disabled={saving} style={btnGhost}>
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || options.length === 0 || !selected || selected === bodegaId}
                  style={{
                    ...btnPrimary,
                    ...((saving || options.length === 0 || !selected || selected === bodegaId)
                      ? btnDisabled
                      : {}),
                  }}
                >
                  {saving ? (
                    <>
                      <Loader2 size={15} strokeWidth={2.4} style={{ animation: "spin 0.9s linear infinite" }} />
                      Cambiando…
                    </>
                  ) : (
                    "Cambiar bodega"
                  )}
                </button>
              </div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>,
          document.body
        )}
    </>
  );
}

/* ── styles ── */
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 26,
  padding: "0 8px",
  borderRadius: 8,
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
};
const chipLabel = {
  fontSize: 11,
  fontWeight: 800,
  color: TEXT,
  lineHeight: 1.2,
  maxWidth: 140,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 1000,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};
const card = {
  width: "min(440px, 100%)",
  background: SURFACE,
  borderRadius: 18,
  border: `1px solid ${BORDER}`,
  boxShadow: "0 24px 60px rgba(15,23,42,0.28)",
  overflow: "hidden",
};
const header = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  padding: "16px 16px 12px",
  borderBottom: `1px solid ${BORDER}`,
};
const iconBox = {
  width: 38,
  height: 38,
  borderRadius: 11,
  background: ACCENT_SOFT,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const title = { fontSize: 16, fontWeight: 900, color: TEXT, lineHeight: 1.2 };
const subtitle = { marginTop: 2, fontSize: 12, fontWeight: 700, color: SLATE };
const closeBtn = {
  border: "none",
  background: "transparent",
  color: SLATE,
  cursor: "pointer",
  padding: 4,
  borderRadius: 8,
  lineHeight: 0,
};
const body = { padding: 14 };
const list = { display: "grid", gap: 8 };
const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  padding: "12px 12px",
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  background: SURFACE_SOFT,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};
const rowActive = {
  background: ACCENT_SOFT,
  border: `1px solid ${ACCENT}`,
};
const rowLabel = { fontSize: 14, fontWeight: 800, color: TEXT, lineHeight: 1.25 };
const rowId = { fontSize: 11, fontWeight: 600, color: SLATE, marginTop: 1 };
const currentTag = {
  fontSize: 10,
  fontWeight: 800,
  color: ACCENT,
  background: SURFACE,
  border: `1px solid ${ACCENT}`,
  borderRadius: 999,
  padding: "1px 7px",
};
const emptyHint = { fontSize: 13, fontWeight: 700, color: SLATE, padding: "8px 4px" };
const errBox = {
  marginTop: 12,
  borderRadius: 12,
  border: "1px solid #ffd1d1",
  background: "#fff6f6",
  padding: 10,
  fontSize: 12.5,
  fontWeight: 700,
  color: "#b42318",
};
const footer = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "12px 16px 16px",
};
const btnBase = {
  height: 38,
  padding: "0 16px",
  borderRadius: 11,
  fontFamily: "inherit",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};
const btnGhost = {
  ...btnBase,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: SLATE,
};
const btnPrimary = {
  ...btnBase,
  border: `1px solid ${ACCENT}`,
  background: ACCENT,
  color: "#fff",
};
const btnDisabled = { opacity: 0.55, cursor: "not-allowed" };
