// MRP Tarimas — Layout del módulo: contexto de trabajo + barra lateral de
// módulos; el módulo activo se renderiza en la misma página vía <Outlet/>.
//
// El almacén NO se elige a mano: se resuelve de la BODEGA activa (BodegaSwitcher
// en el Topbar) según el vínculo configurado en /dev/config-modulos/mrp-tarimas.
import React, { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  History,
  Trash2,
  Settings2,
  Warehouse,
  Plus,
  Minus,
} from "lucide-react";
import {
  Shell,
  Topbar,
  Main,
  Container,
  Card,
  Spinner,
} from "../../components/ui";
import { useMrpWorkspace } from "../../hooks/mrp";
import useIsMobile from "../../hooks/useIsMobile";
import { NoWarehouse } from "./components/WorkspaceBar";
import {
  ACCENT,
  ACCENT_SOFT,
  BORDER,
  SLATE,
  TEXT,
  SURFACE_INSET,
  withAlpha,
  FS_XS,
  FS_SM,
  FS_BASE,
  FW_BOLD,
  FW_EXTRABOLD,
} from "../../styles/theme";

const NAV = [
  { label: "Dashboard", to: "/mrp-tarimas/dashboard", icon: LayoutDashboard },
  {
    label: "Catálogos",
    to: "/mrp-tarimas/catalogos",
    icon: Settings2,
    // Sub-opciones (catálogos) que se despliegan bajo "Catálogos" en el submenú.
    children: [
      { label: "Artículos", to: "/mrp-tarimas/catalogos/articulos" },
      { label: "Compañías", to: "/mrp-tarimas/catalogos/companias" },
      { label: "Clientes", to: "/mrp-tarimas/catalogos/clientes" },
      { label: "Insumos", to: "/mrp-tarimas/catalogos/insumos" },
      { label: "BOM", to: "/mrp-tarimas/catalogos/bom" },
      { label: "Almacenes", to: "/mrp-tarimas/catalogos/almacenes" },
    ],
  },
  {
    label: "Inventario",
    to: "/mrp-tarimas/inventario",
    icon: Package,
    children: [
      { label: "Artículos", to: "/mrp-tarimas/inventario/articulos" },
      { label: "Insumos", to: "/mrp-tarimas/inventario/insumos" },
      { label: "En Cliente / Tienda", to: "/mrp-tarimas/inventario/tiendas" },
    ],
  },
  {
    label: "Historial",
    to: "/mrp-tarimas/movimientos",
    icon: History,
    children: [
      { label: "Historial de movimientos", to: "/mrp-tarimas/movimientos" },
      { label: "Registro de eventos", to: "/mrp-tarimas/eventos" },
      { label: "Registro de insumos", to: "/mrp-tarimas/insumos-registro" },
    ],
  },
  { label: "Descartes", to: "/mrp-tarimas/descartes", icon: Trash2 },
];

