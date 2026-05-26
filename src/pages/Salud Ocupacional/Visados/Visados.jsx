import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Lock, PenLine, Search } from "lucide-react";
import { auth } from "../../../firebase";
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
} from "../../../components/ui";
import usePinnedModules from "../../../hooks/usePinnedModules";

export default function Visados() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const { isPinned, togglePin } = usePinnedModules("salud");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "generar",
        title: "Generar visado",
        desc: "Crear un nuevo visado y registrarlo en el sistema.",
        path: "/salud/visado/generar",
        icon: PenLine,
        tag: "Nuevo",
      },
      {
        key: "admin",
        title: "Administrar visados",
        desc: "Buscar, filtrar y descargar visados existentes.",
        path: "/salud/visados",
        icon: Search,
        tag: "Historial",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={FileText}
          title="Salud Ocupacional"
          subtitle="Visados · Panel"
          onClick={() => go("/salud/visado")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => go("/salud")}>
            Menú Salud
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="Visados"
            subtitle="Elegí una opción para continuar. Todo queda auditado por usuario y fecha."
            badge={<Badge icon={Lock}>Operación</Badge>}
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
