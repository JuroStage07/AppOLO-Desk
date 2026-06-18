import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Inbox, LayoutGrid, Lock, X } from "lucide-react";
import {
  ACCENT,
  ACCENT_SHADOW,
  accentAlpha,
  BORDER,
  FONT_STACK,
  MUTED,
  SLATE_DEEP,
  SURFACE,
  SURFACE_INSET,
  TEXT,
} from "../../styles/theme";

/* ─── Design tokens (same adapter as the hub) ─── */
const T = {
  accent: ACCENT,
  accentDark: "#06776A",
  accentSoft: accentAlpha(0.1),
  accentGlow: ACCENT_SHADOW,
  surface: SURFACE,
  surfaceAlt: SURFACE_INSET,
  border: BORDER,
  borderSoft: "rgba(226, 232, 240, 0.7)",
  text: TEXT,
  textSecondary: SLATE_DEEP,
  textMuted: MUTED,
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  font: FONT_STACK,
};

function hexToRgba(hex, alpha) {
  if (typeof hex !== "string" || !hex.startsWith("#")) return `rgba(8,159,138,${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Áreas de trabajo modal — Encarta-style lateral categories + dynamic central
 * panel. Extracted from AreasTrabajoHubPage so it can be reused by the global
 * CircleMenu overlay.
 *
 * Props:
 *  - areas: array of visible work areas (from getVisibleAreas)
 *  - onClose: close handler
 *  - onNavigate: (path) => navigate to a route
 *  - onComingSoon: (area) => handle coming-soon areas
 */
export default function AreasModal({ areas, onClose, onNavigate, onComingSoon }) {
  const [activeKey, setActiveKey] = useState(areas[0]?.key ?? null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const active = useMemo(
    () => areas.find((a) => a.key === activeKey) || areas[0] || null,
    [areas, activeKey]
  );
  const accent = active?.theme?.accent || T.accent;

  const half = Math.ceil(areas.length / 2);
  const leftAreas = areas.slice(0, half);
  const rightAreas = areas.slice(half);

  const openArea = (area) => {
    if (area.blocked) return;
    onClose();
    if (area.comingSoon) onComingSoon?.(area);
    else onNavigate(area.path);
  };
  const go = (path) => {
    onClose();
    onNavigate(path);
  };

  const renderCard = (area) => {
    const isActive = area.key === active?.key;
    const ac = area.theme?.accent || T.accent;
    const blocked = area.blocked === true;
    return (
      <button
        key={area.key}
        type="button"
        className="hh-area-card"
        onClick={() => openArea(area)}
        onMouseEnter={() => { if (area.key !== activeKey) setActiveKey(area.key); }}
        onFocus={() => { if (area.key !== activeKey) setActiveKey(area.key); }}
        aria-label={`Ver área ${area.title}`}
        style={{
          ...S.areaCard,
          borderColor: isActive ? ac : T.border,
          background: isActive ? hexToRgba(ac, 0.08) : T.surface,
          boxShadow: isActive ? `0 6px 18px ${hexToRgba(ac, 0.18)}` : T.shadow,
          opacity: blocked ? 0.6 : 1,
        }}
      >
        <span style={{ ...S.areaCardIcon, background: hexToRgba(ac, 0.12), color: ac }}>
          {area.img ? (
            <img src={area.img} alt="" style={S.areaCardImg} draggable={false} />
          ) : React.isValidElement(area.icon) ? (
            React.cloneElement(area.icon, { size: 20, strokeWidth: 2 })
          ) : (
            area.icon
          )}
        </span>
        <span style={{ ...S.areaCardTitle, color: isActive ? ac : T.text }}>{area.title}</span>
        {blocked ? (
          <Lock size={14} strokeWidth={2.2} style={{ marginLeft: "auto", color: T.textMuted, flexShrink: 0 }} />
        ) : (
          <ChevronRight size={16} strokeWidth={2.2} style={{ marginLeft: "auto", color: isActive ? ac : T.textMuted, flexShrink: 0 }} />
        )}
      </button>
    );
  };

  return (
    <div style={S.overlay} onClick={onClose} role="presentation">
      <style>{modalCSS}</style>
      <div
        className="hh-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Áreas de trabajo"
        onClick={(e) => e.stopPropagation()}
        style={{ ...S.modal, borderTop: `4px solid ${accent}` }}
      >
        {/* Header */}
        <div style={S.modalHead}>
          <div style={S.modalHeadTitle}>
            <span style={{ ...S.modalHeadIcon, background: hexToRgba(accent, 0.12), color: accent }}>
              <LayoutGrid size={18} strokeWidth={2.2} />
            </span>
            <div>
              <div style={S.modalTitle}>Áreas de trabajo</div>
              <div style={S.modalSubtitle}>Seleccioná un área para comenzar</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar modal" style={S.modalClose}>
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {areas.length === 0 ? (
          <div style={S.modalEmpty}>
            <span style={S.modalEmptyIcon}><Inbox size={28} strokeWidth={1.8} /></span>
            <div style={S.modalEmptyTitle}>No hay áreas disponibles</div>
            <div style={S.modalEmptyDesc}>Tu usuario no tiene áreas asignadas por el momento.</div>
          </div>
        ) : (
          <div className="hh-modal-body">
            <div className="hh-modal-side">{leftAreas.map(renderCard)}</div>

            <div
              className="hh-modal-center"
              style={{
                ...S.center,
                background: `linear-gradient(160deg, ${hexToRgba(accent, 0.07)} 0%, #fff 55%)`,
                borderColor: hexToRgba(accent, 0.25),
              }}
            >
              {active && (
                <div key={active.key} style={S.centerInner}>
                  <div style={S.centerHero}>
                    <span style={{ ...S.centerIcon, background: hexToRgba(accent, 0.14), color: accent }}>
                      {active.img ? (
                        <img src={active.img} alt="" style={S.centerImg} draggable={false} />
                      ) : React.isValidElement(active.icon) ? (
                        React.cloneElement(active.icon, { size: 30, strokeWidth: 1.9 })
                      ) : (
                        active.icon
                      )}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      {active.tag && (
                        <span style={{ ...S.centerTag, background: hexToRgba(accent, 0.12), color: accent }}>
                          {active.tag}
                        </span>
                      )}
                      <h3 style={S.centerTitle}>{active.title}</h3>
                    </div>
                  </div>

                  <p style={S.centerDesc}>{active.desc}</p>

                  <button
                    type="button"
                    onClick={() => openArea(active)}
                    disabled={active.blocked}
                    aria-label={`Abrir área ${active.title}`}
                    style={{
                      ...S.centerCta,
                      background: active.blocked ? T.textMuted : accent,
                      boxShadow: active.blocked ? "none" : `0 8px 20px ${hexToRgba(accent, 0.3)}`,
                      cursor: active.blocked ? "not-allowed" : "pointer",
                    }}
                  >
                    <span>{active.blocked ? "No disponible" : active.comingSoon ? "Ver detalle" : `Abrir ${active.title}`}</span>
                    {!active.blocked && <ArrowRight size={16} strokeWidth={2.4} />}
                  </button>

                  <div style={S.modulesWrap}>
                    {active.modules && active.modules.length > 0 ? (
                      active.modules.map((m, i) => (
                        <div key={m.path || m.label} style={S.modBlock}>
                          <button
                            type="button"
                            className="hh-mod-btn"
                            onClick={() => m.path && go(m.path)}
                            disabled={!m.path}
                            aria-label={`Abrir ${m.label}`}
                            style={{
                              ...S.modBtn,
                              background: hexToRgba(accent, 0.09 + (i % 3) * 0.03),
                              borderColor: hexToRgba(accent, 0.22),
                              cursor: m.path ? "pointer" : "default",
                            }}
                          >
                            <span style={{ ...S.modDot, background: accent }} />
                            <span style={S.modLabel}>{m.label}</span>
                            {m.path && <ChevronRight size={15} strokeWidth={2.2} style={{ color: accent, flexShrink: 0 }} />}
                          </button>
                          {m.features && m.features.length > 0 && (
                            <div style={S.featuresRow}>
                              {m.features.map((f) => (
                                <button
                                  key={f.path || f.label}
                                  type="button"
                                  onClick={() => f.path && go(f.path)}
                                  aria-label={`Abrir ${f.label}`}
                                  style={{ ...S.featureChip, borderColor: hexToRgba(accent, 0.28), color: accent }}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={S.modEmpty}>
                        {active.comingSoon ? "Disponible próximamente." : "Sin módulos por ahora."}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hh-modal-side">{rightAreas.map(renderCard)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CSS for the modal layout (responsive grid + animations) ─── */
const modalCSS = `
  @keyframes amFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes amPop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes amCardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes amPanelIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .hh-modal {
    width: min(1180px, 96vw);
    height: min(760px, calc(100vh - 40px));
  }
  .hh-modal-body {
    display: grid;
    grid-template-columns: minmax(190px, 230px) minmax(0, 1fr) minmax(190px, 230px);
    gap: 14px;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    padding: 14px;
  }
  .hh-modal-side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    padding: 2px;
  }
  .hh-modal-center { min-width: 0; overflow-y: auto; }
  .hh-area-card { width: 100%; }
  .hh-mod-btn:hover { filter: brightness(0.98); }

  .hh-modal-side .hh-area-card { animation: amCardIn 360ms cubic-bezier(0.22,1,0.36,1) both; }
  .hh-modal-side .hh-area-card:nth-child(1) { animation-delay: 40ms; }
  .hh-modal-side .hh-area-card:nth-child(2) { animation-delay: 90ms; }
  .hh-modal-side .hh-area-card:nth-child(3) { animation-delay: 140ms; }
  .hh-modal-side .hh-area-card:nth-child(4) { animation-delay: 190ms; }
  .hh-modal-side .hh-area-card:nth-child(5) { animation-delay: 240ms; }
  .hh-modal-side .hh-area-card:nth-child(n+6) { animation-delay: 290ms; }

  @media (max-width: 880px) {
    .hh-modal { width: 96vw; height: min(760px, calc(100vh - 24px)); }
    .hh-modal-body { grid-template-columns: 1fr; overflow-y: auto; }
    .hh-modal-side { flex-direction: row; overflow-x: auto; overflow-y: hidden; padding-bottom: 6px; flex: 0 0 auto; }
    .hh-modal-side .hh-area-card { width: auto; flex: 0 0 auto; min-width: 180px; }
    .hh-modal-center { overflow: visible; }
  }
`;

/* ─── Styles ─── */
const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.55)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    display: "grid",
    placeItems: "center",
    padding: "20px",
    zIndex: 31000,
    animation: "amFadeIn 180ms ease",
    fontFamily: T.font,
  },
  modal: {
    background: T.surface,
    borderRadius: 22,
    border: `1px solid ${T.border}`,
    boxShadow: "0 30px 80px rgba(15,23,42,0.30)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: "amPop 220ms cubic-bezier(0.22,1,0.36,1)",
  },
  modalHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "16px 18px",
    borderBottom: `1px solid ${T.borderSoft}`,
    flexShrink: 0,
  },
  modalHeadTitle: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  modalHeadIcon: { width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", flexShrink: 0 },
  modalTitle: { fontSize: 16, fontWeight: 800, color: T.text, letterSpacing: -0.3, lineHeight: 1.2 },
  modalSubtitle: { fontSize: 12.5, fontWeight: 600, color: T.textMuted, lineHeight: 1.2, marginTop: 1 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    flexShrink: 0,
    padding: 0,
  },
  modalEmpty: {
    display: "grid",
    justifyItems: "center",
    gap: 8,
    textAlign: "center",
    padding: "48px 24px",
  },
  modalEmptyIcon: { width: 52, height: 52, borderRadius: 14, background: T.surfaceAlt, display: "grid", placeItems: "center", marginBottom: 4, color: T.textMuted },
  modalEmptyTitle: { fontSize: 15, fontWeight: 800, color: T.text },
  modalEmptyDesc: { fontSize: 13, fontWeight: 500, color: T.textMuted, maxWidth: 320 },
  areaCard: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "11px 14px",
    minHeight: 60,
    borderRadius: 14,
    border: `1px solid ${T.border}`,
    background: T.surface,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
    flexShrink: 0,
  },
  areaCardIcon: { width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" },
  areaCardImg: { width: 30, height: 30, objectFit: "contain" },
  areaCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: 700,
    letterSpacing: -0.2,
    lineHeight: 1.15,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  center: {
    borderRadius: 18,
    border: `1px solid ${T.border}`,
    padding: "20px 20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    transition: "background 260ms ease, border-color 260ms ease",
  },
  centerInner: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    animation: "amPanelIn 260ms cubic-bezier(0.22,1,0.36,1)",
  },
  centerHero: { display: "flex", alignItems: "center", gap: 14 },
  centerIcon: { width: 60, height: 60, borderRadius: 16, display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" },
  centerImg: { width: 46, height: 46, objectFit: "contain" },
  centerTag: { display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: 0.2, marginBottom: 6 },
  centerTitle: { margin: 0, fontSize: 22, fontWeight: 850, color: T.text, letterSpacing: -0.5, lineHeight: 1.1 },
  centerDesc: { margin: 0, fontSize: 14, fontWeight: 500, color: T.textSecondary, lineHeight: 1.55 },
  centerCta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "fit-content",
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 800,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontFamily: "inherit",
  },
  modulesWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 10,
    marginTop: 2,
    alignItems: "start",
  },
  modBlock: { display: "flex", flexDirection: "column", gap: 6, minHeight: 48 },
  modBtn: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minHeight: 48,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid",
    fontFamily: "inherit",
    textAlign: "left",
    transition: "filter 150ms ease",
  },
  modDot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0 },
  modLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 700,
    color: T.text,
    lineHeight: 1.2,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  featuresRow: { display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 8 },
  featureChip: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid",
    background: "#fff",
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  modEmpty: { fontSize: 13, fontWeight: 500, color: T.textMuted, padding: "12px 0" },
};
