import React, { useContext, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Lock,
  CheckSquare,
  Wrench,
} from "lucide-react";
import { AuthCtx } from "../../../auth/AuthProvider";
import { canAccessByRoleOrPermission } from "../../../config/permissions";
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
  useToast,
} from "../../../components/ui";
import usePinnedModules from "../../../hooks/usePinnedModules";

export default function OTsHubMantenimiento() {
  const nav = useNavigate();
  const toast = useToast();
  const { permisos, loading, role, profile } = useContext(AuthCtx);
  const { isPinned, togglePin } = usePinnedModules("mantenimiento");
  const canAccess = canAccessByRoleOrPermission(
    { role, permisos, profile },
    { anyPerms: ["mantenimiento"] }
  );

  useEffect(() => {
    if (loading) return;
    if (!canAccess) {
      toast.error("No tenés permisos para acceder a este módulo.");
      nav(-1);
    }
  }, [loading, canAccess, nav, toast]);

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "dashboard",
        title: "Dashboard OTs",
        desc: "Métricas por período: volumen, estados, líderes y días de baja demanda.",
        path: "/mantenimiento/ots/dashboard",
        icon: BarChart3,
        tag: "OT",
      },
      {
        key: "gestion",
        title: "Gestión de OT",
        desc: "Tablero: pendientes, en proceso y en revisión. Arrastrá y asigná responsables.",
        path: "/mantenimiento/OTsPage",
        icon: ClipboardList,
        tag: "OT",
      },
      {
        key: "finalizadas",
        title: "OT finalizadas",
        desc: "Órdenes de trabajo ya cerradas o finalizadas para consulta.",
        path: "/mantenimiento/ots/finalizadas",
        icon: CheckSquare,
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
          subtitle="Órdenes de trabajo"
          onClick={() => go("/mantenimiento")}
        />
        <Topbar.Right>
          <GhostButton icon={ArrowLeft} onClick={() => go("/mantenimiento")}>
            Mantenimiento
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="Submódulos"
            subtitle="Elegí si trabajás el tablero operativo o consultás OT ya finalizadas."
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
