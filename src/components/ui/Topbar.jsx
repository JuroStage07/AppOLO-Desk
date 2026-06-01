import React, { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  LayoutDashboard,
  Menu,
  Pin,
  Shield,
  Sparkles,
  User,
  X,
  Zap,
} from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { auth } from "../../firebase";
import { isEpaRestrictedUser } from "../../config/epaOnlyUids";
import { useAllPinnedModules } from "../../hooks/usePinnedModules";
import imgSalud from "../../assets/saludOcupacional.png";
import imgDespacho from "../../assets/despacho.png";
import imgMantenimiento from "../../assets/mantenimiento.png";
import imgRecepcion from "../../assets/recepcion.png";
import imgServiciosGenerales from "../../assets/serviciosGenerales.png";
import imgEpa from "../../assets/epa.png";
import imgDev from "../../assets/dev.png";
import PinsFlyout from "./PinsFlyout";
import SidebarAreaIcon from "./SidebarAreaIcon";
import { ACCENT, ACCENT_SOFT, BORDER, CONTAINER_MAX, SLATE, TEXT } from "../../styles/theme";

const SURFACE = "#FFFFFF";
const SURFACE_ALT = "#F1F5F9";
const BORDER_SOFT = "rgba(226, 232, 240, 0.6)";
const TEXT_SECONDARY = "#475569";
const TEXT_MUTED = "#94A3B8";
const ACCENT_GLOW = "rgba(6, 182, 160, 0.25)";
const SHADOW_LG = "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)";

/* ─── Sidebar areas data ─── */
const AREAS = [
  {
    key: "despacho", title: "Despacho", path: "/despacho", tag: "Operación",
    img: imgDespacho,
    icon: <Zap size={16} strokeWidth={2} />,
    subModules: [
      { label: "En progreso", path: "/despacho/in-progress" },
      { label: "Finalizados", path: "/despacho/finalizados" },
    ],
  },
  {
    key: "salud", title: "Salud Ocupacional", path: "/salud", tag: "Seguridad",
    img: imgSalud,
    icon: <Shield size={16} strokeWidth={2} />,
    subModules: [
      { label: "Control de marcas", path: "/salud/control-marcas" },
      { label: "Aperturas", path: "/salud/aperturas" },
      { label: "Visados", path: "/salud/visados" },
      { label: "Documentación", path: "/documentacion" },
      { label: "Métricas", path: "/salud/metricas" },
    ],
  },
  {
    key: "recepcion", title: "Recepción", path: "/recepcion", tag: "Inbound",
    img: imgRecepcion,
    icon: <ArrowRight size={16} strokeWidth={2} />,
    subModules: [
      { label: "Acción descarga", path: "/recepcion/accion-descarga" },
      { label: "Métricas", path: "/recepcion/metricas" },
    ],
  },
  {
    key: "mantenimiento", title: "Mantenimiento", path: "/mantenimiento", tag: "Mantenimiento",
    img: imgMantenimiento,
    icon: <Clock size={16} strokeWidth={2} />,
    subModules: [
      { label: "Equipos", path: "/mantenimiento/equipos" },
      { label: "Órdenes de trabajo", path: "/mantenimiento/ots" },
      { label: "Dashboard OTs", path: "/mantenimiento/ots/dashboard" },
    ],
  },
  {
    key: "servicios-generales", title: "Servicios Generales", path: "/servicios-generales", tag: "Servicios",
    img: imgServiciosGenerales,
    icon: <Sparkles size={16} strokeWidth={2} />,
    subModules: [
      { label: "Órdenes de trabajo", path: "/servicios-generales/ordenes-trabajo" },
      { label: "Validar ingreso", path: "/servicios-generales/validar-ingreso" },
      { label: "Pesaje tarimas", path: "/servicios-generales/pesaje-tarimas" },
    ],
  },
  {
    key: "epa", title: "EPA", path: "/epa", tag: "EPA",
    img: imgEpa,
    icon: <LayoutDashboard size={16} strokeWidth={2} />,
    subModules: [
      { label: "Aperturas finalizadas", path: "/epa/aperturas-finalizadas" },
    ],
  },
  {
    key: "dev", title: "Dev", path: "/dev", tag: "Desarrollo",
    img: imgDev,
    icon: <Code2 size={16} strokeWidth={2} />,
    devOnly: true,
    subModules: [
      { label: "Update AppOLO Supabase", path: "/dev/update-supabase" },
    ],
  },
];

