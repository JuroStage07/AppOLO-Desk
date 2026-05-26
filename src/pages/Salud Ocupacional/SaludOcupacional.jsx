import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ClipboardList,
  HeartPulse,
  Lock,
  ScanLine,
  Stamp,
} from "lucide-react";
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

export default function SaludOcupacional() {
  const nav = useNavigate();
  const user = auth.currentUser;
  const { isPinned, togglePin } = usePinnedModules();

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "aperturas",
        title: "Aperturas",
        desc: "Gestión de aperturas y seguimiento",
        path: "/salud/aperturas",
        icon: ClipboardList,
        tag: "Operación",
      },
      {
        key: "terceros",
        title: "Ingreso de terceros",
        desc: "Control de marcas: entrada y salida automática por cédula",
        path: "/salud/control-marcas",
        icon: ScanLine,
        tag: "Prioritario",
      },
      {
        key: "visado",
        title: "Visados",
        desc: "Generar y registrar visados",
        path: "/salud/visado",
        icon: Stamp,
        tag: "Prioritario",
      },
      {
        key: "estadisticas",
        title: "Estadísticas",
        desc: "Métricas y visualización general del área",
        path: "/salud/metricas",
        icon: BarChart3,
        tag: "Analítica",
      },
      {
        key: "documentacion",
        title: "Documentación",
        desc: "Normas, políticas y documentos internos",
        path: "/documentacion",
        icon: BookOpen,
        tag: "Biblioteca",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={HeartPulse}
          title="Salud Ocupacional"
          subtitle="Panel de módulos"
          onClick={() => go("/salud")}
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
            badge={<Badge icon={Lock}>Operación</Badge>}
            aside={
              <QuickCard />
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
