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
import {
  Badge,
  Brand,
  Container,
  FooterNote,
  GhostButton,
  Hero,
  Main,
  ModuleCard,
  ModuleGrid,
  QuickCard,
  Shell,
  Topbar,
} from "../../../components/ui";

export default function OTsHubMantenimiento() {
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

  if (!permisos?.mantenimiento) return null;

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
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
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
            aside={
              <QuickCard
                actions={[
                  {
                    label: "Dashboard OTs",
                    accent: true,
                    onClick: () => go("/mantenimiento/ots/dashboard"),
                  },
                  {
                    label: "Gestión de OT (tablero)",
                    onClick: () => go("/mantenimiento/OTsPage"),
                  },
                  {
                    label: "OT finalizadas",
                    onClick: () => go("/mantenimiento/ots/finalizadas"),
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

          <FooterNote title="Tip">
            El tablero sigue en <b>/mantenimiento/OTsPage</b>. Las finalizadas usan{" "}
            <b>OTState: &quot;Finalizada&quot;</b> en Firestore cuando cierres el
            flujo desde la app.
          </FooterNote>
        </Container>
      </Main>
    </Shell>
  );
}
