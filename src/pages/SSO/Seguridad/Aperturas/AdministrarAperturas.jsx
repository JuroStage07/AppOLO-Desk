import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  CheckSquare,
  ClipboardList,
  Lock,
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
} from "../../../../components/ui";
import usePinnedModules from "../../../../hooks/usePinnedModules";

export default function AdministrarAperturas() {
  const nav = useNavigate();
  const { isPinned, togglePin } = usePinnedModules("salud");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "proceso",
        title: "En proceso",
        desc: "Aperturas activas actualmente.",
        path: "/seguridad/aperturas/proceso",
        icon: ClipboardList,
        tag: "Prioritario",
      },
      {
        key: "finalizadas",
        title: "Finalizadas",
        desc: "Historial de aperturas cerradas.",
        path: "/seguridad/aperturas/finalizadas",
        icon: CheckSquare,
        tag: "Historial",
      },
      {
        key: "rechazadas",
        title: "Rechazadas",
        desc: "Aperturas marcadas como rechazadas.",
        path: "/seguridad/aperturas/rechazadas",
        icon: Ban,
        tag: "Control",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ClipboardList}
          title="Aperturas"
          subtitle="Administrar"
          onClick={() => go("/seguridad/aperturas")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => go("/seguridad")}>
            Menú Salud
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Gestión"
            title="Administrar aperturas"
            subtitle="Elegí una categoría para ver la lista y gestionar el flujo."
            badge={<Badge icon={Lock}>Aperturas</Badge>}
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
