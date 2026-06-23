import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import {
  Brand,
  Container,
  EmptyState,
  GhostButton,
  Main,
  Shell,
  Topbar,
} from "../components/ui";
import { AuthCtx } from "../auth/AuthProvider";
import { auth } from "../firebase";
import { getVisibleAreas } from "../config/workAreas";
import { isEpaRestrictedUser } from "../config/epaOnlyUids";
import { ACCENT, BORDER, MUTED, SLATE, SURFACE, TEXT } from "../styles/theme";

/**
 * Centro de reportes: agrupa las pantallas de reportes/métricas del sistema por
 * área de trabajo. Se llega desde el botón "Reportes" del menú circular
 * (Ctrl/⌘ + K). Cada reporte apunta a una ruta real; el control de acceso fino
 * lo resuelve la pantalla destino. Solo se listan reportes de áreas visibles.
 */
const REPORTS = [
  { areaKey: "seguridad", title: "Reportes Seguridad", hint: "Cumplimiento y métricas", path: "/seguridad/metricas", icon: ShieldCheck },
  { areaKey: "recepcion", title: "Reportes Recepción", hint: "Descargas y tiempos", path: "/recepcion/metricas", icon: FileSpreadsheet },
  { areaKey: "mantenimiento", title: "Dashboard de OTs", hint: "Órdenes de trabajo", path: "/mantenimiento/ots/dashboard", icon: Wrench },
  { areaKey: "administracion", title: "Reporte de Horas Extra", hint: "Resumen mensual", path: "/horas-extra/reporte", icon: ClipboardList },
  { areaKey: "mrp-tarimas", title: "Dashboard MRP Tarimas", hint: "Inventario y reparaciones", path: "/mrp-tarimas/dashboard", icon: Boxes },
];

export default function ReportHubPage() {
  const nav = useNavigate();
  const { profile, epaAdmin, role, user: ctxUser } = useContext(AuthCtx) || {};
  const user = ctxUser ?? auth.currentUser;

  const groups = useMemo(() => {
    const epaOnly = isEpaRestrictedUser({ epaAdmin, profile, user });
    return getVisibleAreas({ epaOnly, role })
      .map((area) => ({
        key: area.key,
        title: area.title,
        accent: area.theme?.accent || ACCENT,
        reports: REPORTS.filter((r) => r.areaKey === area.key),
      }))
      .filter((g) => g.reports.length > 0);
  }, [profile, epaAdmin, role, user]);

  return (
    <Shell>
      <style>{`.rep-tile:hover{border-color:var(--rep-accent)!important;box-shadow:0 6px 18px rgba(15,23,42,0.08)!important}.rep-tile:hover .rep-arrow{opacity:1;transform:translateX(0)}.rep-areas{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start}.rep-list{display:grid;gap:8px}@media(max-width:860px){.rep-areas{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.rep-areas{grid-template-columns:1fr}}`}</style>
      <Topbar>
        <Brand
          icon={BarChart3}
          title="Reportes"
          subtitle="Centro de reportes"
          onClick={() => nav("/reportes")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => nav("/")}>
            Inicio
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container max={920}>
          {groups.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No hay reportes disponibles"
              description="No tenés áreas con reportes habilitados para tu usuario."
            />
          ) : (
            <div className="rep-areas">
              {groups.map((group) => (
                <section key={group.key}>
                  <div style={s.groupHead}>
                    <span style={{ ...s.dot, background: group.accent }} />
                    <span style={s.groupTitle}>{group.title}</span>
                  </div>
                  <div className="rep-list">
                    {group.reports.map((r) => {
                      const Icon = r.icon;
                      return (
                        <button
                          key={r.path}
                          type="button"
                          className="rep-tile"
                          onClick={() => nav(r.path)}
                          style={{ ...s.tile, "--rep-accent": group.accent }}
                        >
                          <span style={{ ...s.iconBox, background: `${group.accent}1A`, color: group.accent }}>
                            <Icon size={18} strokeWidth={2.1} />
                          </span>
                          <span style={s.tileText}>
                            <span style={s.tileTitle}>{r.title}</span>
                            <span style={s.tileHint}>{r.hint}</span>
                          </span>
                          <ArrowRight className="rep-arrow" size={16} strokeWidth={2.2} style={s.arrow} />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Container>
      </Main>
    </Shell>
  );
}

const s = {
  groupHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0 },
  groupTitle: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: SLATE,
  },
  tile: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "11px 13px",
    borderRadius: 13,
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  tileText: { display: "grid", gap: 1, minWidth: 0, flex: 1 },
  tileTitle: {
    fontSize: 13.5,
    fontWeight: 800,
    color: TEXT,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tileHint: {
    fontSize: 11.5,
    fontWeight: 600,
    color: MUTED,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  arrow: {
    color: SLATE,
    flexShrink: 0,
    opacity: 0,
    transform: "translateX(-3px)",
    transition: "opacity 0.15s ease, transform 0.15s ease",
  },
};
