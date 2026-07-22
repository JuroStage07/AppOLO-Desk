// MRP Tarimas — Layout del módulo: contexto de trabajo + barra lateral de
// módulos; el módulo activo se renderiza en la misma página vía <Outlet/>.
//
// El almacén NO se elige a mano: se resuelve de la BODEGA activa (BodegaSwitcher
// en el Topbar) según el vínculo configurado en /dev/config-modulos/mrp-tarimas.
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  History,
  Trash2,
  Settings2,
  Warehouse,
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
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, TEXT } from "../../styles/theme";

const NAV = [
  { label: "Dashboard", to: "/mrp-tarimas/dashboard", icon: LayoutDashboard },
  { label: "Inventario", to: "/mrp-tarimas/inventario", icon: Package },
  { label: "Historial", to: "/mrp-tarimas/movimientos", icon: History },
  { label: "Descartes", to: "/mrp-tarimas/descartes", icon: Trash2 },
  { label: "Catálogos", to: "/mrp-tarimas/catalogos", icon: Settings2 },
];

const linkBase = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid transparent`,
  color: TEXT,
  fontWeight: 800,
  fontSize: 14,
  textDecoration: "none",
  cursor: "pointer",
};
const linkActive = {
  background: ACCENT_SOFT,
  border: `1px solid ${ACCENT}`,
  color: ACCENT,
};

export default function MRPTarimasPage() {
  const isMobile = useIsMobile();
  const { warehouse, warehouseId, warehouseLoading, bodegaNombre } =
    useMrpWorkspace();

  const nav = (
    <nav
      style={{
        display: isMobile ? "flex" : "grid",
        gap: 6,
        overflowX: isMobile ? "auto" : "visible",
      }}
    >
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              ...linkBase,
              whiteSpace: "nowrap",
              ...(isActive ? linkActive : {}),
            })}
          >
            <Icon size={16} strokeWidth={2.2} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );

  // Bloque informativo (solo lectura): bodega activa + almacén ligado.
  const workspaceInfo = (
    <div style={{ display: "grid", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
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
              fontSize: 13.5,
              fontWeight: 900,
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
            <span style={{ fontSize: 11, fontWeight: 700, color: SLATE }}>
              {warehouse.code}
            </span>
          ) : null}
        </div>
      </div>
      {bodegaNombre ? (
        <span style={{ fontSize: 11, fontWeight: 700, color: SLATE }}>
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
      <Topbar />
      <Main>
        <Container>
          {/* Sidebar (info de almacén + módulos) + contenido del módulo activo */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "220px 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            {isMobile ? (
              <div style={{ display: "grid", gap: 10 }}>
                {workspaceInfo}
                {nav}
              </div>
            ) : (
              <Card
                padding={10}
                style={{ position: "sticky", top: 84, display: "grid", gap: 12 }}
              >
                {workspaceInfo}
                <div style={{ height: 1, background: BORDER }} />
                {nav}
              </Card>
            )}

            <div style={{ minWidth: 0, display: "grid", gap: 16 }}>{content}</div>
          </div>
        </Container>
      </Main>
    </Shell>
  );
}
