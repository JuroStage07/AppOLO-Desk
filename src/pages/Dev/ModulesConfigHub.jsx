import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Lock, SlidersHorizontal } from "lucide-react";
import { auth } from "../../firebase";
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

export default function ModulesConfigHub() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const { isPinned, togglePin } = usePinnedModules("config-modulos");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "config-horas-extra",
        title: "Configuración Horas Extras",
        desc: "Parámetros y reglas para el cálculo y aprobación de horas extra",
        path: "/dev/config-modulos/horas-extra",
        icon: Clock,
        tag: "Horas Extra",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={SlidersHorizontal}
          title="Configuración de módulos"
          subtitle="Panel de módulos"
          onClick={() => go("/dev/config-modulos")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => go("/dev")}>
            Volver
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="Módulos"
            subtitle="Configurá los parámetros de cada módulo de la plataforma."
            badge={<Badge icon={Lock}>Configuración</Badge>}
            aside={<QuickCard moduleKey="config-modulos" />}
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
