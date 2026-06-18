import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Box,
  ClipboardList,
  Lock,
  Package,
  Wrench,
} from "lucide-react";
import {
  Badge,
  Brand,
  Container,
  GhostButton,
  Hero,
  Main,
  ModuleCard,
  ModuleGrid,
  QuickCard,
  Shell,
  Topbar,
} from "../../components/ui";
import usePinnedModules from "../../hooks/usePinnedModules";

export default function MRPTarimas() {
  const nav = useNavigate();
  const { isPinned, togglePin } = usePinnedModules("mrp-tarimas");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "dashboard",
        title: "Dashboard",
        desc: "Resumen general del inventario, reparaciones y alertas de tarimas.",
        path: "/mrp-tarimas/dashboard",
        icon: BarChart3,
        tag: "KPIs",
      },
      {
        key: "inventario",
        title: "Inventario de tarimas",
        desc: "Administración completa de tarimas: estado, ubicación y movimientos.",
        path: "/mrp-tarimas/inventario",
        icon: Package,
        tag: "Inventario",
      },
      {
        key: "reparaciones",
        title: "Reparaciones",
        desc: "Seguimiento de reparaciones activas, materiales y costos asociados.",
        path: "/mrp-tarimas/reparaciones",
        icon: Wrench,
        tag: "Reparación",
      },
      {
        key: "materiales",
        title: "Materiales",
        desc: "Control de stock de materiales para reparación con alertas de inventario bajo.",
        path: "/mrp-tarimas/materiales",
        icon: Box,
        tag: "Stock",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ClipboardList}
          title="MRP Tarimas"
          subtitle="Gestión de tarimas"
          onClick={() => go("/mrp-tarimas")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => go("/")}>
            Inicio
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="MRP Tarimas"
            subtitle="Gestión integral de tarimas dobles y sencillas: inventario, reparaciones, materiales y costos."
            badge={<Badge icon={Lock}>MRP</Badge>}
            aside={<QuickCard moduleKey="mrp-tarimas" />}
          />

          <ModuleGrid>
            {modules.map((m) => (
              <ModuleCard
                key={m.key}
                title={m.title}
                desc={m.desc}
                icon={m.icon}
                tag={m.tag}
                tone="accent"
                href={m.path}
                onClick={() => go(m.path)}
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