/* ─── Sidebar Component ─── */
function Sidebar({ open, onClose }) {
  const nav = useNavigate();
  const { profile, epaAdmin, role, user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const [expandedArea, setExpandedArea] = useState(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const { pins } = useAllPinnedModules();

  const closeAll = () => { setPinsOpen(false); setExpandedArea(null); onClose(); };

  const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });

  const areas = useMemo(() => {
    if (epaOnly) {
      return AREAS.filter((a) => a.key === "epa");
    }
    return AREAS.filter((a) => !a.devOnly || role === "dev");
  }, [epaOnly, role]);

  const pinCount = epaOnly
    ? pins.filter((p) => p.moduleKey === "epa").length
    : pins.length;

  return (
    <>
      {open && (
        <div style={sb.backdrop} onClick={closeAll} aria-hidden="true" />
      )}
      <aside
        style={{ ...sb.panel, transform: open ? "translateX(0)" : "translateX(-100%)" }}
        aria-hidden={!open}
      >
        <div style={sb.header}>
          <span style={sb.title}>Áreas de trabajo</span>
          <button type="button" onClick={closeAll} style={sb.closeBtn} aria-label="Cerrar menú">
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
        <nav style={sb.nav}>
          {areas.map((a) => {
            const isExpanded = expandedArea === a.key;
            const hasSubs = a.subModules && a.subModules.length > 0;
            return (
              <div key={a.key}>
                <div style={sb.itemRow}>
                  <button
                    type="button"
                    onClick={() => { onClose(); setExpandedArea(null); nav(a.path); }}
                    style={sb.item}
                  >
                    <SidebarAreaIcon img={a.img} fallback={a.icon} />
                    <div style={sb.itemText}>
                      <span style={sb.itemTitle}>{a.title}</span>
                      <span style={sb.itemTag}>{a.tag}</span>
                    </div>
                  </button>
                  {hasSubs && (
                    <button
                      type="button"
                      onClick={() => setExpandedArea(isExpanded ? null : a.key)}
                      style={sb.expandBtn}
                      aria-label={`Expandir ${a.title}`}
                    >
                      <ChevronDown
                        size={16} strokeWidth={2}
                        style={{ transition: "transform 200ms ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                      />
                    </button>
                  )}
                </div>
                {isExpanded && hasSubs && (
                  <div style={sb.subList}>
                    {a.subModules.map((sub) => (
                      <button
                        key={sub.path}
                        type="button"
                        onClick={() => { onClose(); setExpandedArea(null); nav(sub.path); }}
                        style={sb.subItem}
                      >
                        <span style={sb.subDot} />
                        <span style={sb.subLabel}>{sub.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div style={sb.pinTabWrap}>
            <button
              type="button"
              onClick={() => setPinsOpen((v) => !v)}
              style={{ ...sb.item, ...(pinsOpen ? sb.pinTabActive : {}) }}
            >
              <div style={sb.itemIcon}>
                <Pin size={16} strokeWidth={2.2} style={{ transform: "rotate(-45deg)" }} />
              </div>
              <div style={sb.itemText}>
                <span style={sb.itemTitle}>Mis Pin</span>
                <span style={sb.itemTag}>{pinCount} fijados</span>
              </div>
              <ChevronRight
                size={16}
                strokeWidth={2}
                style={{
                  marginRight: 8,
                  color: TEXT_MUTED,
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
        onNavigate={(path) => { closeAll(); nav(path); }}
        restrictTo={epaOnly ? "epa" : undefined}
      />
    </>
  );
}

/**
 * Sticky top bar with integrated sidebar menu.
 */
export default function Topbar({ children, style, innerStyle, sticky = true }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <header style={{ ...topbar, ...(sticky ? topbarPinned : {}), ...style }}>
        <div style={{ ...topbarInner, ...innerStyle }}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            style={menuBtn}
            title="Áreas de trabajo"
            aria-label="Abrir menú de áreas"
          >
            <Menu size={20} strokeWidth={2} />
          </button>
          {children}
        </div>
      </header>
    </>
  );
}

function Right({ children, style }) {
  return <div style={{ ...topbarRight, ...style }}>{children}</div>;
}
Topbar.Right = Right;

function UserHint({ children, title, style }) {
  if (!children) return null;
  return <div style={{ ...userHintStyle, ...style }} title={title}>{children}</div>;
}
Topbar.UserHint = UserHint;

function UserBox({ name, email, icon, style }) {
  if (!name && !email) return null;
  const AvatarIcon = icon || User;
  return (
    <div style={{ ...userBox, ...style }}>
      <div style={userAvatar}>
        <AvatarIcon size={16} strokeWidth={2.2} />
      </div>
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        {name ? <div style={userName}>{name}</div> : null}
        {email ? <div style={userMail}>{email}</div> : null}
      </div>
    </div>
  );
}
Topbar.UserBox = UserBox;

/* ─── Topbar styles ─── */
const topbar = {
  width: "100%",
  boxSizing: "border-box",
  flexShrink: 0,
  borderBottom: `1px solid ${BORDER}`,
  background: "linear-gradient(180deg, #fff 0%, rgba(246,247,251,0.97) 100%)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};
/** Stays visible when an ancestor scrolls (custom shells, lockBodyScroll=false). */
const topbarPinned = { position: "sticky", top: 0, zIndex: 120 };
const topbarInner = {
  width: "100%",
  maxWidth: CONTAINER_MAX,
  marginLeft: "auto",
  marginRight: "auto",
  boxSizing: "border-box",
  padding: "12px 18px",
  minHeight: 64,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};
const topbarRight = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};
const menuBtn = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: TEXT,
  transition: "all 150ms ease",
  fontFamily: "inherit",
  padding: 0,
  flexShrink: 0,
};
const userHintStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: SLATE,
  maxWidth: 200,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const userBox = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 12px 6px 6px",
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  background: "#fff",
  boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
  maxWidth: 220,
  minWidth: 0,
};
const userAvatar = {
  width: 36,
  height: 36,
  borderRadius: 12,
  background: ACCENT_SOFT,
  color: ACCENT,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const userName = {
  fontWeight: 800, fontSize: 12, color: TEXT, lineHeight: 1.2,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const userMail = {
  fontWeight: 650, fontSize: 11, color: SLATE, lineHeight: 1.2,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

/* ─── Sidebar styles ─── */
const sb = {
  backdrop: {
    position: "fixed", inset: 0,
    background: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
    zIndex: 999,
  },
  panel: {
    position: "fixed", top: 0, left: 0, bottom: 0,
    width: 300, maxWidth: "85vw",
    background: SURFACE,
    borderRight: `1px solid ${BORDER}`,
    boxShadow: SHADOW_LG,
    zIndex: 1000,
    display: "flex", flexDirection: "column",
    transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "18px 20px",
    borderBottom: `1px solid ${BORDER}`,
    flexShrink: 0,
  },
  title: { fontSize: 15, fontWeight: 750, color: TEXT, letterSpacing: -0.2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    border: "none", background: SURFACE_ALT,
    display: "grid", placeItems: "center",
    cursor: "pointer", color: TEXT_SECONDARY,
    fontFamily: "inherit", padding: 0,
  },
  nav: {
    flex: 1, overflow: "auto", padding: "12px 12px",
    display: "flex", flexDirection: "column", gap: 4,
  },
  itemRow: { display: "flex", alignItems: "center", gap: 0 },
  item: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 14px", paddingRight: 4,
    borderRadius: 12, border: "none", background: "transparent",
    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
    width: "100%", flex: 1, transition: "background 150ms ease",
  },
  itemIcon: {
    width: 32, height: 32, borderRadius: 8,
    background: SURFACE_ALT, color: ACCENT,
    display: "grid", placeItems: "center", flexShrink: 0,
  },
  itemText: { flex: 1, display: "grid", gap: 2, minWidth: 0 },
  itemTitle: { fontSize: 13, fontWeight: 650, color: TEXT, lineHeight: 1.2 },
  itemTag: { fontSize: 11, fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.2 },
  expandBtn: {
    width: 32, height: 32, borderRadius: 8,
    border: "none", background: "transparent",
    display: "grid", placeItems: "center",
    cursor: "pointer", color: TEXT_MUTED,
    flexShrink: 0, fontFamily: "inherit", padding: 0,
  },
  subList: { paddingLeft: 56, paddingBottom: 6, display: "flex", flexDirection: "column", gap: 2 },
  subItem: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 8,
    border: "none", background: "transparent",
    cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%",
  },
  subDot: { width: 5, height: 5, borderRadius: 999, background: ACCENT, flexShrink: 0, opacity: 0.6 },
  subLabel: { fontSize: 12, fontWeight: 550, color: TEXT_SECONDARY, lineHeight: 1.2 },

  pinTabWrap: { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` },
  pinTabActive: { background: ACCENT_SOFT },
};
