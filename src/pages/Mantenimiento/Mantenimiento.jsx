// pages/Mantenimiento.jsx
import React, { useContext, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, Lock, Settings, Wrench } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
import { canAccessByRoleOrPermission } from "../../config/permissions";
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
  useToast,
} from "../../components/ui";
import usePinnedModules from "../../hooks/usePinnedModules";

export default function Mantenimiento() {
  const nav = useNavigate();
  const { permisos, loading, role, profile } = useContext(AuthCtx);
  const { isPinned, togglePin } = usePinnedModules("mantenimiento");
  const toast = useToast();
  const canAccess = canAccessByRoleOrPermission(
    { role, permisos, profile },
    { anyPerms: ["mantenimiento"] }
  );

  useEffect(() => {
    if (loading) return;
    if (!canAccess) {
      toast.error("Este usuario no puede acceder por falta de permisos.");
      nav(-1);
    }
  }, [loading, canAccess, nav, toast]);

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "equipos",
        title: "Panel de equipos",
        desc: "Estado, fallas, revisión diaria y control.",
        path: "/mantenimiento/equipos",
        icon: Settings,
        tag: "Equipos",
      },
      {
        key: "ots",
        title: "Órdenes de trabajo",
        desc: "Solicitudes, seguimiento y cierre de OT.",
        path: "/mantenimiento/ots",
        icon: ClipboardList,
        tag: "OT",
      },
    ],
    []
  );

  if (!canAccess) return null;

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Wrench}
          title="Mantenimiento"
          subtitle="Panel de módulos"
          onClick={() => go("/mantenimiento")}
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
            subtitle="Accedé al panel de equipos o a las órdenes de trabajo según tu rol."
            badge={<Badge icon={Lock}>Mantenimiento</Badge>}
            aside={<QuickCard moduleKey="mantenimiento" />}
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
