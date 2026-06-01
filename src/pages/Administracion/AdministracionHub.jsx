import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Lock, ShieldCheck, Users } from "lucide-react";
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

export default function AdministracionHub() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const { isPinned, togglePin } = usePinnedModules("administracion");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "usuarios",
        title: "Usuarios",
        desc: "Gestión de usuarios, roles y permisos de la plataforma",
        path: "/administracion/usuarios",
        icon: Users,
        tag: "Prioritario",
      },
      {
        key: "horas-extra",
        title: "Horas Extra",
        desc: "Revisión y aprobación de horas extra del personal",
        path: "/horas-extra",
        icon: Clock,
        tag: "Aprobaciones",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ShieldCheck}
          title="Administración"
          subtitle="Panel de módulos"
          onClick={() => go("/administracion")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
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
            subtitle="Seleccioná un módulo para ingresar. Las acciones quedan asociadas a tu usuario."
            badge={<Badge icon={Lock}>Administración</Badge>}
            aside={<QuickCard moduleKey="administracion" />}
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
