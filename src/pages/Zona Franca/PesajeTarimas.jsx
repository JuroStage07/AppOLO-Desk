import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Scale, Search } from "lucide-react";
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
} from "../../components/ui";
import usePinnedModules from "../../hooks/usePinnedModules";

export default function PesajeTarimas() {
  const nav = useNavigate();
  const { isPinned, togglePin } = usePinnedModules("servicios-generales");

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
