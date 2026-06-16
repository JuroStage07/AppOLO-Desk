import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Pin, X } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth } from "../../firebase";
import { isEpaRestrictedUser } from "../../config/epaOnlyUids";
import { getVisibleAreas } from "../../config/workAreas";
import { useAllPinnedModules } from "../../hooks/usePinnedModules";
import PinsFlyout from "./PinsFlyout";
import { onOpenPins } from "./pinsBus";
import SidebarAreaIcon from "./SidebarAreaIcon";
import { useToast } from "./Toast";

/* ─── Local design tokens (mirror AreasTrabajoHubPage drawer) ─── */
const T = {
  accent: "#089F8A",
  accentSoft: "rgba(8, 159, 138, 0.10)",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  border: "#E5E9F0",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  shadowLg: "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)",
};

/**
 * Global "Áreas de trabajo" drawer, shared by every page through <Topbar/>.
 * Reads its data from src/config/workAreas so it always matches the hub.
 *
 * Props:
 *  - open: whether the drawer is visible
 *  - onClose: close the drawer
 */
export default function AreasSidebar({ open, onClose, openPins = false }) {
  const nav = useNavigate();
  const toast = useToast();
  const { profile, epaAdmin, role, user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const [expandedArea, setExpandedArea] = useState(null);
  const [expandedModules, setExpandedModules] = useState(() => new Set());
  const [pinsOpen, setPinsOpen] = useState(false);
  const [forcedOpen, setForcedOpen] = useState(false);
  const { pins } = useAllPinnedModules();

  // Open directly on the "Mis Pin" section when requested by the opener.
  useEffect(() => {
    if (open && openPins) setPinsOpen(true);
  }, [open, openPins]);

  // Listen to global pinsBus (F2 shortcut) — force-open this sidebar with pins.
  useEffect(() => {
    return onOpenPins(() => {
      setForcedOpen(true);
      setPinsOpen(true);
    });
  }, []);

  // Derive effective open: either parent says open, or forced by shortcut.
  const effectiveOpen = open || forcedOpen;

  const closeAll = () => {
    setPinsOpen(false);
    setForcedOpen(false);
    setExpandedArea(null);
    setExpandedModules(new Set());
    onClose();
  };

  const toggleArea = (key) => {
    setExpandedModules(new Set());
    setExpandedArea((cur) => (cur === key ? null : key));
  };

  const toggleModule = (key) => {
    setExpandedModules((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });
  const areas = useMemo(
    () => getVisibleAreas({ epaOnly, role }),
    [epaOnly, role]
  );

  const goTo = (path) => {
    closeAll();
    nav(path);
  };

  const pinCount = epaOnly
    ? pins.filter((p) => p.moduleKey === "epa").length
    : pins.length;

  return (
    <>
      {effectiveOpen && (
        <div style={styles.backdrop} onClick={closeAll} aria-hidden="true" />
      )}
      <aside
        style={{
          ...styles.sidebar,
          transform: effectiveOpen ? "translateX(0)" : "translateX(-100%)",
        }}
        aria-hidden={!effectiveOpen}
      >
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Áreas de trabajo</span>
          <button
            type="button"
            onClick={closeAll}
            style={styles.sidebarClose}
            aria-label="Cerrar menú"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
        <nav style={styles.sidebarNav}>
          {areas.map((a) => {
            const blocked = a.blocked === true;
            const isExpanded = expandedArea === a.key;
            const modules = a.modules || [];
            const hasModules = modules.length > 0;

            return (
              <div key={a.key}>
                {/* Level 0 — Área */}
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      if (blocked) return;
                      if (a.comingSoon) {
                        toast.info(
                          a.comingSoonMsg ||
                            `${a.title} estará disponible próximamente.`
                        );
                        closeAll();
                        return;
                      }
                      goTo(a.path);
                    }}
                    style={{
                      ...styles.sidebarItem,
                      ...(blocked ? styles.sidebarItemBlocked : {}),
                      flex: 1,
                      paddingRight: hasModules ? 4 : 14,
                    }}
                  >
                    <SidebarAreaIcon img={a.img} fallback={a.icon} />
                    <div style={styles.sidebarItemText}>
                      <span style={styles.sidebarItemTitle}>{a.title}</span>
                      <span style={styles.sidebarItemTag}>{a.tag}</span>
                    </div>
                  </button>

                  {hasModules && !blocked && (
                    <button
                      type="button"
                      onClick={() => toggleArea(a.key)}
                      style={styles.sidebarExpandBtn}
                      aria-label={`Expandir ${a.title}`}
                      aria-expanded={isExpanded}
                    >
                      <ChevronDown
                        size={16}
                        strokeWidth={2}
                        style={{
                          transition: "transform 200ms ease",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      />
                    </button>
                  )}

                  {(!hasModules || blocked) && (
                    <div style={{ width: 32, flexShrink: 0 }} />
                  )}
                </div>

                {/* Level 1 — Módulos */}
                {isExpanded && hasModules && (
                  <div style={styles.sidebarModuleList}>
                    {modules.map((m) => {
                      const feats = m.features || [];
                      const hasFeats = feats.length > 0;
                      const modKey = `${a.key}::${m.path}`;
                      const modExpanded = expandedModules.has(modKey);

                      return (
                        <div key={m.path}>
                          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                            <button
                              type="button"
                              onClick={() => goTo(m.path)}
                              style={{
                                ...styles.sidebarModuleItem,
                                flex: 1,
                                paddingRight: hasFeats ? 4 : 12,
                              }}
                            >
                              <span style={styles.sidebarModuleDot} />
                              <span style={styles.sidebarModuleLabel}>{m.label}</span>
                            </button>

                            {hasFeats && (
                              <button
                                type="button"
                                onClick={() => toggleModule(modKey)}
                                style={styles.sidebarExpandBtnSm}
                                aria-label={`Expandir ${m.label}`}
                                aria-expanded={modExpanded}
                              >
                                <ChevronDown
                                  size={14}
                                  strokeWidth={2}
                                  style={{
                                    transition: "transform 200ms ease",
                                    transform: modExpanded
                                      ? "rotate(180deg)"
                                      : "rotate(0deg)",
                                  }}
                                />
                              </button>
                            )}

                            {!hasFeats && <div style={{ width: 28, flexShrink: 0 }} />}
                          </div>

                          {/* Level 2 — Features */}
                          {modExpanded && hasFeats && (
                            <div style={styles.sidebarFeatureList}>
                              {feats.map((f) => (
                                <button
                                  key={f.path}
                                  type="button"
                                  onClick={() => goTo(f.path)}
                                  style={styles.sidebarFeatureItem}
                                >
                                  <span style={styles.sidebarFeatureDash} />
                                  <span style={styles.sidebarFeatureLabel}>
                                    {f.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div style={styles.sidebarPinTab}>
            <button
              type="button"
              onClick={() => setPinsOpen((v) => !v)}
              style={{ ...styles.sidebarItem, ...(pinsOpen ? { background: T.accentSoft } : {}) }}
            >
              <div style={styles.sidebarItemIcon}>
                <Pin size={16} strokeWidth={2.2} style={{ transform: "rotate(-45deg)" }} />
              </div>
              <div style={styles.sidebarItemText}>
                <span style={styles.sidebarItemTitle}>Mis Pin</span>
                <span style={styles.sidebarItemTag}>{pinCount} fijados</span>
              </div>
              <ChevronRight
                size={16}
                strokeWidth={2}
                style={{
                  marginRight: 8,
                  color: T.textMuted,
                  transition: "transform 200ms ease",
                  transform: pinsOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
              />
            </button>
          </div>
        </nav>
      </aside>

      <PinsFlyout
        open={effectiveOpen && pinsOpen}
        onClose={() => setPinsOpen(false)}
        onNavigate={(path) => goTo(path)}
        restrictTo={epaOnly ? "epa" : undefined}
      />
    </>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    zIndex: 999,
    transition: "opacity 250ms ease",
  },
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 300,
    maxWidth: "85vw",
    background: T.surface,
    borderRight: `1px solid ${T.border}`,
    boxShadow: T.shadowLg,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
    overflow: "hidden",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px",
    borderBottom: `1px solid ${T.border}`,
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 15,
    fontWeight: 750,
    color: T.text,
    letterSpacing: -0.2,
  },
  sidebarClose: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    background: T.surfaceAlt,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    transition: "all 150ms ease",
    fontFamily: "inherit",
    padding: 0,
  },
  sidebarNav: {
    flex: 1,
    overflow: "auto",
    padding: "12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  sidebarItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    width: "100%",
    transition: "background 150ms ease",
  },
  sidebarItemBlocked: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  sidebarItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: T.surfaceAlt,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  sidebarItemText: {
    flex: 1,
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  sidebarItemTitle: {
    fontSize: 13,
    fontWeight: 650,
    color: T.text,
    lineHeight: 1.2,
  },
  sidebarItemTag: {
    fontSize: 11,
    fontWeight: 500,
    color: T.textMuted,
    lineHeight: 1.2,
  },
  sidebarExpandBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textMuted,
    flexShrink: 0,
    transition: "background 150ms ease",
    fontFamily: "inherit",
    padding: 0,
  },
  sidebarSubList: {
    paddingLeft: 56,
    paddingBottom: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  sidebarSubItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    width: "100%",
    transition: "background 150ms ease",
  },
  sidebarSubDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    background: T.accent,
    flexShrink: 0,
    opacity: 0.6,
  },
  sidebarSubLabel: {
    fontSize: 12,
    fontWeight: 550,
    color: T.textSecondary,
    lineHeight: 1.2,
  },

  /* Level 1 — Módulos */
  sidebarModuleList: {
    paddingLeft: 20,
    paddingBottom: 4,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  sidebarModuleItem: {
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
    transition: "background 150ms ease",
  },
  sidebarModuleDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: T.accent,
    flexShrink: 0,
  },
  sidebarModuleLabel: {
    fontSize: 12.5,
    fontWeight: 650,
    color: T.text,
    lineHeight: 1.2,
  },
  sidebarExpandBtnSm: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textMuted,
    flexShrink: 0,
    transition: "background 150ms ease",
    fontFamily: "inherit",
    padding: 0,
  },

  /* Level 2 — Features */
  sidebarFeatureList: {
    paddingLeft: 26,
    paddingTop: 1,
    paddingBottom: 4,
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  sidebarFeatureItem: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "7px 12px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    width: "100%",
    transition: "background 150ms ease",
  },
  sidebarFeatureDash: {
    width: 8,
    height: 2,
    borderRadius: 2,
    background: T.textMuted,
    flexShrink: 0,
    opacity: 0.7,
  },
  sidebarFeatureLabel: {
    fontSize: 11.5,
    fontWeight: 550,
    color: T.textSecondary,
    lineHeight: 1.2,
  },
  sidebarPinTab: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid ${T.border}`,
  },
};
