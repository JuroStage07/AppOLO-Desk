import React, { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Pin, X } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth } from "../../firebase";
import { isEpaRestrictedUser } from "../../config/epaOnlyUids";
import { getVisibleAreas } from "../../config/workAreas";
import { useAllPinnedModules } from "../../hooks/usePinnedModules";
import PinsFlyout from "./PinsFlyout";
import SidebarAreaIcon from "./SidebarAreaIcon";

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
export default function AreasSidebar({ open, onClose }) {
  const nav = useNavigate();
  const { profile, epaAdmin, role, user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const [expandedArea, setExpandedArea] = useState(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const { pins } = useAllPinnedModules();

  const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });
  const areas = useMemo(
    () => getVisibleAreas({ epaOnly, role }),
    [epaOnly, role]
  );

  const closeAll = () => {
    setPinsOpen(false);
    setExpandedArea(null);
    onClose();
  };

  const goTo = (path) => {
    closeAll();
    nav(path);
  };

  const pinCount = epaOnly
    ? pins.filter((p) => p.moduleKey === "epa").length
    : pins.length;

  return (
    <>
      {open && (
        <div style={styles.backdrop} onClick={closeAll} aria-hidden="true" />
      )}
      <aside
        style={{
          ...styles.sidebar,
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
        aria-hidden={!open}
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
            const hasSubs = a.subModules && a.subModules.length > 0;

            return (
              <div key={a.key}>
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      if (!blocked) goTo(a.path);
                    }}
                    style={{
                      ...styles.sidebarItem,
                      ...(blocked ? styles.sidebarItemBlocked : {}),
                      flex: 1,
                      paddingRight: hasSubs ? 4 : 14,
                    }}
                  >
                    <SidebarAreaIcon img={a.img} fallback={a.icon} />
                    <div style={styles.sidebarItemText}>
                      <span style={styles.sidebarItemTitle}>{a.title}</span>
                      <span style={styles.sidebarItemTag}>{a.tag}</span>
                    </div>
                  </button>

                  {hasSubs && !blocked && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedArea(isExpanded ? null : a.key)
                      }
                      style={styles.sidebarExpandBtn}
                      aria-label={`Expandir ${a.title}`}
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

                  {!hasSubs && !blocked && (
                    <div style={{ width: 32, flexShrink: 0 }} />
                  )}
                </div>

                {isExpanded && hasSubs && (
                  <div style={styles.sidebarSubList}>
                    {a.subModules.map((sub) => (
                      <button
                        key={sub.path}
                        type="button"
                        onClick={() => goTo(sub.path)}
                        style={styles.sidebarSubItem}
                      >
                        <span style={styles.sidebarSubDot} />
                        <span style={styles.sidebarSubLabel}>{sub.label}</span>
                      </button>
                    ))}
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
        open={open && pinsOpen}
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
  sidebarPinTab: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid ${T.border}`,
  },
};
