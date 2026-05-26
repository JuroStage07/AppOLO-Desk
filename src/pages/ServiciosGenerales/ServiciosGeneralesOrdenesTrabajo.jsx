import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardList,
  LayoutGrid,
  Lock,
  Plus,
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

export default function ServiciosGeneralesOrdenesTrabajo() {
  const nav = useNavigate();
  const user = auth.currentUser;

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "crear-ot",
        title: "Crear OT",
        desc: "Alta de nuevas órdenes de trabajo: datos del requerimiento, área y envío.",
        path: "/servicios-generales/ordenes-trabajo/crear",
        icon: Plus,
        tag: "Alta",
      },
      {
        key: "gestion-ots",
        title: "Gestión de OTs",
        desc: "Seguimiento, listados, cambios de estado y cierre de órdenes abiertas.",
        path: "/servicios-generales/ordenes-trabajo/gestion",
        icon: LayoutGrid,
        tag: "Operación",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={ClipboardList}
          title="Órdenes de trabajo"
          subtitle="Servicios generales"
          onClick={() => go("/servicios-generales/ordenes-trabajo")}
        />
        <Topbar.Right>
          <Topbar.UserHint title={user?.email || ""}>
            {user?.displayName || user?.email || "Sesión activa"}
          </Topbar.UserHint>
          <GhostButton icon={ArrowLeft} onClick={() => go("/servicios-generales")}>
            Servicios generales
          </GhostButton>
        </Topbar.Right>
      </Topbar>

      <Main>
        <Container>
          <Hero
            kicker="Centro de control"
            title="Módulos"
            subtitle="Elegí cómo querés trabajar: crear nuevas OT o administrar las que ya están en curso."
            badge={<Badge icon={Lock}>Órdenes de trabajo</Badge>}
            aside={
              <QuickCard
                actions={[
                  {
                    label: "Crear OT",
                    accent: true,
                    onClick: () => go("/servicios-generales/ordenes-trabajo/crear"),
                  },
                  {
                    label: "Gestión de OTs",
                    onClick: () => go("/servicios-generales/ordenes-trabajo/gestion"),
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
            Desde «Crear OT» podés generar una nueva orden. En «Gestión de OTs» vas a ver el listado completo con filtros y cambios de estado.
          </FooterNote>
        </Container>
      </Main>
    </Shell>
  );
}