const linkBase = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid transparent`,
  color: TEXT,
  fontWeight: FW_EXTRABOLD,
  fontSize: FS_BASE,
  textDecoration: "none",
  cursor: "pointer",
};
const linkActive = {
  background: ACCENT_SOFT,
  border: `1px solid ${ACCENT}`,
  color: ACCENT,
};
const subLinkBase = {
  display: "flex",
  alignItems: "center",
  padding: "7px 10px",
  borderRadius: 10,
  color: SLATE,
  fontWeight: FW_BOLD,
  fontSize: FS_SM,
  textDecoration: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const subLinkActive = { background: ACCENT_SOFT, color: ACCENT };

export default function MRPTarimasPage() {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const { warehouse, warehouseId, warehouseLoading, bodegaNombre } =
    useMrpWorkspace();

  // Acordeón: una sola sección abierta a la vez. `openKey` undefined ⇒ sigue la
  // sección activa; al hacer clic se fija (o se cierra) manualmente.
  const [openKey, setOpenKey] = useState(undefined);
  const activeParent =
    (
      NAV.find(
        (it) =>
          it.children &&
          (pathname.startsWith(it.to) ||
            it.children.some((c) => pathname.startsWith(c.to)))
      ) || {}
    ).to || null;
  const effectiveOpen = openKey === undefined ? activeParent : openKey;

  const nav = (
    <nav
      style={{
        display: isMobile ? "flex" : "grid",
        gap: isMobile ? 8 : 4,
        overflowX: isMobile ? "auto" : "visible",
      }}
    >
      {NAV.map((item) => {
        const Icon = item.icon;
        // La sección está activa si la ruta actual cuelga de la ruta del ítem o
        // de cualquiera de sus hijos (p.ej. Historial, cuyos hijos son rutas
        // hermanas sin prefijo común).
        const sectionActive =
          pathname.startsWith(item.to) ||
          (item.children || []).some((c) => pathname.startsWith(c.to));
        const hasChildren = !!item.children && !isMobile;
        const isOpen = hasChildren && effectiveOpen === item.to;

        return (
          <div key={item.to} style={{ display: "grid", gap: 4 }}>
            {/* El propio botón de la pestaña navega Y despliega las opciones; el
                indicador +/- va dentro, al extremo derecho. */}
            <NavLink
              to={item.to}
              className="mrp-nav-link"
              onClick={() => {
                // Abre solo esta sección (cierra las demás); si ya está abierta,
                // la cierra.
                if (hasChildren) setOpenKey(isOpen ? null : item.to);
              }}
              aria-expanded={hasChildren ? isOpen : undefined}
              style={({ isActive }) => ({
                ...linkBase,
                whiteSpace: "nowrap",
                ...(isActive || sectionActive ? linkActive : {}),
              })}
            >
              <Icon size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.label}
              </span>
              {hasChildren ? (
                isOpen ? (
                  <Minus size={15} strokeWidth={2.6} style={{ flexShrink: 0 }} />
                ) : (
                  <Plus size={15} strokeWidth={2.6} style={{ flexShrink: 0 }} />
                )
              ) : null}
            </NavLink>

            {hasChildren && isOpen ? (
              <div
                style={{
                  display: "grid",
                  gap: 2,
                  marginLeft: 12,
                  paddingLeft: 10,
                  borderLeft: `1px solid ${BORDER}`,
                }}
              >
                {item.children.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    className="mrp-sub-link"
                    style={({ isActive }) => ({
                      ...subLinkBase,
                      ...(isActive ? subLinkActive : {}),
                    })}
                  >
                    {c.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  // Bloque informativo (solo lectura): bodega activa + almacén ligado.
  const workspaceInfo = (
    <div style={{ display: "grid", gap: 6 }}>
      <span
        style={{
          fontSize: FS_XS,
          fontWeight: FW_EXTRABOLD,
          color: SLATE,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        Almacén de trabajo
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 11px",
          borderRadius: 12,
          border: `1px solid ${ACCENT}`,
          background: ACCENT_SOFT,
        }}
      >
        <Warehouse size={16} strokeWidth={2.3} style={{ color: ACCENT, flexShrink: 0 }} />
        <div style={{ display: "grid", minWidth: 0 }}>
          <span
            style={{
              fontSize: FS_BASE,
              fontWeight: FW_EXTRABOLD,
              color: TEXT,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {warehouseLoading
              ? "Resolviendo…"
              : warehouse?.name || "— sin ligar —"}
          </span>
          {warehouse?.code ? (
            <span style={{ fontSize: FS_XS, fontWeight: FW_BOLD, color: SLATE }}>
              {warehouse.code}
            </span>
          ) : null}
        </div>
      </div>
      {bodegaNombre ? (
        <span style={{ fontSize: FS_XS, fontWeight: FW_BOLD, color: SLATE }}>
          Bodega: {bodegaNombre}
        </span>
      ) : null}
    </div>
  );

  const content = warehouseLoading ? (
    <Card>
      <Spinner label="Resolviendo almacén de la bodega…" />
    </Card>
  ) : warehouseId ? (
    <Outlet />
  ) : (
    <NoWarehouse />
  );

  return (
    <Shell>
      <style>{`
        .mrp-side-scroll { scrollbar-width: thin; scrollbar-color: ${withAlpha(SLATE, 0.45)} transparent; }
        .mrp-side-scroll::-webkit-scrollbar { width: 7px; }
        .mrp-side-scroll::-webkit-scrollbar-thumb { background: ${withAlpha(SLATE, 0.45)}; border-radius: 999px; }
        .mrp-side-scroll::-webkit-scrollbar-track { background: transparent; }
        .mrp-nav-link:hover { background: ${SURFACE_INSET}; }
        .mrp-sub-link:hover { background: ${SURFACE_INSET}; color: ${TEXT}; }
      `}</style>

      <Topbar />
      <Main
        style={
          isMobile
            ? undefined
            : { overflow: "hidden", display: "flex", flexDirection: "column" }
        }
      >
        <Container
          style={
            isMobile
              ? undefined
              : { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
          }
        >
          {/* Sidebar (info de almacén + módulos) + contenido del módulo activo.
              En escritorio, el layout ocupa el alto visible: la barra lateral
              queda fija y SOLO el panel de contenido hace scroll (la página no).
              Se usa flex (flex:1 + minHeight:0) para una altura definida y fiable. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "232px 1fr",
              gap: 16,
              alignItems: isMobile ? "start" : "stretch",
              ...(isMobile ? {} : { flex: 1, minHeight: 0, overflow: "hidden" }),
            }}
          >
            {isMobile ? (
              <div style={{ display: "grid", gap: 10 }}>
                {workspaceInfo}
                {nav}
              </div>
            ) : (
              // Barra lateral fija: ocupa el alto del panel y hace scroll interno
              // (no genera scroll de página). La info del almacén queda fija
              // arriba y solo la lista de módulos se desplaza.
              <div style={{ height: "100%", minHeight: 0 }}>
                <Card
                  padding={0}
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: 12 }}>{workspaceInfo}</div>
                  <div style={{ height: 1, background: BORDER, flexShrink: 0 }} />
                  <div
                    className="mrp-side-scroll"
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      padding: 12,
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontSize: FS_XS,
                        fontWeight: FW_EXTRABOLD,
                        color: SLATE,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        marginBottom: 8,
                      }}
                    >
                      Módulos
                    </span>
                    {nav}
                  </div>
                </Card>
              </div>
            )}

            {/* Panel de contenido: contenedor de scroll a nivel de bloque (el
                scrollHeight incluye todo el contenido con fiabilidad) con una
                rejilla interna solo para el espaciado entre secciones. */}
            <div
              className={isMobile ? undefined : "mrp-side-scroll"}
              style={{
                minWidth: 0,
                ...(isMobile
                  ? {}
                  : {
                      height: "100%",
                      minHeight: 0,
                      overflowY: "auto",
                      paddingRight: 4,
                    }),
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: 16,
                  alignContent: "start",
                  paddingBottom: isMobile ? 0 : 24,
                }}
              >
                {content}
              </div>
            </div>
          </div>
        </Container>
      </Main>
    </Shell>
  );
}
