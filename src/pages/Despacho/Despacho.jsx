import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Lock, Package, Truck } from "lucide-react";
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

export default function Despacho() {
  const nav = useNavigate();
  const { isPinned, togglePin } = usePinnedModules("despacho");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "in-progress",
        title: "Despachos en progreso",
        desc: "Vista en tiempo real de despachos abiertos, ocupación de espacios y avance de carga.",
        path: "/despacho/in-progress",
        icon: Package,
        tag: "Operación",
      },
      {
        key: "finalized",
        title: "Despachos finalizados",
        desc: "Historial de despachos cerrados o completados para consulta y seguimiento.",
        path: "/despacho/finalizados",
        icon: CheckCircle2,
        tag: "Historial",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Truck}
          title="Despacho"
          subtitle="Panel de módulos"
          onClick={() => go("/despacho")}
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
            title="Módulos"
            subtitle="Accedé a despachos activos o al historial de cierres según tu tarea operativa."
            badge={<Badge icon={Lock}>Operación</Badge>}
            aside={<QuickCard moduleKey="despacho" />}
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
