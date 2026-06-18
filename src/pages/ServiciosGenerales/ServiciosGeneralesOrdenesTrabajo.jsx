import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  LayoutGrid,
  Lock,
  Plus,
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
  Shell,
  Topbar,
} from "../../components/ui";
import usePinnedModules from "../../hooks/usePinnedModules";

export default function ServiciosGeneralesOrdenesTrabajo() {
  const nav = useNavigate();
  const { isPinned, togglePin } = usePinnedModules("servicios-generales");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "crear-ot",
        title: "Crear OT",
        desc: "Alta de nuevas órdenes de trabajo: datos del requerimiento, área y envío.",
        path: "/servicios-generales/ordenes-trabajo/crear",
        icon: Plus,
        tag: "Alta",
      },
      {
        key: "gestion-ots",
        title: "Gestión de OTs",
        desc: "Seguimiento, listados, cambios de estado y cierre de órdenes abiertas.",
        path: "/servicios-generales/ordenes-trabajo/gestion",
        icon: LayoutGrid,
        tag: "Operación",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ClipboardList}
          title="Órdenes de trabajo"
          subtitle="Servicios generales"
          onClick={() => go("/servicios-generales/ordenes-trabajo")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => go("/servicios-generales")}>
            Servicios generales
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="Módulos"
            subtitle="Elegí cómo querés trabajar: crear nuevas OT o administrar las que ya están en curso."
            badge={<Badge icon={Lock}>Órdenes de trabajo</Badge>}
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
