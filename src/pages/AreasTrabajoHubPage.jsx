import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { AuthCtx } from "../auth/AuthProvider";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Pin,
  Search,
  Shield,
  Sparkles,
  User,
  X,
  Zap,
} from "lucide-react";
import { auth } from "../firebase";

import imgSalud from "../assets/saludOcupacional.png";
import imgDespacho from "../assets/despacho.png";
import imgMantenimiento from "../assets/mantenimiento.png";
import imgRecepcion from "../assets/recepcion.png";
import imgServiciosGenerales from "../assets/serviciosGenerales.png";
import imgEpa from "../assets/epalogo.jpeg";
import { isEpaRestrictedUser } from "../config/epaOnlyUids";
import { useAllPinnedModules } from "../hooks/usePinnedModules";
import { PinsFlyout } from "../components/ui";

/* ─── Design tokens (unified with app theme accent #089F8A) ─── */
const T = {
  accent: "#089F8A",
  accentDark: "#06776A",
  accentSoft: "rgba(8, 159, 138, 0.10)",
  accentGlow: "rgba(8, 159, 138, 0.28)",
  bg: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  border: "#E5E9F0",
  borderSoft: "rgba(226, 232, 240, 0.7)",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)",
  shadowMd: "0 4px 16px rgba(15,23,42,0.06), 0 12px 40px rgba(15,23,42,0.08)",
  shadowLg: "0 8px 24px rgba(15,23,42,0.08), 0 20px 60px rgba(15,23,42,0.12)",
  radius: 16,
  radiusSm: 12,
  radiusXs: 8,
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

