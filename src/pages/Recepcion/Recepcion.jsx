// screens/Recepcion.jsx
import React, { useContext, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Package,
  PackageCheck,
  PackageOpen,
  Truck,
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
  QuickCard,
  Shell,
  Topbar,
} from "../../components/ui";
import usePinnedModules from "../../hooks/usePinnedModules";
import { AuthCtx } from "../../auth/AuthProvider";
import { canAccessByRoleOrPermission } from "../../config/permissions";

export default function Recepcion() {
  const nav = useNavigate();
  const location = useLocation();
  const { isPinned, togglePin } = usePinnedModules("recepcion");
  const { role, permisos, profile } = useContext(AuthCtx) || {};

  const go = (path) => nav(path);

  const canEPA =
    location?.state?.canEPA === true ||
    new URLSearchParams(location.search).get("canEPA") === "true";

  const canCofersa =
    location?.state?.canCofersa === true ||
    new URLSearchParams(location.search).get("canCofersa") === "true";

  const modules = useMemo(
    () => [
      {
        key: "descarga",
        title: "Acciones de descarga",
        desc: "Registro y seguimiento de descargas",
        path: "/recepcion/accion-descarga",
        anyPerms: ["recepcion", "canRecepcionCofersa", "despachosEPA"],
        tone: "accent",
        icon: Truck,
        tag: "Operativo",
        show: true,
      },
      {
        key: "reportes",
        title: "Reportes de Descarga",
        desc: "Panel de reportes de recepción",
        path: "/recepcion/metricas",
        anyPerms: ["recepcionReportes", "canRecepcionCofersa", "despachosEPA"],
        tone: "accent",
        icon: BarChart3,
        tag: "Dashboard",
        show: true,
      },
      {
        key: "metricas-recepcion",
        title: "Reportes de Recepción",
        desc: "Acciones de recepción generadas al finalizar descargas",
        path: "/recepcion/metricas-recepcion",
        anyPerms: ["recepcionReportes", "canRecepcionCofersa", "despachosEPA"],
        tone: "accent",
        icon: PackageCheck,
        tag: "Dashboard",
        show: true,
      },
      {
        key: "epa",
        title: "Recepción EPA",
        desc: "Módulo de recepción EPA",
        path: "/recepcion/epa",
        tone: "neutral",
        icon: PackageOpen,
        tag: "Módulo",
        show: canEPA,
      },
      {
        key: "cofersa",
        title: "Recepción Cofersa",
        desc: "Recepción de mercadería Cofersa",
        path: "/recepcion/cofersa",
        tone: "neutral",
        icon: Package,
        tag: "Módulo",
        show: canCofersa,
      },
    ],
    [canEPA, canCofersa]
  );

  const visibleModules = modules.filter((m) => m.show);
  const allowedModules = visibleModules.filter((module) =>
    canAccessByRoleOrPermission(
      { role, permisos, profile },
      { anyPerms: module.anyPerms || [] }
    )
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Truck}
          title="Recepción"
          subtitle="Panel de módulos"
          onClick={() => go("/recepcion")}
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
            subtitle="Seleccioná el flujo que necesitás. Los permisos EPA/Cofersa condicionan algunas tarjetas."
            badge={<Badge icon={Package}>Operación</Badge>}
            aside={<QuickCard moduleKey="recepcion" />}
          />

          <ModuleGrid>
            {allowedModules.map((m) => (
              <ModuleCard
                key={m.key}
                title={m.title}
                desc={m.desc}
                icon={m.icon}
                tag={m.tag}
                tone={m.tone}
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
