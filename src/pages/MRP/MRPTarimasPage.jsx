// MRP Tarimas — Layout del módulo: contexto de trabajo + barra lateral de
// módulos; el módulo activo se renderiza en la misma página vía <Outlet/>.
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  History,
  Trash2,
  Settings2,
} from "lucide-react";
import {
  Shell,
  Topbar,
  Main,
  Container,
  Card,
  Field,
  Spinner,
} from "../../components/ui";
import { useMrpWorkspace, usePalletWarehouses } from "../../hooks/mrp";
import useIsMobile from "../../hooks/useIsMobile";
import { NoWarehouse } from "./components/WorkspaceBar";
import { ACCENT, ACCENT_SOFT, BORDER, SLATE, TEXT } from "../../styles/theme";

const NAV = [
  { label: "Resumen", to: "/mrp-tarimas/dashboard", icon: LayoutDashboard },
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
  const { warehouseId, selectWarehouse } = useMrpWorkspace();
  const { warehouses, loading } = usePalletWarehouses();

  const onPick = (id) => {
    const wh = warehouses.find((w) => w.id === id) || null;
    selectWarehouse(
      wh ? { id: wh.id, name: wh.name, code: wh.code || null } : null
    );
  };

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

  const warehousePicker = (
    <div style={{ display: "grid", gap: 4 }}>
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
      {loading ? (
        <Spinner inline />
      ) : (
        <Field.Select
          value={warehouseId || ""}
          onChange={(e) => onPick(e.target.value)}
          style={{
            padding: "8px 10px",
            fontWeight: 900,
            borderColor: ACCENT,
            background: ACCENT_SOFT,
          }}
        >
          <option value="">— Seleccionar —</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.code ? ` (${w.code})` : ""}
            </option>
          ))}
        </Field.Select>
      )}
      {!loading && warehouses.length === 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, color: SLATE }}>
          Crea un almacén en Catálogos › Almacenes.
        </span>
      )}
    </div>
  );

  return (
    <Shell>
      <Topbar />
      <Main>
        <Container>
          {/* Sidebar (almacén + módulos) + contenido del módulo activo */}
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
                {warehousePicker}
                {nav}
              </div>
            ) : (
              <Card
                padding={10}
                style={{ position: "sticky", top: 84, display: "grid", gap: 12 }}
              >
                {warehousePicker}
                <div style={{ height: 1, background: BORDER }} />
                {nav}
              </Card>
            )}

            <div style={{ minWidth: 0, display: "grid", gap: 16 }}>
              {warehouseId ? <Outlet /> : <NoWarehouse />}
            </div>
          </div>
        </Container>
      </Main>
    </Shell>
  );
}