export default function AreasTrabajoHubPage() {
  const nav = useNavigate();
  const { profile, epaAdmin, role, user: ctxUser } = useContext(AuthCtx);
  const user = ctxUser ?? auth.currentUser;
  const [hovered, setHovered] = useState(null);
  const [busyLogout, setBusyLogout] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedArea, setExpandedArea] = useState(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const { pins } = useAllPinnedModules();

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    const prevMargin = document.body.style.margin;

    document.body.style.overflow = "hidden";
    document.body.style.background = T.bg;
    document.body.style.margin = "0";

    requestAnimationFrame(() => setMounted(true));

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
      document.body.style.margin = prevMargin;
    };
  }, []);

  const go = (path) => nav(path);

  const logout = async () => {
    try {
      setBusyLogout(true);
      await signOut(auth);
    } finally {
      setBusyLogout(false);
    }
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const allAreas = useMemo(
    () => [
      {
        key: "despacho",
        title: "Despacho",
        desc: "Coordinación de carga, asignación de docks y seguimiento de despachos en tiempo real.",
        path: "/despacho",
        img: imgDespacho,
        tag: "Operación",
        icon: <Zap size={18} strokeWidth={2} />,
        blocked: false,
        blockedDesc: "Acceso al módulo deshabilitado temporalmente.",
        subModules: [
          { label: "En progreso", path: "/despacho/in-progress" },
          { label: "Finalizados", path: "/despacho/finalizados" },
        ],
      },
      {
        key: "salud",
        title: "Salud Ocupacional",
        desc: "Gestión de visados, control de ingreso de terceros y registros de seguridad.",
        path: "/salud",
        img: imgSalud,
        tag: "Seguridad",
        icon: <Shield size={18} strokeWidth={2} />,
        subModules: [
          { label: "Control de marcas", path: "/salud/control-marcas" },
          { label: "Historial marcas", path: "/salud/control-marcas/historial" },
          { label: "Aperturas", path: "/salud/aperturas" },
          { label: "Aperturas finalizadas", path: "/salud/aperturas/finalizadas" },
          { label: "Aperturas rechazadas", path: "/salud/aperturas/rechazadas" },
          { label: "Visados", path: "/salud/visados" },
          { label: "Generar visado", path: "/salud/visado/generar" },
          { label: "Documentación", path: "/documentacion" },
          { label: "Métricas", path: "/salud/metricas" },
        ],
      },
      {
        key: "recepcion",
        title: "Recepción",
        desc: "Registro de ingresos, validación documental y trazabilidad de mercadería.",
        path: "/recepcion",
        img: imgRecepcion,
        tag: "Inbound",
        icon: <ArrowRight size={18} strokeWidth={2} />,
        subModules: [
          { label: "Acción descarga", path: "/recepcion/accion-descarga" },
          { label: "Métricas", path: "/recepcion/metricas" },
        ],
      },
      {
        key: "mantenimiento",
        title: "Mantenimiento",
        desc: "Control de equipos, checklists preventivos y gestión de fallas correctivas.",
        path: "/mantenimiento",
        img: imgMantenimiento,
        tag: "Mantenimiento",
        icon: <Clock size={18} strokeWidth={2} />,
        subModules: [
          { label: "Equipos", path: "/mantenimiento/equipos" },
          { label: "Órdenes de trabajo", path: "/mantenimiento/ots" },
          { label: "Gestión OTs", path: "/mantenimiento/OTsPage" },
          { label: "OTs finalizadas", path: "/mantenimiento/ots/finalizadas" },
          { label: "Dashboard OTs", path: "/mantenimiento/ots/dashboard" },
        ],
      },
      {
        key: "servicios-generales",
        title: "Servicios Generales",
        desc: "Solicitudes internas, seguimiento de tareas y control de servicios de planta.",
        path: "/servicios-generales",
        img: imgServiciosGenerales,
        tag: "Servicios",
        icon: <Sparkles size={18} strokeWidth={2} />,
        subModules: [
          { label: "Órdenes de trabajo", path: "/servicios-generales/ordenes-trabajo" },
          { label: "Crear OT", path: "/servicios-generales/ordenes-trabajo/crear" },
          { label: "Gestión de OTs", path: "/servicios-generales/ordenes-trabajo/gestion" },
          { label: "Validar ingreso", path: "/servicios-generales/validar-ingreso" },
          { label: "Pesaje tarimas", path: "/servicios-generales/pesaje-tarimas" },
          { label: "Registrar tarimas", path: "/servicios-generales/pesaje-tarimas/registrar" },
          { label: "Consultar tarimas", path: "/servicios-generales/pesaje-tarimas/consultar" },
        ],
      },
      {
        key: "epa",
        title: "EPA",
        desc: "Panel exclusivo EPA: aperturas, reportes y administración centralizada.",
        path: "/epa",
        img: imgEpa,
        tag: "EPA",
        icon: <LayoutDashboard size={18} strokeWidth={2} />,
        subModules: [
          { label: "Aperturas finalizadas", path: "/epa/aperturas-finalizadas" },
        ],
        mediaStyle: {
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundColor: "#F1F5F9",
        },
        mediaOverlayStyle: {
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.12) 100%)",
        },
      },
      {
        key: "dev",
        title: "Dev",
        desc: "Herramientas internas de desarrollo: migraciones, sincronización y utilidades.",
        path: "/dev",
        img: null,
        tag: "Desarrollo",
        icon: <Code2 size={18} strokeWidth={2} />,
        devOnly: true,
        subModules: [
          { label: "Update AppOLO Supabase", path: "/dev/update-supabase" },
        ],
        mediaStyle: {
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
          backgroundImage: "none",
        },
        mediaOverlayStyle: {
          background: "none",
        },
      },
    ],
    []
  );

  const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });

  const areas = useMemo(() => {
    if (epaOnly) {
      return allAreas.filter((a) => a.key === "epa");
    }
    return allAreas.filter((a) => !a.devOnly || role === "dev");
  }, [allAreas, epaOnly, role]);

  const term = query.trim().toLowerCase();
  const filteredAreas = useMemo(() => {
    if (!term) return areas;
    return areas.filter((a) => {
      const haystack = [
        a.title,
        a.desc,
        a.tag,
        ...(a.subModules || []).map((s) => s.label),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [areas, term]);

  // Flat list of matching submodules when searching
  const filteredSubModules = useMemo(() => {
    if (!term) return [];
    const results = [];
    areas.forEach((a) => {
      if (a.blocked) return;
      (a.subModules || []).forEach((sub) => {
        if (sub.label.toLowerCase().includes(term)) {
          results.push({ ...sub, parentTitle: a.title, parentIcon: a.icon, parentKey: a.key });
        }
      });
    });
    return results;
  }, [areas, term]);

  const pinCount = epaOnly
    ? pins.filter((p) => p.moduleKey === "epa").length
    : pins.length;

  return (
    <div style={styles.shell}>
      <style>{cssAnimations}</style>

      {/* ─── Sidebar drawer ─── */}
      {sidebarOpen && (
        <div
          style={styles.sidebarBackdrop}
          onClick={() => { setPinsOpen(false); setSidebarOpen(false); }}
          aria-hidden="true"
        />
      )}
      <aside
        style={{
          ...styles.sidebar,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        }}
        aria-hidden={!sidebarOpen}
      >
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Áreas de trabajo</span>
          <button
            type="button"
            onClick={() => { setPinsOpen(false); setSidebarOpen(false); }}
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
                  {/* Main area button — navigates */}
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      if (!blocked) {
                        setSidebarOpen(false);
                        setExpandedArea(null);
                        go(a.path);
                      }
                    }}
                    style={{
                      ...styles.sidebarItem,
                      ...(blocked ? styles.sidebarItemBlocked : {}),
                      flex: 1,
                      paddingRight: hasSubs ? 4 : 14,
                    }}
                  >
                    <div style={styles.sidebarItemIcon}>{a.icon}</div>
                    <div style={styles.sidebarItemText}>
                      <span style={styles.sidebarItemTitle}>{a.title}</span>
                      <span style={styles.sidebarItemTag}>{a.tag}</span>
                    </div>
                  </button>

                  {/* Expand arrow — toggles sub-modules */}
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

                {/* Sub-modules list */}
                {isExpanded && hasSubs && (
                  <div style={styles.sidebarSubList}>
                    {a.subModules.map((sub) => (
                      <button
                        key={sub.path}
                        type="button"
                        onClick={() => {
                          setSidebarOpen(false);
                          setExpandedArea(null);
                          go(sub.path);
                        }}
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
                style={{ marginRight: 8, color: T.textMuted, transition: "transform 200ms ease", transform: pinsOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              />
            </button>
          </div>
        </nav>
      </aside>

      <PinsFlyout
        open={sidebarOpen && pinsOpen}
        onClose={() => setPinsOpen(false)}
        onNavigate={(path) => { setPinsOpen(false); setSidebarOpen(false); go(path); }}
        restrictTo={epaOnly ? "epa" : undefined}
      />

      {/* ─── Header ─── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            style={styles.menuBtn}
            title="Áreas de trabajo"
            aria-label="Abrir menú de áreas"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <div
            style={styles.brand}
            role="button"
            tabIndex={0}
            onClick={() => go("/areas")}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go("/areas")}
          >
            <div style={styles.brandIcon}>
              <LayoutDashboard size={20} strokeWidth={2.2} color="#fff" />
            </div>
            <div>
              <div style={styles.brandName}>AppoloDesk</div>
              <div style={styles.brandLabel}>Plataforma operativa</div>
            </div>
          </div>

          <div style={styles.headerActions}>
            <div style={styles.userPill}>
              <div style={styles.userPillAvatar}>
                <User size={14} strokeWidth={2.2} />
              </div>
              <span style={styles.userPillName}>
                {user?.displayName || user?.email?.split("@")[0] || "Usuario"}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              disabled={busyLogout}
              style={{
                ...styles.logoutBtn,
                ...(busyLogout ? { opacity: 0.5, cursor: "not-allowed" } : {}),
              }}
              title="Cerrar sesión"
            >
              {busyLogout ? (
                <Loader2
                  size={16}
                  strokeWidth={2.2}
                  style={{ animation: "homeSpin 0.7s linear infinite" }}
                />
              ) : (
                <LogOut size={16} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main style={styles.main}>
        <div style={styles.container}>
          {/* Hero */}
          <section
            style={{
              ...styles.hero,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
            }}
          >
            <div style={styles.heroText}>
              <div style={styles.greetingChip}>
                <span style={styles.greetingDot} />
                <span>{greeting}</span>
              </div>
              <h1 style={styles.heroTitle}>{user?.displayName || "Operador"}</h1>
              <p style={styles.heroSubtitle}>
                Elegí un área para comenzar. Tenés acceso a{" "}
                <strong style={{ color: T.accent, fontWeight: 800 }}>
                  {areas.length} {areas.length === 1 ? "área" : "áreas"}
                </strong>{" "}
                de trabajo.
              </p>
            </div>

            <div
              style={{
                ...styles.searchWrap,
                ...(searchFocus ? styles.searchWrapFocus : {}),
              }}
            >
              <Search size={17} strokeWidth={2.2} color={searchFocus ? T.accent : T.textMuted} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setSearchFocus(false)}
                placeholder="Buscar área o sección…"
                style={styles.searchInput}
                aria-label="Buscar área"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  style={styles.searchClear}
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              )}
            </div>
          </section>

          {/* Module grid */}
          <section
            style={{
              ...styles.gridSection,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(16px)",
              transitionDelay: "100ms",
            }}
          >
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Áreas de trabajo</h2>
              <span style={styles.sectionBadge}>
                {term
                  ? `${filteredAreas.length + filteredSubModules.length} ${(filteredAreas.length + filteredSubModules.length) === 1 ? "resultado" : "resultados"}`
                  : `${areas.length} disponibles`}
              </span>
            </div>

            {filteredAreas.length === 0 && filteredSubModules.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>
                  <Search size={22} strokeWidth={2} color={T.textMuted} />
                </div>
                <div style={styles.emptyTitle}>Sin resultados</div>
                <div style={styles.emptyText}>
                  No encontramos áreas ni secciones para “{query}”.
                </div>
                <button type="button" onClick={() => setQuery("")} style={styles.emptyBtn}>
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              <>
              {filteredAreas.length > 0 && (
              <div style={styles.grid}>
                {filteredAreas.map((a, idx) => {
                  const isHover = hovered === a.key;
                  const blocked = a.blocked === true;

                  return (
                    <div
                      key={a.key}
                      role={blocked ? "group" : "button"}
                      aria-disabled={blocked || undefined}
                      tabIndex={blocked ? -1 : 0}
                      onClick={() => !blocked && go(a.path)}
                      onKeyDown={(e) => {
                        if (blocked) return;
                        if (e.key === "Enter" || e.key === " ") go(a.path);
                      }}
                      onMouseEnter={() => !blocked && setHovered(a.key)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        ...styles.card,
                        ...(isHover && !blocked ? styles.cardHover : {}),
                        ...(blocked ? styles.cardBlocked : {}),
                        transitionDelay: `${idx * 40}ms`,
                        opacity: mounted ? 1 : 0,
                        transform: mounted
                          ? isHover && !blocked
                            ? "translateY(-4px)"
                            : "translateY(0)"
                          : "translateY(20px)",
                      }}
                    >
                      {/* Image area */}
                      <div
                        style={{
                          ...styles.cardMedia,
                          backgroundImage: `url(${a.img})`,
                          ...(a.mediaStyle || {}),
                          ...(isHover && !blocked && !a.mediaStyle
                            ? { backgroundSize: "112%" }
                            : {}),
                        }}
                      >
                        <div
                          style={{
                            ...styles.cardMediaOverlay,
                            ...(a.mediaOverlayStyle || {}),
                          }}
                        />
                        <div style={styles.cardMediaTop}>
                          <span style={styles.tagPill}>{a.tag}</span>
                        </div>
                        {blocked && (
                          <div style={styles.blockedOverlay}>
                            <Lock size={20} strokeWidth={2} color="#fff" />
                          </div>
                        )}
                      </div>

                      {/* Card content */}
                      <div style={styles.cardContent}>
                        <div style={styles.cardHeader}>
                          <div
                            style={{
                              ...styles.cardIconBox,
                              ...(isHover && !blocked
                                ? {
                                    background: T.accent,
                                    color: "#fff",
                                    borderColor: T.accent,
                                    boxShadow: `0 6px 16px ${T.accentGlow}`,
                                  }
                                : {}),
                            }}
                          >
                            {a.icon}
                          </div>
                          <h3 style={styles.cardTitle}>{a.title}</h3>
                        </div>

                        <p style={styles.cardDesc}>{blocked ? a.blockedDesc || a.desc : a.desc}</p>

                        <div style={styles.cardAction}>
                          {blocked ? (
                            <span style={styles.cardActionBlocked}>
                              <Lock size={13} strokeWidth={2.5} />
                              <span>No disponible</span>
                            </span>
                          ) : (
                            <span
                              style={{
                                ...styles.cardActionLink,
                                ...(isHover ? { color: T.accent } : {}),
                              }}
                            >
                              <span>Abrir módulo</span>
                              <ArrowRight
                                size={15}
                                strokeWidth={2.5}
                                style={{
                                  transition: "transform 200ms ease",
                                  transform: isHover ? "translateX(4px)" : "translateX(0)",
                                }}
                              />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}

              {/* Sub-modules matching search */}
              {term && filteredSubModules.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={styles.sectionHeader}>
                    <h3 style={{ ...styles.sectionTitle, fontSize: 15 }}>Secciones encontradas</h3>
                    <span style={styles.sectionBadge}>{filteredSubModules.length} {filteredSubModules.length === 1 ? "sección" : "secciones"}</span>
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {filteredSubModules.map((sub) => (
                      <div
                        key={sub.path}
                        role="button"
                        tabIndex={0}
                        onClick={() => go(sub.path)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") go(sub.path); }}
                        onMouseEnter={() => setHovered("sub-" + sub.path)}
                        onMouseLeave={() => setHovered(null)}
                        style={{
                          ...styles.subModuleRow,
                          ...(hovered === "sub-" + sub.path ? styles.subModuleRowHover : {}),
                        }}
                      >
                        <div style={styles.subModuleIcon}>{sub.parentIcon}</div>
                        <div style={styles.subModuleInfo}>
                          <span style={styles.subModuleLabel}>{sub.label}</span>
                          <span style={styles.subModuleParent}>{sub.parentTitle}</span>
                        </div>
                        <ArrowRight size={14} strokeWidth={2.2} color={hovered === "sub-" + sub.path ? T.accent : T.textMuted} style={{ transition: "color 150ms ease" }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/* ─── CSS Animations ─── */
const cssAnimations = `
  @keyframes homeSpin {
    to { transform: rotate(360deg); }
  }
  * { box-sizing: border-box; }
  input::placeholder { color: ${T.textMuted}; }
`;

/* ─── Styles ─── */
const styles = {
  shell: {
    minHeight: "100vh",
    height: "100vh",
    width: "100%",
    background: T.bg,
    fontFamily: T.font,
    color: T.text,
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    position: "relative",
  },

  /* Header */
  header: {
    width: "100%",
    borderBottom: `1px solid ${T.border}`,
    background: "rgba(255,255,255,0.82)",
    backdropFilter: "blur(12px) saturate(1.4)",
    WebkitBackdropFilter: "blur(12px) saturate(1.4)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    gap: 14,
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    cursor: "pointer",
    userSelect: "none",
    outline: "none",
    textDecoration: "none",
    marginLeft: 4,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: `0 4px 16px ${T.accentGlow}`,
  },
  brandName: {
    fontWeight: 800,
    fontSize: 15,
    color: T.text,
    letterSpacing: -0.3,
    lineHeight: 1.2,
  },
  brandLabel: {
    fontWeight: 600,
    fontSize: 11,
    color: T.textMuted,
    lineHeight: 1.2,
    marginTop: 1,
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  userPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px 6px 6px",
    borderRadius: 999,
    background: T.surfaceAlt,
    border: `1px solid ${T.borderSoft}`,
  },
  userPillAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: T.accentSoft,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  userPillName: {
    fontWeight: 600,
    fontSize: 13,
    color: T.text,
    maxWidth: 120,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.textSecondary,
    transition: "all 150ms ease",
    fontFamily: "inherit",
    padding: 0,
  },

  /* Menu button */
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    color: T.text,
    transition: "all 150ms ease",
    fontFamily: "inherit",
    padding: 0,
    flexShrink: 0,
  },

  /* Sidebar */
  sidebarBackdrop: {
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

  /* Main */
  main: {
    width: "100%",
    overflow: "auto",
    padding: "28px 24px 48px",
    WebkitOverflowScrolling: "touch",
  },
  container: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "grid",
    gap: 26,
  },

  /* Hero */
  hero: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 24,
    flexWrap: "wrap",
    transition: "opacity 400ms ease, transform 400ms ease",
  },
  heroText: {
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  greetingChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    color: T.accent,
    background: T.accentSoft,
    padding: "5px 12px",
    borderRadius: 999,
    width: "fit-content",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  greetingDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: T.accent,
    boxShadow: `0 0 0 3px ${T.accentSoft}`,
  },
  heroTitle: {
    margin: 0,
    fontSize: "clamp(26px, 4vw, 36px)",
    fontWeight: 850,
    color: T.text,
    letterSpacing: -0.6,
    lineHeight: 1.1,
  },
  heroSubtitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 500,
    color: T.textSecondary,
    lineHeight: 1.5,
    maxWidth: 480,
  },

  /* Search */
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    boxShadow: T.shadow,
    width: "min(320px, 100%)",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
  },
  searchWrapFocus: {
    borderColor: T.accent,
    boxShadow: `0 0 0 4px ${T.accentSoft}`,
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 14,
    fontWeight: 500,
    color: T.text,
    fontFamily: "inherit",
    minWidth: 0,
  },
  searchClear: {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "none",
    background: T.surfaceAlt,
    color: T.textSecondary,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
    fontFamily: "inherit",
  },

  /* Grid section */
  gridSection: {
    display: "grid",
    gap: 16,
    transition: "opacity 400ms ease, transform 400ms ease",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
    color: T.text,
    letterSpacing: -0.2,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: T.textMuted,
    padding: "5px 12px",
    borderRadius: 999,
    background: T.surface,
    border: `1px solid ${T.border}`,
  },

  /* Cards grid */
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 248px), 1fr))",
    gap: 16,
  },

  card: {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 18,
    overflow: "hidden",
    cursor: "pointer",
    userSelect: "none",
    transition: "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 260ms ease, border-color 200ms ease",
    boxShadow: T.shadow,
    outline: "none",
    display: "flex",
    flexDirection: "column",
  },
  cardHover: {
    borderColor: T.accent,
    boxShadow: T.shadowMd,
  },
  cardBlocked: {
    cursor: "not-allowed",
    opacity: 0.7,
    filter: "grayscale(0.3) saturate(0.7)",
  },

  /* Card media */
  cardMedia: {
    height: 118,
    backgroundSize: "cover",
    backgroundPosition: "center",
    position: "relative",
    overflow: "hidden",
    transition: "background-size 400ms ease",
  },
  cardMediaOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.48) 100%)",
  },
  cardMediaTop: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    display: "flex",
    justifyContent: "flex-start",
  },
  tagPill: {
    padding: "5px 11px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.2)",
    border: "1px solid rgba(255,255,255,0.35)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  blockedOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(15,23,42,0.4)",
    display: "grid",
    placeItems: "center",
  },

  /* Card content */
  cardContent: {
    padding: "14px 16px 16px",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    gap: 9,
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  cardIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    color: T.textSecondary,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    transition: "all 250ms ease",
  },
  cardTitle: {
    margin: 0,
    fontSize: 14.5,
    fontWeight: 800,
    color: T.text,
    letterSpacing: -0.2,
    lineHeight: 1.2,
  },
  cardDesc: {
    margin: 0,
    fontSize: 12.5,
    fontWeight: 500,
    color: T.textMuted,
    lineHeight: 1.45,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  cardAction: {
    marginTop: "auto",
    paddingTop: 10,
    borderTop: `1px solid ${T.borderSoft}`,
  },
  cardActionLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    fontWeight: 700,
    color: T.textSecondary,
    transition: "color 200ms ease",
  },
  cardActionBlocked: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12.5,
    fontWeight: 700,
    color: T.textMuted,
  },

  /* Empty state */
  emptyState: {
    display: "grid",
    justifyItems: "center",
    gap: 8,
    textAlign: "center",
    padding: "48px 24px",
    background: T.surface,
    border: `1px dashed ${T.border}`,
    borderRadius: 18,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: T.surfaceAlt,
    display: "grid",
    placeItems: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: 800, color: T.text },
  emptyText: { fontSize: 13, fontWeight: 500, color: T.textMuted, maxWidth: 320 },
  emptyBtn: {
    marginTop: 8,
    padding: "9px 18px",
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.text,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  /* Sub-module search results */
  subModuleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    cursor: "pointer",
    transition: "all 180ms ease",
    outline: "none",
  },
  subModuleRowHover: {
    borderColor: T.accent,
    boxShadow: T.shadow,
    transform: "translateX(2px)",
  },
  subModuleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: T.accentSoft,
    color: T.accent,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  subModuleInfo: {
    flex: 1,
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  subModuleLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: T.text,
    lineHeight: 1.2,
  },
  subModuleParent: {
    fontSize: 11,
    fontWeight: 500,
    color: T.textMuted,
    lineHeight: 1.2,
  },
};
