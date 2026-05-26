// pages/Mantenimiento.jsx
import React, { useContext, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, Lock, Settings, Wrench } from "lucide-react";
import { AuthCtx } from "../../auth/AuthProvider";
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

export default function Mantenimiento() {
  const nav = useNavigate();
  const { user, permisos, loading } = useContext(AuthCtx);

  useEffect(() => {
    if (loading) return;
    if (!permisos?.mantenimiento) {
      alert("Este usuario no puede acceder por falta de permisos.");
      nav(-1);
    }
  }, [loading, permisos, nav]);

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

  if (!permisos?.mantenimiento) return null;

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
            subtitle="Accedé al panel de equipos o a las órdenes de trabajo según tu rol."
            badge={<Badge icon={Lock}>Mantenimiento</Badge>}
            aside={
              <QuickCard
                actions={[
                  {
                    label: "Panel de equipos",
                    accent: true,
                    onClick: () => go("/mantenimiento/equipos"),
                  },
                  {
                    label: "Ver pendientes",
                    onClick: () => go("/mantenimiento/equipos?rev=pendientes"),
                  },
                ]}
              />
            }
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
              />
            ))}
          </ModuleGrid>
        </Container>
      </Main>
    </Shell>
  );
}
