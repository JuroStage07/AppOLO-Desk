import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  Lock,
  Scale,
  ScanLine,
} from "lucide-react";
import { auth } from "../../firebase";
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
} from "../../components/ui";

export default function ServiciosGenerales() {
  const nav = useNavigate();
  const user = auth.currentUser;

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
            subtitle="Elegí un módulo de trabajo para ingresar. Cada uno concentra sus pantallas y flujos propios."
            badge={<Badge icon={Lock}>Servicios Generales</Badge>}
            aside={
              <QuickCard
                actions={[
                  {
                    label: "Órdenes de trabajo",
                    accent: true,
                    onClick: () => go("/servicios-generales/ordenes-trabajo"),
                  },
                  {
                    label: "Pesaje Tarimas",
                    accent: true,
                    onClick: () => go("/servicios-generales/pesaje-tarimas"),
                  },
                  {
                    label: "Validar ingreso",
                    onClick: () => go("/servicios-generales/validar-ingreso"),
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
            Si un módulo no abre, revisá permisos de servicios generales en tu perfil y que la ruta esté habilitada en la app.
          </FooterNote>
        </Container>
      </Main>
    </Shell>
  );
}
