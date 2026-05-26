import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Scale, Search } from "lucide-react";
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

export default function PesajeTarimas() {
  const nav = useNavigate();
  const user = auth.currentUser;

  const go = (path) => nav(path);

  const modules = useMemo(
    () => [
      {
        key: "registrar-tarimas",
        title: "Registrar tarimas",
        desc: "Ingresá la información del pesaje de tarimas y guardá nuevos registros.",
        path: "/servicios-generales/pesaje-tarimas/registrar",
        icon: Scale,
        tag: "Registro",
      },
      {
        key: "consultar-tarimas",
        title: "Consultar tarimas",
        desc: "Buscá y revisá registros de pesaje de tarimas ya almacenados.",
        path: "/servicios-generales/pesaje-tarimas/consultar",
        icon: Search,
        tag: "Consulta",
      },
    ],
    []
  );

  return (
    <Shell>
      <Topbar>
        <Brand
          icon={Scale}
          title="Pesaje Tarimas"
          subtitle="Zona Franca"
          onClick={() => go("/servicios-generales/pesaje-tarimas")}
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
            title="Pesaje de tarimas"
            subtitle="Seleccioná una opción para registrar nuevos pesajes o consultar registros existentes."
            badge={<Badge icon={Lock}>Zona Franca</Badge>}
            aside={
              <QuickCard
                actions={[
                  {
                    label: "Registrar tarimas",
                    accent: true,
                    onClick: () => go("/servicios-generales/pesaje-tarimas/registrar"),
                  },
                  {
                    label: "Consultar tarimas",
                    onClick: () => go("/servicios-generales/pesaje-tarimas/consultar"),
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
            Desde «Registrar tarimas» podés ingresar nuevos pesajes. En «Consultar tarimas» buscás y revisás los registros ya guardados.
          </FooterNote>
        </Container>
      </Main>
    </Shell>
  );
}
