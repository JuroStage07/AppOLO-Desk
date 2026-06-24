// MRP Tarimas — hub del módulo: contexto de trabajo (tenant/company + almacén)
// y grilla de submódulos. Todo el módulo opera sobre el almacén seleccionado.
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  Hero,
  Badge,
  Card,
  Field,
  ModuleGrid,
  ModuleCard,
  SectionTitle,
  Spinner,
} from "../../components/ui";
import usePinnedModules from "../../hooks/usePinnedModules";
import { useMrpWorkspace, usePalletWarehouses } from "../../hooks/mrp";

const MODULES = [
  {
    title: "Resumen",
    desc: "Totales por marca, ubicación y tipo. Incluye merma, pend y descartes.",
    icon: LayoutDashboard,
    path: "/mrp-tarimas/dashboard",
    tag: "KPIs",
  },
  {
    title: "Inventario",
    desc: "Tarimas por ubicación, marca y tipo. Ajusta y traslada.",
    icon: Package,
    path: "/mrp-tarimas/inventario",
    tag: "Inventario",
  },
  {
    title: "Historial",
    desc: "Todos los movimientos: ajustes y traslados, con filtros.",
    icon: History,
    path: "/mrp-tarimas/movimientos",
    tag: "Movimientos",
  },
  {
    title: "Descartes",
    desc: "Registro administrativo de ajustes negativos. No es inventario.",
    icon: Trash2,
    path: "/mrp-tarimas/descartes",
    tag: "Administrativo",
  },
  {
    title: "Catálogos",
    desc: "Marcas, tiendas y almacenes del módulo.",
    icon: Settings2,
    path: "/mrp-tarimas/catalogos",
    tag: "Configuración",
  },
];

export default function MRPTarimasPage() {
  const nav = useNavigate();
  const { isPinned, togglePin } = usePinnedModules("mrp-tarimas");
  const { tenantId, company, warehouseId, selectWarehouse } = useMrpWorkspace();
  const { warehouses, loading } = usePalletWarehouses();

  const modules = useMemo(() => MODULES, []);

  const onPick = (id) => {
    const wh = warehouses.find((w) => w.id === id) || null;
    selectWarehouse(
      wh ? { id: wh.id, name: wh.name, code: wh.code || null } : null
    );
  };

  return (
    <Shell>
      <Topbar />
      <Main>
        <Container>
          <Hero
            kicker="MRP Tarimas"
            title="Gestión de tarimas"
            subtitle="Selecciona el almacén de trabajo. Todo el módulo opera sobre ese almacén."
            badge={<Badge tone="accent">MRP</Badge>}
          />

          {/* Contexto de trabajo */}
          <Card>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Badge tone="neutral">Tenant: {tenantId}</Badge>
                <Badge tone="neutral">Compañía: {company}</Badge>
              </div>
              {loading ? (
                <Spinner label="Cargando almacenes…" inline />
              ) : (
                <Field
                  label="Almacén de trabajo"
                  hint={
                    !warehouseId
                      ? "Selecciona un almacén para habilitar el módulo."
                      : undefined
                  }
                >
                  <Field.Select
                    value={warehouseId || ""}
                    onChange={(e) => onPick(e.target.value)}
                  >
                    <option value="">— Seleccionar almacén —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                        {w.code ? ` (${w.code})` : ""}
                      </option>
                    ))}
                  </Field.Select>
                </Field>
              )}
              {!loading && warehouses.length === 0 && (
                <Badge tone="dark" icon={Warehouse}>
                  No hay almacenes. Crea uno en Catálogos › Almacenes.
                </Badge>
              )}
            </div>
          </Card>

          <SectionTitle title="Módulos" />
          <ModuleGrid>
            {modules.map((m) => (
              <ModuleCard
                key={m.path}
                title={m.title}
                desc={m.desc}
                icon={m.icon}
                tag={m.tag}
                tone="accent"
                onClick={() => nav(m.path)}
                pinned={isPinned(m.path)}
                onTogglePin={() => togglePin(m.title, m.path)}
              />
            ))}
          </ModuleGrid>
        </Container>
      </Main>
    </Shell>
  );
}
