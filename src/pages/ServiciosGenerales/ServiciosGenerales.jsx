import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  Lock,
  Scale,
  ScanLine,
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

export default function ServiciosGenerales() {
  const nav = useNavigate();
  const { isPinned, togglePin } = usePinnedModules("servicios-generales");

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "ordenes-trabajo",
        title: "Órdenes de trabajo",
        desc: "Solicitudes, seguimiento y cierre de OT en Servicios generales.",
        path: "/servicios-generales/ordenes-trabajo",
        icon: ClipboardList,
        tag: "Trabajo",
      },
      {
        key: "pesaje-tarimas",
        title: "Pesaje Tarimas",
        desc: "Registrá y consultá el pesaje de tarimas, incluyendo control de entradas y salidas.",
        path: "/servicios-generales/pesaje-tarimas",
        icon: Scale,
        tag: "Pesaje",
      },
      {
        key: "validar-ingreso",
        title: "Validar ingreso",
        desc: "Escaneá el QR o ingresá la cédula para validar el ingreso de colaboradores terceros.",
        path: "/servicios-generales/validar-ingreso",
        icon: ScanLine,
        tag: "Control",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ClipboardList}
          title="Servicios Generales"
          subtitle="Áreas operativas"
          onClick={() => go("/servicios-generales")}
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
            subtitle="Elegí un módulo de trabajo para ingresar. Cada uno concentra sus pantallas y flujos propios."
            badge={<Badge icon={Lock}>Servicios Generales</Badge>}
            aside={<QuickCard moduleKey="servicios-generales" />}
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
